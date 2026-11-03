from datetime import UTC, timedelta

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import utcnow
from app.models import Campaign, CampaignStatus as S, CampaignStatusHistory
from app.schemas import CampaignCreate, CampaignOut, CampaignPatch, EndInput, PublishInput, RejectInput, ScheduleInput

ACTIONS = {
    S.PLANNING: ["edit", "approve"],
    S.DRAFTED: ["edit"],
    S.REVIEW_PENDING: [],
    S.APPROVED: ["schedule"],
    S.SCHEDULED: ["publish", "reject"],
    S.RUNNING: ["end"],
    S.ENDED: [],
    S.REJECTED: ["request-revision"],
    S.REVISION_REQUESTED: ["edit", "approve"],
}
TARGETS = {
    "approve": S.APPROVED, "schedule": S.SCHEDULED, "publish": S.RUNNING,
    "end": S.ENDED, "reject": S.REJECTED, "request-revision": S.REVISION_REQUESTED,
}
REVIEW_WARNING = "플랫폼 심사에 24시간 여유가 없습니다"


def owned_campaign(db: Session, campaign_id: int, owner_id: int, *, lock=False) -> Campaign:
    stmt = select(Campaign).where(Campaign.id == campaign_id, Campaign.owner_id == owner_id)
    if lock:
        stmt = stmt.with_for_update().execution_options(populate_existing=True)
    campaign = db.scalar(stmt)
    if campaign is None:
        raise HTTPException(404, "캠페인을 찾을 수 없습니다")
    return campaign


def history_snapshot(campaign: Campaign, reason: str | None = None) -> dict:
    def iso(value):
        return value.astimezone(UTC).isoformat().replace("+00:00", "Z") if value else None

    return {
        "scheduled_at": iso(campaign.scheduled_at),
        "budget_amount": campaign.budget_amount,
        "budget_days": campaign.budget_days,
        "initial_budget_amount": campaign.initial_budget_amount,
        "initial_budget_days": campaign.initial_budget_days,
        "published_at": iso(campaign.published_at),
        "ended_at": iso(campaign.ended_at),
        "rejection_reason": reason,
    }


def latest_rejection(db: Session, campaign: Campaign) -> str | None:
    if campaign.status not in (S.REJECTED, S.REVISION_REQUESTED):
        return None
    history = db.scalar(
        select(CampaignStatusHistory).where(
            CampaignStatusHistory.campaign_id == campaign.id,
            CampaignStatusHistory.next_status == S.REJECTED,
        ).order_by(CampaignStatusHistory.recorded_at.desc(), CampaignStatusHistory.id.desc()).limit(1)
    )
    return history.snapshot.get("rejection_reason") if history else None


def present(db: Session, campaign: Campaign, warnings: list[str] | None = None) -> CampaignOut:
    result = CampaignOut.model_validate(campaign)
    result.allowed_actions = ACTIONS[S(campaign.status)].copy()
    result.warnings = warnings or []
    result.rejection_reason = latest_rejection(db, campaign)
    return result


def create_campaign(db: Session, owner_id: int, data: CampaignCreate) -> CampaignOut:
    now = utcnow()
    campaign = Campaign(owner_id=owner_id, status=S.PLANNING, created_at=now, updated_at=now, **data.model_dump())
    db.add(campaign)
    db.flush()
    db.add(CampaignStatusHistory(
        campaign_id=campaign.id, previous_status=None, next_status=S.PLANNING,
        changed_by=owner_id, recorded_at=now, snapshot=history_snapshot(campaign),
    ))
    db.commit()
    return present(db, campaign)


def edit_campaign(db: Session, campaign_id: int, owner_id: int, data: CampaignPatch) -> CampaignOut:
    campaign = owned_campaign(db, campaign_id, owner_id, lock=True)
    if "edit" not in ACTIONS[S(campaign.status)]:
        raise HTTPException(409, "현재 상태에서는 광고를 수정할 수 없습니다")
    for key, value in data.model_dump(exclude_unset=True).items():
        if key == "drafts" and value is None:
            raise HTTPException(422, "drafts는 null일 수 없습니다")
        setattr(campaign, key, value)
    campaign.revision += 1
    campaign.updated_at = utcnow()
    db.commit()
    return present(db, campaign)


def transition(
    db: Session, campaign_id: int, owner_id: int, action: str,
    data: ScheduleInput | PublishInput | EndInput | RejectInput | None = None,
) -> CampaignOut:
    campaign = owned_campaign(db, campaign_id, owner_id, lock=True)
    if action not in ACTIONS[S(campaign.status)]:
        raise HTTPException(409, "현재 상태에서는 요청한 작업을 할 수 없습니다")
    now = utcnow()
    reason = None
    warnings = []
    if action == "schedule":
        scheduled_at = data.scheduled_at.astimezone(UTC)
        if scheduled_at < now:
            raise HTTPException(422, "게시 예정 시각은 과거일 수 없습니다")
        campaign.scheduled_at = scheduled_at
        campaign.budget_amount = data.budget_amount if data.budget_amount is not None else campaign.initial_budget_amount
        campaign.budget_days = data.budget_days if data.budget_days is not None else campaign.initial_budget_days
        if scheduled_at - now <= timedelta(hours=24):
            warnings.append(REVIEW_WARNING)
    elif action == "publish":
        published_at = data.published_at.astimezone(UTC) if data and data.published_at else now
        if published_at > now:
            raise HTTPException(422, "게시 시각은 미래일 수 없습니다")
        campaign.published_at = published_at
    elif action == "end":
        ended_at = data.ended_at.astimezone(UTC) if data and data.ended_at else now
        if ended_at > now or ended_at < campaign.published_at:
            raise HTTPException(422, "종료 시각은 게시 시각 이후이며 현재 시각 이전이어야 합니다")
        campaign.ended_at = ended_at
    elif action == "reject":
        reason = data.reason
    elif action == "request-revision":
        reason = latest_rejection(db, campaign)

    # Capture the old reservation before clearing it, including the rejection reason.
    snapshot = history_snapshot(campaign, reason)
    if action == "request-revision":
        campaign.scheduled_at = None
        campaign.budget_amount = None
        campaign.budget_days = None
    previous = campaign.status
    campaign.status = TARGETS[action]
    campaign.revision += 1
    campaign.updated_at = now
    db.add(CampaignStatusHistory(
        campaign_id=campaign.id, previous_status=previous, next_status=campaign.status,
        changed_by=owner_id, recorded_at=now, snapshot=snapshot,
    ))
    db.commit()
    return present(db, campaign, warnings)

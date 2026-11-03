from datetime import UTC, timedelta

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import utcnow
from app.models import Campaign, CampaignStatus as S, CampaignStatusHistory, Performance
from app.schemas import CampaignCreate, CampaignOut, CampaignPatch, EndInput, PublishInput, RejectInput, ScheduleInput

ACTIONS = {
    S.PLANNING: ["edit", "generate-draft", "cancel"],
    S.DRAFTED: ["edit", "request-review", "cancel"],
    S.REVIEW_PENDING: ["cancel"],
    S.APPROVED: ["schedule", "cancel"],
    S.SCHEDULED: ["publish", "reject", "cancel"],
    S.RUNNING: ["end"],
    S.ENDED: ["save-performance"],
    S.REJECTED: ["request-revision", "cancel"],
    S.REVISION_REQUESTED: ["edit", "request-review", "cancel"],
    S.CANCELED: [],
    S.EVALUATED: [],
}
TARGETS = {
    "approve": S.APPROVED, "schedule": S.SCHEDULED, "publish": S.RUNNING,
    "end": S.ENDED, "reject": S.REJECTED, "request-revision": S.REVISION_REQUESTED,
    "cancel": S.CANCELED,
}
REVIEW_WARNING = "플랫폼 심사에 24시간 여유가 없습니다"


def can_approve(campaign: Campaign) -> bool:
    return bool(
        campaign.status == S.REVIEW_PENDING and campaign.review
        and campaign.review.get("status") == "completed"
        and campaign.review_revision == campaign.revision
    )


def review_retryable(campaign: Campaign) -> bool:
    return bool(campaign.status == S.REVIEW_PENDING and campaign.review and (
        campaign.review.get("status") == "failed" or (
            campaign.review.get("status") == "running" and utcnow() - campaign.updated_at >= timedelta(seconds=180)
        )
    ))


def allowed_actions(campaign: Campaign) -> list[str]:
    actions = ACTIONS[S(campaign.status)].copy()
    if can_approve(campaign):
        actions.extend(["approve", "request-revision"])
        if campaign.review["findings"]:
            actions.append("apply-suggestion")
    elif review_retryable(campaign):
        actions.extend(["request-review", "request-revision"])
    if campaign.status == S.REVISION_REQUESTED and campaign.review and campaign.review.get("status") == "completed" and campaign.review_revision == campaign.revision and campaign.review["findings"]:
        actions.append("apply-suggestion")
    return actions


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
        "review_revision": campaign.review_revision,
        "review_finding_count": len(campaign.review["findings"]) if campaign.review and campaign.review.get("status") == "completed" else None,
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
    result.allowed_actions = allowed_actions(campaign)
    result.can_approve = can_approve(campaign)
    result.warnings = warnings or []
    result.rejection_reason = latest_rejection(db, campaign)
    if campaign.status == S.ENDED:
        performance = db.scalar(select(Performance).where(Performance.campaign_id == campaign.id))
        if performance:
            if performance.summary_status != "running" or utcnow() - performance.updated_at >= timedelta(seconds=180):
                result.allowed_actions.append("summarize-performance")
            result.can_complete_evaluation = bool(performance.summary_status == "completed" and performance.summary and performance.next_ad_suggestions)
            if result.can_complete_evaluation:
                result.allowed_actions.append("complete-evaluation")
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
    if "edit" not in allowed_actions(campaign):
        raise HTTPException(409, "현재 상태에서는 광고를 수정할 수 없습니다")
    changes = data.model_dump(exclude_unset=True)
    previous_channels = list(campaign.channels)
    if campaign.status != S.PLANNING and previous_channels and "channels" in changes and changes["channels"] != campaign.channels:
        raise HTTPException(409, "초안 생성 후에는 채널을 변경할 수 없습니다")
    if "content" in changes and "drafts" in changes:
        raise HTTPException(422, "content와 drafts는 한 번에 하나만 수정해 주세요")
    for key, value in changes.items():
        if key == "drafts" and value is None:
            raise HTTPException(422, "drafts는 null일 수 없습니다")
        setattr(campaign, key, value)
    if campaign.status == S.REVISION_REQUESTED and not previous_channels and campaign.channels and not campaign.drafts:
        # Legacy F-04 campaigns had only content; an explicit first channel selection upgrades them.
        campaign.drafts = {channel: {"caption": campaign.content, "hashtags": []} for channel in campaign.channels}
    if campaign.drafts or ("drafts" in changes and campaign.status != S.PLANNING):
        from copy import deepcopy
        from app.reviews import validated_drafts
        drafts = deepcopy(campaign.drafts)
        if "content" in changes:
            for draft in drafts.values():
                draft["caption"] = changes["content"]
        campaign.drafts = validated_drafts(campaign, drafts)
        campaign.content = campaign.drafts[campaign.channels[0]]["caption"]
    if campaign.review:
        campaign.review = {**campaign.review, "status": "stale"}
    campaign.revision += 1
    campaign.updated_at = utcnow()
    db.commit()
    return present(db, campaign)


def transition(
    db: Session, campaign_id: int, owner_id: int, action: str,
    data: ScheduleInput | PublishInput | EndInput | RejectInput | None = None,
) -> CampaignOut:
    campaign = owned_campaign(db, campaign_id, owner_id, lock=True)
    if action not in allowed_actions(campaign):
        if action == "cancel" and campaign.status in (S.RUNNING, S.ENDED, S.EVALUATED):
            raise HTTPException(409, "이미 올린 광고는 플랫폼에서 직접 중지해 주세요")
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
    if action == "request-revision" and campaign.status == S.REJECTED:
        campaign.scheduled_at = None
        campaign.budget_amount = None
        campaign.budget_days = None
        if campaign.review:
            campaign.review = {**campaign.review, "status": "stale"}
    previous = campaign.status
    campaign.status = TARGETS[action]
    campaign.revision += 1
    if action == "request-revision" and previous == S.REVIEW_PENDING and campaign.review and campaign.review.get("status") == "completed":
        # Moving to revision does not itself edit text, so suggestions remain applicable.
        campaign.review_revision = campaign.revision
    campaign.updated_at = now
    db.add(CampaignStatusHistory(
        campaign_id=campaign.id, previous_status=previous, next_status=campaign.status,
        changed_by=owner_id, recorded_at=now, snapshot=snapshot,
    ))
    db.commit()
    return present(db, campaign, warnings)

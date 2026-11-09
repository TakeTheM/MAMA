from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import campaign_service as service
from app.database import utcnow
from app.llm import LLMClient
from app.models import Campaign, CampaignStatus as S
from app.schemas import PerformanceInput, PerformanceOut, PerformanceSummary


def creative(campaign: Campaign) -> dict:
    if campaign.channels and campaign.drafts:
        return {"drafts": {channel: campaign.drafts[channel] for channel in campaign.channels if channel in campaign.drafts}}
    return {"content": campaign.content}


def feedback_context(db: Session, owner_id: int) -> tuple[int | None, dict | None]:
    campaign = db.scalar(
        select(Campaign).where(Campaign.owner_id == owner_id, Campaign.status == S.EVALUATED)
        .order_by(Campaign.evaluated_at.desc(), Campaign.id.desc()).limit(1)
    )
    if campaign is None:
        return None, None
    metrics = {name: campaign.performance[name] for name in (*PerformanceInput.model_fields, "roas")}
    return campaign.id, {**creative(campaign), "metrics": metrics, "summary": campaign.performance["summary"]}


def present(campaign: Campaign) -> PerformanceOut:
    if campaign.performance is None:
        raise HTTPException(404, "성과 입력을 찾을 수 없습니다")
    return PerformanceOut(**campaign.performance, evaluated_at=campaign.evaluated_at)


def generate(db: Session, campaign_id: int, owner_id: int, data: PerformanceInput, llm: LLMClient):
    campaign = service.owned_campaign(db, campaign_id, owner_id, lock=True)
    if campaign.status != S.ENDED:
        raise HTTPException(409, "종료된 캠페인에서만 성과를 입력할 수 있습니다")

    metrics = {**data.model_dump(), "roas": data.revenue / data.ad_spend if data.ad_spend else None}
    payload = {**creative(campaign), "metrics": metrics}
    campaign.performance = {**metrics, "status": "pending"}
    campaign.updated_at = utcnow()
    campaign.revision += 1
    revision = campaign.revision
    db.commit()

    error = None
    try:
        summary = llm.complete("performance", payload, PerformanceSummary)
    except HTTPException as exc:
        error = exc

    campaign = service.owned_campaign(db, campaign_id, owner_id, lock=True)
    if campaign.status != S.ENDED or campaign.revision != revision:
        raise HTTPException(409, "성과 입력이 변경되어 결과를 저장하지 않았습니다")
    campaign.performance = (
        {**metrics, "status": "failed"} if error else {**metrics, **summary.model_dump(), "status": "ready"}
    )
    campaign.updated_at = utcnow()
    db.commit()
    if error:
        raise error
    return present(campaign)


def complete(db: Session, campaign_id: int, owner_id: int):
    campaign = service.owned_campaign(db, campaign_id, owner_id, lock=True)
    if "complete-performance" not in service.allowed_actions(campaign):
        raise HTTPException(409, "현재 성과 입력의 요약을 확인한 뒤 평가를 완료할 수 있습니다")
    now = utcnow()
    campaign.evaluated_at = now
    campaign.performance = {**campaign.performance, "status": "completed"}
    service.record_transition(db, campaign, S.EVALUATED, now)
    db.commit()
    return present(campaign)

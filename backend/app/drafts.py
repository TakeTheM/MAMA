from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.campaign_service import history_snapshot, owned_campaign, present
from app.database import utcnow
from app.llm import LLMClient
from app.models import Campaign, CampaignStatus as S, CampaignStatusHistory, Performance
from app.schemas import DraftResult


def feedback_context(db: Session, owner_id: int) -> tuple[int | None, dict | None]:
    from app.performance import metric_payload
    row = db.execute(
        select(Campaign, Performance).join(Performance, Performance.campaign_id == Campaign.id)
        .where(Campaign.owner_id == owner_id, Campaign.status == S.EVALUATED, Performance.evaluated_at.is_not(None))
        .order_by(Performance.evaluated_at.desc(), Campaign.id.desc()).limit(1)
    ).first()
    if row is None:
        return None, None
    previous, performance = row
    return previous.id, {
        "ad_copy": {"content": previous.content, "drafts": previous.drafts},
        "metrics": metric_payload(performance), "summary": performance.summary,
        "next_ad_suggestions": performance.next_ad_suggestions,
    }


def generate(db: Session, campaign_id: int, owner_id: int, llm: LLMClient):
    campaign = owned_campaign(db, campaign_id, owner_id, lock=True)
    if campaign.status != S.PLANNING:
        raise HTTPException(409, "기획중에서만 초안을 생성할 수 있습니다")
    required = ("product_name", "product_description", "goal", "channels")
    missing = [field for field in required if not getattr(campaign, field)]
    if campaign.product_price is None:
        missing.append("product_price")
    if missing:
        raise HTTPException(422, "초안 생성에 필요한 입력: " + ", ".join(missing))
    revision = campaign.revision
    channels = list(campaign.channels)
    reference_id, previous = feedback_context(db, owner_id)
    payload = {key: getattr(campaign, key) for key in (
        "product_name", "product_description", "product_price", "goal", "target_audience", "channels",
        "initial_budget_amount", "initial_budget_days",
    )}
    if previous is not None:
        payload["previous_campaign"] = previous
    db.commit()  # Never hold a database lock while waiting for a provider.
    result = llm.complete("draft", payload, DraftResult)
    if set(result.drafts) != set(channels):
        raise HTTPException(502, "선택한 모든 채널의 초안이 필요합니다")
    campaign = owned_campaign(db, campaign_id, owner_id, lock=True)
    if campaign.status != S.PLANNING or campaign.revision != revision:
        raise HTTPException(409, "생성 중 캠페인이 변경되어 결과를 저장하지 않았습니다")
    campaign.drafts = result.model_dump()["drafts"]
    campaign.content = result.drafts[channels[0]].caption
    campaign.reference_campaign_id = reference_id
    campaign.status = S.DRAFTED
    campaign.revision += 1
    campaign.updated_at = utcnow()
    db.add(CampaignStatusHistory(
        campaign_id=campaign.id, previous_status=S.PLANNING, next_status=S.DRAFTED,
        changed_by=owner_id, recorded_at=campaign.updated_at, snapshot=history_snapshot(campaign),
    ))
    db.commit()
    return present(db, campaign)

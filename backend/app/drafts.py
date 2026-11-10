from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.campaign_service import get_campaign, present, record_transition
from app.database import utcnow
from app.llm import LLMClient
from app.models import CampaignStatus as S
from app.performance import feedback_context
from app.schemas import DraftResult


def generate(db: Session, campaign_id: int, llm: LLMClient):
    campaign = get_campaign(db, campaign_id, lock=True)
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
    reference_id, previous = feedback_context(db)
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
    campaign = get_campaign(db, campaign_id, lock=True)
    if campaign.status != S.PLANNING or campaign.revision != revision:
        raise HTTPException(409, "생성 중 캠페인이 변경되어 결과를 저장하지 않았습니다")
    campaign.drafts = result.model_dump()["drafts"]
    campaign.content = result.drafts[channels[0]].caption
    campaign.reference_campaign_id = reference_id
    record_transition(db, campaign, S.DRAFTED, utcnow())
    db.commit()
    return present(db, campaign)

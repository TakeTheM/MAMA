from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.campaign_service import history_snapshot, owned_campaign, present
from app.database import utcnow
from app.llm import LLMClient
from app.models import CampaignStatus as S, CampaignStatusHistory, Performance
from app.schemas import PerformanceInput, PerformanceOut, SummaryResult


def metric_payload(performance: Performance) -> dict:
    metrics = {key: getattr(performance, key) for key in ("impressions", "clicks", "conversions", "ad_spend", "revenue")}
    metrics["roas"] = str(performance.roas) if performance.roas is not None else None
    return metrics


def present_performance(performance: Performance) -> PerformanceOut:
    result = PerformanceOut.model_validate(performance)
    result.roas_display = str(performance.roas) if performance.roas is not None else "계산할 수 없음"
    return result


def get_record(db: Session, campaign_id: int, *, lock=False) -> Performance:
    stmt = select(Performance).where(Performance.campaign_id == campaign_id)
    if lock:
        stmt = stmt.with_for_update().execution_options(populate_existing=True)
    result = db.scalar(stmt)
    if result is None:
        raise HTTPException(404, "저장된 성과가 없습니다")
    return result


def get_performance(db: Session, campaign_id: int, owner_id: int) -> PerformanceOut:
    owned_campaign(db, campaign_id, owner_id)
    return present_performance(get_record(db, campaign_id))


def require_ended(campaign):
    if campaign.status != S.ENDED:
        raise HTTPException(409, "종료 캠페인에서만 성과를 입력·요약·확정할 수 있습니다")


def save(db: Session, campaign_id: int, owner_id: int, data: PerformanceInput, llm: LLMClient):
    campaign = owned_campaign(db, campaign_id, owner_id, lock=True)
    require_ended(campaign)
    performance = db.scalar(select(Performance).where(Performance.campaign_id == campaign_id).with_for_update())
    if performance is None:
        performance = Performance(campaign_id=campaign_id, revision=0)
        db.add(performance)
    for key, value in data.model_dump().items():
        setattr(performance, key, value)
    performance.roas = (Decimal(data.revenue) / Decimal(data.ad_spend)).quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP) if data.ad_spend else None
    performance.summary = None
    performance.next_ad_suggestions = []
    performance.summary_status = "pending"
    performance.last_error = None
    performance.revision += 1
    performance.updated_at = utcnow()
    campaign.revision += 1
    campaign.updated_at = performance.updated_at
    revision = performance.revision
    db.commit()  # Numeric inputs survive every provider error.
    return summarize(db, campaign_id, owner_id, llm, expected_revision=revision)


def current_result_target(db, campaign_id, owner_id, campaign_revision, performance_revision):
    campaign = owned_campaign(db, campaign_id, owner_id, lock=True)
    require_ended(campaign)
    performance = get_record(db, campaign_id, lock=True)
    if campaign.revision != campaign_revision or performance.revision != performance_revision:
        raise HTTPException(409, "요약 중 성과가 변경되어 오래된 결과를 저장하지 않았습니다")
    return performance


def summarize(db: Session, campaign_id: int, owner_id: int, llm: LLMClient, expected_revision: int | None = None):
    campaign = owned_campaign(db, campaign_id, owner_id, lock=True)
    require_ended(campaign)
    performance = get_record(db, campaign_id, lock=True)
    if expected_revision is not None and expected_revision != performance.revision:
        raise HTTPException(409, "입력된 성과가 변경되었습니다")
    if performance.summary_status == "running" and utcnow() - performance.updated_at < timedelta(seconds=180):
        raise HTTPException(409, "이미 성과 요약을 작성하고 있습니다")
    performance.summary_status = "running"
    performance.summary = None
    performance.next_ad_suggestions = []
    performance.last_error = None
    performance.revision += 1
    campaign.revision += 1
    performance.updated_at = utcnow()
    campaign.updated_at = performance.updated_at
    performance_revision, campaign_revision = performance.revision, campaign.revision
    payload = {"ad_copy": {"content": campaign.content, "drafts": campaign.drafts}, "metrics": metric_payload(performance)}
    db.commit()
    try:
        result = llm.complete("performance", payload, SummaryResult)
    except HTTPException as error:
        performance = current_result_target(db, campaign_id, owner_id, campaign_revision, performance_revision)
        performance.summary_status = "failed"
        performance.last_error = error.detail
        performance.updated_at = utcnow()
        db.commit()
        raise
    performance = current_result_target(db, campaign_id, owner_id, campaign_revision, performance_revision)
    performance.summary = result.summary
    performance.next_ad_suggestions = result.next_ad_suggestions
    performance.summary_status = "completed"
    performance.last_error = None
    performance.updated_at = utcnow()
    db.commit()
    return present_performance(performance)


def complete_evaluation(db: Session, campaign_id: int, owner_id: int):
    campaign = owned_campaign(db, campaign_id, owner_id, lock=True)
    require_ended(campaign)
    performance = get_record(db, campaign_id, lock=True)
    if performance.summary_status != "completed" or not performance.summary or not performance.next_ad_suggestions:
        raise HTTPException(409, "성과 요약과 다음 광고 제안을 확인한 후 평가를 완료해 주세요")
    campaign.status = S.EVALUATED
    campaign.revision += 1
    campaign.updated_at = utcnow()
    performance.evaluated_at = campaign.updated_at
    db.add(CampaignStatusHistory(
        campaign_id=campaign.id, previous_status=S.ENDED, next_status=S.EVALUATED,
        changed_by=owner_id, recorded_at=campaign.updated_at, snapshot={**history_snapshot(campaign), "metrics": metric_payload(performance)},
    ))
    db.commit()
    return present(db, campaign)

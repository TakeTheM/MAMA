from copy import deepcopy

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.campaign_service import history_snapshot, owned_campaign, present, review_retryable
from app.database import utcnow
from app.llm import LLMClient
from app.models import CampaignStatus as S, CampaignStatusHistory
from app.review_rules import SOURCES, checked_findings, draft_text
from app.schemas import ChannelDraft, ReviewInput, ReviewResult


def validated_drafts(campaign, drafts: dict | None = None) -> dict:
    value = campaign.drafts if drafts is None else drafts
    if not campaign.channels or set(value) != set(campaign.channels):
        raise HTTPException(422, "선택한 모든 채널의 캡션과 해시태그가 필요합니다")
    try:
        return {channel: ChannelDraft.model_validate(draft).model_dump() for channel, draft in value.items()}
    except ValidationError:
        raise HTTPException(422, "빈 캡션 등 올바르지 않은 초안이 있습니다") from None


def current_operation(db, campaign_id, owner_id, revision):
    campaign = owned_campaign(db, campaign_id, owner_id, lock=True)
    if campaign.status != S.REVIEW_PENDING or campaign.revision != revision:
        raise HTTPException(409, "검수 중 캠페인이 변경되어 결과를 저장하지 않았습니다")
    return campaign


def request_review(db: Session, campaign_id: int, owner_id: int, llm: LLMClient, data: ReviewInput | None):
    campaign = owned_campaign(db, campaign_id, owner_id, lock=True)
    retry = review_retryable(campaign)
    if campaign.status not in (S.DRAFTED, S.REVISION_REQUESTED) and not retry:
        raise HTTPException(409, "초안 생성됨·수정 요청 또는 검수 실패 상태에서만 요청할 수 있습니다")
    drafts = validated_drafts(campaign, data.model_dump()["drafts"] if data else None)
    previous = campaign.status
    campaign.drafts = drafts
    campaign.content = drafts[campaign.channels[0]]["caption"]
    campaign.status = S.REVIEW_PENDING
    campaign.revision += 1
    campaign.review_revision = None
    campaign.review = {"status": "running", "findings": [], "error": None, "policy": "warn"}
    campaign.updated_at = utcnow()
    revision = campaign.revision
    # Only ad text, category and the team's public source catalog go to the provider.
    payload = {"drafts": deepcopy(drafts), "product_category": campaign.product_category, "approved_sources": SOURCES}
    if previous != S.REVIEW_PENDING:
        db.add(CampaignStatusHistory(
            campaign_id=campaign.id, previous_status=previous, next_status=S.REVIEW_PENDING,
            changed_by=owner_id, recorded_at=campaign.updated_at, snapshot=history_snapshot(campaign),
        ))
    db.commit()
    try:
        result = llm.complete("review", payload, ReviewResult)
        findings = checked_findings(result.findings, drafts, payload["product_category"])
    except HTTPException as error:
        campaign = current_operation(db, campaign_id, owner_id, revision)
        campaign.review = {"status": "failed", "findings": [], "error": error.detail, "policy": "warn"}
        campaign.updated_at = utcnow()
        db.commit()
        raise
    campaign = current_operation(db, campaign_id, owner_id, revision)
    campaign.review = {"status": "completed", "findings": findings, "error": None, "policy": "warn"}
    campaign.review_revision = revision
    campaign.updated_at = utcnow()
    db.commit()
    return present(db, campaign)


def apply_suggestion(db: Session, campaign_id: int, owner_id: int, index: int):
    campaign = owned_campaign(db, campaign_id, owner_id, lock=True)
    review = campaign.review
    if campaign.status not in (S.REVIEW_PENDING, S.REVISION_REQUESTED) or not review or review.get("status") != "completed" or campaign.review_revision != campaign.revision:
        raise HTTPException(409, "현재 문구와 일치하는 검수 결과가 필요합니다")
    if index >= len(review["findings"]):
        raise HTTPException(422, "수정안 번호가 올바르지 않습니다")
    finding = review["findings"][index]
    drafts = deepcopy(campaign.drafts)
    draft = drafts[finding["channel"]]
    text = draft_text(draft, finding["field"])
    if text[finding["start"]:finding["end"]] != finding["expression"]:
        raise HTTPException(409, "문구가 변경되어 수정안을 적용할 수 없습니다")
    replacement = text[:finding["start"]] + finding["replacement"] + text[finding["end"]:]
    draft[finding["field"]] = replacement if finding["field"] == "caption" else replacement.split()
    drafts = validated_drafts(campaign, drafts)
    previous = campaign.status
    campaign.drafts = drafts
    campaign.content = drafts[campaign.channels[0]]["caption"]
    campaign.status = S.REVISION_REQUESTED
    campaign.revision += 1
    campaign.updated_at = utcnow()
    campaign.review = {**review, "status": "stale"}
    if previous != S.REVISION_REQUESTED:
        db.add(CampaignStatusHistory(
            campaign_id=campaign.id, previous_status=previous, next_status=S.REVISION_REQUESTED,
            changed_by=owner_id, recorded_at=campaign.updated_at, snapshot=history_snapshot(campaign),
        ))
    db.commit()
    return present(db, campaign)

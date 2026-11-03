from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import campaign_service as service
from app.database import get_db
from app.models import Campaign, CampaignStatusHistory
from app.schemas import (
    CampaignCreate, CampaignList, CampaignOut, CampaignPatch, EndInput,
    HistoryOut, PublishInput, RejectInput, ScheduleInput,
)
from app.security import Principal, get_principal
from app.llm import LLMClient, get_llm
from app import drafts
from app import reviews
from app.review_rules import SOURCES, TERMS
from app.schemas import ApplySuggestionInput, ReviewInput, ReviewOut

router = APIRouter(prefix="/api/v1/campaigns", tags=["캠페인"])
DB = Annotated[Session, Depends(get_db)]
Authenticated = Annotated[Principal, Depends(get_principal)]
CampaignID = Annotated[int, Path(gt=0, le=9_223_372_036_854_775_807)]


@router.get("/review-sources", summary="검수 근거 허용 목록과 팀 위험 표현 규칙")
def review_sources(principal: Authenticated):
    return {"sources": SOURCES, "terms": TERMS, "policy": "warn", "notice": "위험 표현 제안이며 법적 판단을 확정하지 않습니다"}


@router.post("/{campaign_id}/request-review", response_model=CampaignOut, summary="검수 요청·재검수 (경고 정책)")
def request_review(campaign_id: CampaignID, principal: Authenticated, db: DB, llm: Annotated[LLMClient, Depends(get_llm)], data: ReviewInput | None = None):
    return reviews.request_review(db, campaign_id, principal.user.id, llm, data)


@router.get("/{campaign_id}/review", response_model=ReviewOut | None)
def get_review(campaign_id: CampaignID, principal: Authenticated, db: DB):
    return service.owned_campaign(db, campaign_id, principal.user.id).review


@router.post("/{campaign_id}/apply-suggestion", response_model=CampaignOut)
def apply_suggestion(campaign_id: CampaignID, data: ApplySuggestionInput, principal: Authenticated, db: DB):
    return reviews.apply_suggestion(db, campaign_id, principal.user.id, data.finding_index)


@router.post("/{campaign_id}/generate-draft", response_model=CampaignOut, summary="F-01 채널별 초안 생성")
def generate_draft(campaign_id: CampaignID, principal: Authenticated, db: DB, llm: Annotated[LLMClient, Depends(get_llm)]):
    return drafts.generate(db, campaign_id, principal.user.id, llm)


@router.post("", response_model=CampaignOut, status_code=201)
def create(data: CampaignCreate, principal: Authenticated, db: DB):
    return service.create_campaign(db, principal.user.id, data)


@router.get("", response_model=CampaignList)
def list_campaigns(
    principal: Authenticated, db: DB,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    campaigns = db.scalars(
        select(Campaign).where(Campaign.owner_id == principal.user.id)
        .order_by(Campaign.created_at.desc(), Campaign.id.desc()).limit(limit).offset(offset)
    ).all()
    return CampaignList(items=[service.present(db, campaign) for campaign in campaigns], limit=limit, offset=offset)


@router.get("/{campaign_id}", response_model=CampaignOut)
def detail(campaign_id: CampaignID, principal: Authenticated, db: DB):
    return service.present(db, service.owned_campaign(db, campaign_id, principal.user.id))


@router.patch("/{campaign_id}", response_model=CampaignOut)
def edit(campaign_id: CampaignID, data: CampaignPatch, principal: Authenticated, db: DB):
    return service.edit_campaign(db, campaign_id, principal.user.id, data)


@router.get("/{campaign_id}/history", response_model=list[HistoryOut])
def history(campaign_id: CampaignID, principal: Authenticated, db: DB):
    service.owned_campaign(db, campaign_id, principal.user.id)
    return db.scalars(
        select(CampaignStatusHistory).where(CampaignStatusHistory.campaign_id == campaign_id)
        .order_by(CampaignStatusHistory.recorded_at, CampaignStatusHistory.id)
    ).all()


@router.post("/{campaign_id}/approve", response_model=CampaignOut,
             summary="수동 승인 (임시 경로, AI 검수 통과를 의미하지 않음)")
def approve(campaign_id: CampaignID, principal: Authenticated, db: DB):
    return service.transition(db, campaign_id, principal.user.id, "approve")


@router.post("/{campaign_id}/schedule", response_model=CampaignOut)
def schedule(campaign_id: CampaignID, data: ScheduleInput, principal: Authenticated, db: DB):
    return service.transition(db, campaign_id, principal.user.id, "schedule", data)


@router.post("/{campaign_id}/publish", response_model=CampaignOut)
def publish(campaign_id: CampaignID, principal: Authenticated, db: DB, data: PublishInput | None = None):
    return service.transition(db, campaign_id, principal.user.id, "publish", data)


@router.post("/{campaign_id}/end", response_model=CampaignOut)
def end(campaign_id: CampaignID, principal: Authenticated, db: DB, data: EndInput | None = None):
    return service.transition(db, campaign_id, principal.user.id, "end", data)


@router.post("/{campaign_id}/reject", response_model=CampaignOut)
def reject(campaign_id: CampaignID, data: RejectInput, principal: Authenticated, db: DB):
    return service.transition(db, campaign_id, principal.user.id, "reject", data)


@router.post("/{campaign_id}/request-revision", response_model=CampaignOut)
def request_revision(campaign_id: CampaignID, principal: Authenticated, db: DB):
    return service.transition(db, campaign_id, principal.user.id, "request-revision")

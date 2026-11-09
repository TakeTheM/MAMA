import re

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app import campaign_service as service
from app.database import utcnow
from app.llm import LLMClient, REVIEW_EVIDENCE
from app.models import CampaignStatus as S
from app.schemas import ReviewFinding, ReviewRequest, ReviewResult

# Seed phrases are review triggers, not legal determinations.
FIXED_PHRASES = (
    (r"100\s*%\s*효과", "R3", "효과를 단정하는 표현입니다.", "상품의 특징을 직접 확인해 보세요."),
    (r"만병\s*통치", "R4", "질병 치료 효과로 오인될 수 있는 표현입니다.", "상품의 상세 정보를 확인해 보세요."),
)


def validated_findings(texts, findings):
    by_location = {}
    for finding in findings:
        text = texts.get(finding.channel, "")
        if not finding.start < finding.end <= len(text) or text[finding.start:finding.end] != finding.quote:
            raise HTTPException(502, "검수 결과의 원문 위치를 확인할 수 없습니다")
        if finding.evidence_url not in REVIEW_EVIDENCE[finding.rule]:
            finding = finding.model_copy(update={"evidence_url": None})
        by_location[(finding.channel, finding.start, finding.end, finding.rule)] = finding
    for channel, text in texts.items():
        for pattern, rule, reason, suggestion in FIXED_PHRASES:
            for match in re.finditer(pattern, text):
                key = (channel, match.start(), match.end(), rule)
                by_location.setdefault(key, ReviewFinding(
                    channel=channel, start=match.start(), end=match.end(), quote=match.group(),
                    rule=rule, reason=reason, suggestion=suggestion,
                    evidence_url=REVIEW_EVIDENCE[rule][0] if rule == "R3" else None,
                ))
    return [finding.model_dump() for finding in by_location.values()]


def request_review(db: Session, campaign_id: int, owner_id: int, data: ReviewRequest | None, llm: LLMClient):
    campaign = service.owned_campaign(db, campaign_id, owner_id, lock=True)
    if "request-review" not in service.allowed_actions(campaign):
        raise HTTPException(409, "현재 상태에서는 검수를 요청할 수 없습니다")
    if data is not None and data.drafts is not None:
        if campaign.status == S.REVIEW_PENDING:
            raise HTTPException(409, "검수 대기 중에는 초안을 수정할 수 없습니다")
        if not campaign.channels:
            raise HTTPException(422, "채널이 없는 캠페인은 content로 검수합니다")
        campaign.drafts = data.model_dump()["drafts"]
    if campaign.channels:
        if set(campaign.drafts) != set(campaign.channels):
            raise HTTPException(422, "선택한 모든 채널의 초안이 필요합니다")
        campaign.content = campaign.drafts[campaign.channels[0]]["caption"]
        texts = {
            channel: "\n".join([draft["caption"], *draft["hashtags"]])
            for channel, draft in campaign.drafts.items()
        }
    else:
        if not campaign.content.strip():
            raise HTTPException(422, "검수할 광고 문구가 필요합니다")
        texts = {"legacy": campaign.content}

    payload = {"texts": texts, "product_category": campaign.product_category}
    now = utcnow()
    if campaign.status != S.REVIEW_PENDING:
        service.record_transition(db, campaign, S.REVIEW_PENDING, now)
    else:
        campaign.revision += 1
        campaign.updated_at = now
    revision = campaign.revision
    campaign.review = {"status": "pending", "findings": []}
    db.commit()

    error = None
    try:
        result = llm.complete("review", payload, ReviewResult)
        findings = validated_findings(texts, result.findings)
    except HTTPException as exc:
        error = exc
        findings = []

    campaign = service.owned_campaign(db, campaign_id, owner_id, lock=True)
    if campaign.status != S.REVIEW_PENDING or campaign.revision != revision:
        raise HTTPException(409, "검수 요청이 변경되어 결과를 저장하지 않았습니다")
    now = utcnow()
    status = "failed" if error else "changes_requested" if findings else "passed"
    campaign.review = {"status": status, "findings": findings}
    if findings:
        service.record_transition(db, campaign, S.REVISION_REQUESTED, now)
    else:
        campaign.updated_at = now
    db.commit()
    if error:
        raise error
    return service.present(db, campaign)

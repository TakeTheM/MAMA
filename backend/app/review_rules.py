"""Team source cards supply the allowlist; these heuristics are warnings, not legal verdicts."""
from app.schemas import Finding

SOURCES = {
    "R1": ["https://www.law.go.kr/행정규칙/추천ㆍ보증등에관한표시ㆍ광고심사지침"],
    "R3": ["https://www.law.go.kr/법령/표시ㆍ광고의공정화에관한법률/제3조"],
    "R4": ["https://www.law.go.kr/법령/식품등의표시ㆍ광고에관한법률/제8조", "https://www.law.go.kr/법령/화장품법/제13조"],
    "R5": ["https://transparency.meta.com/policies/ad-standards/"],
}
TERMS = {
    "R3": ["100% 보장", "무조건 효과", "부작용 없음"],
    "R4": ["암 완치", "당뇨 치료", "질병 치료"],
    "R5": ["멍청이", "쓰레기 인간"],
}


def draft_text(draft: dict, field: str) -> str:
    return draft["caption"] if field == "caption" else " ".join(draft["hashtags"])


def rule_findings(drafts: dict, category: str | None) -> list[Finding]:
    findings = []
    for channel, draft in drafts.items():
        for field in ("caption", "hashtags"):
            text = draft_text(draft, field)
            for rule_id, terms in TERMS.items():
                if rule_id == "R4" and not any(value in (category or "").lower() for value in ("식품", "화장품", "food", "cosmetic")):
                    continue
                for term in terms:
                    start = text.find(term)
                    while start >= 0:
                        findings.append(Finding(
                            channel=channel, field=field, start=start, end=start + len(term),
                            expression=term, rule_id=rule_id, reason="팀의 위험 표현 목록과 일치합니다. 문맥과 근거 자료를 확인해 주세요.",
                            source_urls=SOURCES[rule_id], replacement="제품 정보를 확인해 주세요",
                        ))
                        start = text.find(term, start + len(term))
        full_text = draft["caption"] + " " + " ".join(draft["hashtags"])
        if any(word in full_text for word in ("협찬", "제품 제공", "무상 제공")) and not any(word in full_text for word in ("#광고", "#협찬")):
            expression = draft["caption"][:10]
            findings.append(Finding(
                channel=channel, start=0, end=len(expression), expression=expression, rule_id="R1",
                reason="협찬 관련 문구가 있으나 광고 표시를 찾지 못했습니다. 표시 여부와 위치를 확인해 주세요.",
                source_urls=SOURCES["R1"], replacement="#광고 " + expression,
            ))
    return findings


def checked_findings(result: list[Finding], drafts: dict, category: str | None) -> list[dict]:
    from fastapi import HTTPException

    combined = rule_findings(drafts, category)
    for finding in result:
        if finding.channel not in drafts:
            raise HTTPException(502, "검수 결과에 선택하지 않은 채널이 있습니다")
        text = draft_text(drafts[finding.channel], finding.field)
        if finding.start >= finding.end or finding.end > len(text) or text[finding.start:finding.end] != finding.expression:
            raise HTTPException(502, "검수 결과의 표현 위치가 원문과 일치하지 않습니다")
        finding.source_urls = [url for url in finding.source_urls if url in SOURCES[finding.rule_id]]
        combined.append(finding)
    unique = {}
    for finding in combined:
        key = (finding.channel, finding.field, finding.start, finding.end, finding.rule_id)
        unique.setdefault(key, finding.model_dump())
    return list(unique.values())

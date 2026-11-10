from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Event

import pytest
from fastapi import HTTPException

from app.database import utcnow
from app.llm import LLMClient
from test_campaigns import BASE, CAMPAIGN

pytestmark = pytest.mark.mysql

PLANNING = {
    **CAMPAIGN, "product_name": "빵", "product_description": "갓 구운 빵",
    "product_price": 3000, "goal": "판매", "channels": ["instagram"],
}
METRICS = {"impressions": 100, "clicks": 10, "conversions": 2, "ad_spend": 1000, "revenue": 3000}


@pytest.fixture
def provider(monkeypatch):
    calls = []

    def complete(self, task, payload, output_type):
        calls.append((task, payload))
        if task == "draft":
            return output_type(drafts={"instagram": {"caption": "갓 구운 빵", "hashtags": ["#빵"]}})
        if task == "review":
            return output_type(findings=[])
        return output_type(summary="빵 광고 성과 요약", suggestion="다음에는 사진을 바꿔 보세요")

    monkeypatch.setattr(LLMClient, "complete", complete)
    return calls


def create(client, data=CAMPAIGN):
    response = client.post(BASE, json=data)
    assert response.status_code == 201
    return f"{BASE}/{response.json()['id']}"


def end(client, path):
    assert client.post(path + "/request-review").status_code == 200
    assert client.post(path + "/approve").status_code == 200
    assert client.post(path + "/schedule", json={"scheduled_at": (utcnow() + timedelta(days=2)).isoformat()}).status_code == 200
    assert client.post(path + "/publish").status_code == 200
    assert client.post(path + "/end").status_code == 200


def test_full_workflow_and_feedback(client, api, provider):
    path = create(client, PLANNING)
    assert client.post(path + "/request-review").status_code == 409
    draft = client.post(path + "/generate-draft").json()
    assert draft["reference_campaign_id"] is None
    assert client.post(path + "/approve").status_code == 409
    assert client.post(path + "/request-review", json={"drafts": {}}).status_code == 422
    assert client.get(path).json()["status"] == "초안 생성됨"
    end(client, path)
    report = client.put(path + "/performance", json=METRICS).json()
    assert report["roas"] == 3 and report["status"] == "ready"
    assert client.get(path).json()["status"] == "종료"
    assert client.post(path + "/performance/complete").json()["status"] == "completed"
    assert client.put(path + "/performance", json=METRICS).status_code == 409
    assert client.get(path + "/history").json()[-1]["next_status"] == "성과 평가 완료"

    other = api[0]()
    assert other.get(path + "/performance").json()["status"] == "completed"
    next_draft = other.post(create(other, PLANNING) + "/generate-draft").json()
    assert next_draft["reference_campaign_id"] == draft["id"]
    reference = provider[-1][1]["previous_campaign"]
    assert reference == {
        "drafts": draft["drafts"], "metrics": {**METRICS, "roas": 3}, "summary": report["summary"],
    }


@pytest.mark.parametrize("revise", [False, True])
def test_review_findings_warn_and_allow_approval(client, monkeypatch, provider, revise):
    path = create(client, PLANNING)
    assert client.post(path + "/generate-draft").status_code == 200
    drafts = {"instagram": {"caption": "추천해요", "hashtags": ["#100%효과"]}}

    def review(self, task, payload, output_type):
        assert task == "review"
        assert payload == {"texts": {"instagram": "추천해요\n#100%효과"}, "product_category": None}
        return output_type(findings=[{
            "channel": "instagram", "start": 0, "end": 4, "quote": "추천해요", "rule": "R1",
            "reason": "협찬 표시 확인", "evidence_url": "https://example.invalid", "suggestion": "협찬 표시 추가",
        }])

    with monkeypatch.context() as scoped:
        scoped.setattr(LLMClient, "complete", review)
        response = client.post(path + "/request-review", json={"drafts": drafts})
    assert response.status_code == 200
    campaign = response.json()
    assert campaign["status"] == "검수 대기" and campaign["content"] == "추천해요"
    assert campaign["review"]["status"] == "passed"
    assert campaign["allowed_actions"] == ["approve", "request-review"]
    assert [(item["rule"], item["quote"]) for item in campaign["review"]["findings"]] == [
        ("R1", "추천해요"), ("R3", "100%효과"),
    ]
    assert campaign["review"]["findings"][0]["evidence_url"] is None
    if revise:
        fixed = {"instagram": {"caption": "갓 구운 빵", "hashtags": ["#광고"]}}
        checked = client.post(path + "/request-review", json={"drafts": fixed}).json()
        assert checked["allowed_actions"] == ["approve"] and checked["review"]["findings"] == []
    approved = client.post(path + "/approve").json()
    assert approved["status"] == "승인됨"
    assert approved["content"] == ("갓 구운 빵" if revise else "추천해요")
    assert bool(approved["review"]["findings"]) is not revise
    assert [row["next_status"] for row in client.get(path + "/history").json()] == [
        "기획중", "초안 생성됨", "검수 대기", "승인됨",
    ]


def test_provider_failure_preserves_review_and_metrics(client, monkeypatch, provider):
    def fail(*args):
        raise HTTPException(504, "timeout")

    path = create(client)
    with monkeypatch.context() as scoped:
        scoped.setattr(LLMClient, "complete", fail)
        assert client.post(path + "/request-review").status_code == 504
    detail = client.get(path).json()
    assert detail["status"] == "검수 대기" and detail["review"]["status"] == "failed"
    assert client.patch(path, json={"content": "다른 문구"}).status_code == 409
    assert client.post(path + "/approve").status_code == 409
    end(client, path)
    call_count = len(provider)
    assert client.put(path + "/performance", json={**METRICS, "clicks": -1}).status_code == 422
    assert client.put(path + "/performance", json={}).status_code == 422
    assert len(provider) == call_count
    zero_spend = {**METRICS, "ad_spend": 0}
    with monkeypatch.context() as scoped:
        scoped.setattr(LLMClient, "complete", fail)
        assert client.put(path + "/performance", json=zero_spend).status_code == 504
    failed = client.get(path + "/performance").json()
    assert failed == {**zero_spend, "roas": None, "status": "failed", "summary": None, "suggestion": None, "evaluated_at": None}
    assert client.post(path + "/performance/complete").status_code == 409
    assert client.put(path + "/performance", json=zero_spend).json()["status"] == "ready"


@pytest.mark.parametrize("operation", ["draft", "review", "performance"])
def test_late_provider_response_cannot_replace_current_state(client, api, monkeypatch, provider, operation):
    path = create(client, PLANNING if operation == "draft" else CAMPAIGN)
    if operation == "performance":
        end(client, path)
    original = LLMClient.complete
    started, release = Event(), Event()

    def delayed(self, task, payload, output_type):
        if not started.is_set():
            started.set()
            assert release.wait(10)
        return original(self, task, payload, output_type)

    monkeypatch.setattr(LLMClient, "complete", delayed)
    other = api[0]()
    with ThreadPoolExecutor(max_workers=1) as executor:
        if operation == "performance":
            future = executor.submit(other.put, path + "/performance", json=METRICS)
        else:
            route = "/generate-draft" if operation == "draft" else "/request-review"
            future = executor.submit(other.post, path + route)
        try:
            assert started.wait(10)
            if operation == "draft":
                assert client.post(path + "/cancel").json()["status"] == "취소"
                assert client.patch(path, json={"content": "수정"}).status_code == 409
            elif operation == "review":
                assert client.post(path + "/approve").status_code == 409
                assert client.post(path + "/request-review").json()["review"]["status"] == "passed"
            else:
                latest = client.put(path + "/performance", json={**METRICS, "revenue": 5000})
                assert latest.json()["roas"] == 5
        finally:
            release.set()
        assert future.result(timeout=10).status_code == 409
    if operation == "draft":
        assert client.get(path).json()["drafts"] == {}
    if operation == "performance":
        assert client.get(path + "/performance").json()["revenue"] == 5000


def test_scheduled_cancel_is_terminal_and_records_prior_state(client, provider):
    path = create(client)
    assert client.post(path + "/request-review").status_code == 200
    assert client.post(path + "/approve").status_code == 200
    scheduled_at = (utcnow() + timedelta(days=2)).isoformat()
    assert client.post(path + "/schedule", json={"scheduled_at": scheduled_at}).status_code == 200
    response = client.post(path + "/cancel").json()
    assert response["status"] == "취소" and response["allowed_actions"] == []
    for action in ("publish", "request-review", "cancel"):
        assert client.post(path + "/" + action).status_code == 409
    history = client.get(path + "/history").json()
    assert (history[-1]["previous_status"], history[-1]["next_status"]) == ("게시 예약됨", "취소")


def test_feedback_uses_completion_order(client, provider):
    first, second = create(client), create(client)
    for path in (second, first):
        end(client, path)
        assert client.put(path + "/performance", json=METRICS).status_code == 200
        assert client.post(path + "/performance/complete").status_code == 200
    newer_unfinished = create(client)
    end(client, newer_unfinished)
    assert client.put(newer_unfinished + "/performance", json=METRICS).status_code == 200
    result = client.post(create(client, PLANNING) + "/generate-draft").json()
    assert result["reference_campaign_id"] == int(first.rsplit("/", 1)[1])

from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Event

import pytest
from fastapi import HTTPException

from app.database import utcnow
from app.llm import LLMClient
from conftest import register_login
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


def test_full_workflow_and_feedback(seller, api, provider):
    path = create(seller, PLANNING)
    assert seller.post(path + "/request-review").status_code == 409
    draft = seller.post(path + "/generate-draft").json()
    assert draft["reference_campaign_id"] is None
    assert seller.post(path + "/approve").status_code == 409
    assert seller.post(path + "/request-review", json={"drafts": {}}).status_code == 422
    assert seller.get(path).json()["status"] == "초안 생성됨"
    end(seller, path)
    report = seller.put(path + "/performance", json=METRICS).json()
    assert report["roas"] == 3 and report["status"] == "ready"
    assert seller.get(path).json()["status"] == "종료"
    assert seller.post(path + "/performance/complete").json()["status"] == "completed"
    assert seller.put(path + "/performance", json=METRICS).status_code == 409
    assert seller.get(path + "/history").json()[-1]["next_status"] == "성과 평가 완료"

    other = api[0]()
    register_login(other, "other@example.com")
    other_path = create(other)
    end(other, other_path)
    assert other.put(other_path + "/performance", json=METRICS).status_code == 200
    assert other.post(other_path + "/performance/complete").status_code == 200
    assert other.get(path + "/performance").status_code == 404
    assert other.put(path + "/performance", json=METRICS).status_code == 404
    assert other.post(path + "/performance/complete").status_code == 404
    assert other.post(path + "/request-review").status_code == 404
    assert other.post(path + "/cancel").status_code == 404

    next_draft = seller.post(create(seller, PLANNING) + "/generate-draft").json()
    assert next_draft["reference_campaign_id"] == draft["id"]
    reference = provider[-1][1]["previous_campaign"]
    assert reference == {
        "drafts": draft["drafts"], "metrics": {**METRICS, "roas": 3}, "summary": report["summary"],
    }


def test_review_rules_and_revision(seller, monkeypatch, provider):
    path = create(seller, PLANNING)
    assert seller.post(path + "/generate-draft").status_code == 200
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
        response = seller.post(path + "/request-review", json={"drafts": drafts})
    assert response.status_code == 200
    campaign = response.json()
    assert campaign["status"] == "수정 요청" and campaign["content"] == "추천해요"
    assert [(item["rule"], item["quote"]) for item in campaign["review"]["findings"]] == [
        ("R1", "추천해요"), ("R3", "100%효과"),
    ]
    assert campaign["review"]["findings"][0]["evidence_url"] is None
    assert seller.post(path + "/approve").status_code == 409
    fixed = {"instagram": {"caption": "갓 구운 빵", "hashtags": ["#광고"]}}
    assert seller.post(path + "/request-review", json={"drafts": fixed}).json()["allowed_actions"] == ["approve"]
    assert seller.post(path + "/approve").status_code == 200


def test_provider_failure_preserves_review_and_metrics(seller, monkeypatch, provider):
    def fail(*args):
        raise HTTPException(504, "timeout")

    path = create(seller)
    with monkeypatch.context() as scoped:
        scoped.setattr(LLMClient, "complete", fail)
        assert seller.post(path + "/request-review").status_code == 504
    detail = seller.get(path).json()
    assert detail["status"] == "검수 대기" and detail["review"]["status"] == "failed"
    assert seller.patch(path, json={"content": "다른 문구"}).status_code == 409
    assert seller.post(path + "/approve").status_code == 409
    end(seller, path)
    call_count = len(provider)
    assert seller.put(path + "/performance", json={**METRICS, "clicks": -1}).status_code == 422
    assert seller.put(path + "/performance", json={}).status_code == 422
    assert len(provider) == call_count
    zero_spend = {**METRICS, "ad_spend": 0}
    with monkeypatch.context() as scoped:
        scoped.setattr(LLMClient, "complete", fail)
        assert seller.put(path + "/performance", json=zero_spend).status_code == 504
    failed = seller.get(path + "/performance").json()
    assert failed == {**zero_spend, "roas": None, "status": "failed", "summary": None, "suggestion": None, "evaluated_at": None}
    assert seller.post(path + "/performance/complete").status_code == 409
    assert seller.put(path + "/performance", json=zero_spend).json()["status"] == "ready"


@pytest.mark.parametrize("operation", ["draft", "review", "performance"])
def test_late_provider_response_cannot_replace_current_state(seller, api, monkeypatch, provider, operation):
    path = create(seller, PLANNING if operation == "draft" else CAMPAIGN)
    if operation == "performance":
        end(seller, path)
    original = LLMClient.complete
    started, release = Event(), Event()

    def delayed(self, task, payload, output_type):
        if not started.is_set():
            started.set()
            assert release.wait(10)
        return original(self, task, payload, output_type)

    monkeypatch.setattr(LLMClient, "complete", delayed)
    other = api[0]()
    other.headers["Authorization"] = seller.headers["Authorization"]
    with ThreadPoolExecutor(max_workers=1) as executor:
        if operation == "performance":
            future = executor.submit(other.put, path + "/performance", json=METRICS)
        else:
            route = "/generate-draft" if operation == "draft" else "/request-review"
            future = executor.submit(other.post, path + route)
        try:
            assert started.wait(10)
            if operation == "draft":
                assert seller.post(path + "/cancel").json()["status"] == "취소"
                assert seller.patch(path, json={"content": "수정"}).status_code == 409
            elif operation == "review":
                assert seller.post(path + "/approve").status_code == 409
                assert seller.post(path + "/request-review").json()["review"]["status"] == "passed"
            else:
                latest = seller.put(path + "/performance", json={**METRICS, "revenue": 5000})
                assert latest.json()["roas"] == 5
        finally:
            release.set()
        assert future.result(timeout=10).status_code == 409
    if operation == "draft":
        assert seller.get(path).json()["drafts"] == {}
    if operation == "performance":
        assert seller.get(path + "/performance").json()["revenue"] == 5000


def test_scheduled_cancel_is_terminal_and_records_prior_state(seller, provider):
    path = create(seller)
    assert seller.post(path + "/request-review").status_code == 200
    assert seller.post(path + "/approve").status_code == 200
    scheduled_at = (utcnow() + timedelta(days=2)).isoformat()
    assert seller.post(path + "/schedule", json={"scheduled_at": scheduled_at}).status_code == 200
    response = seller.post(path + "/cancel").json()
    assert response["status"] == "취소" and response["allowed_actions"] == []
    for action in ("publish", "request-review", "cancel"):
        assert seller.post(path + "/" + action).status_code == 409
    history = seller.get(path + "/history").json()
    assert (history[-1]["previous_status"], history[-1]["next_status"]) == ("게시 예약됨", "취소")


def test_feedback_uses_completion_order(seller, provider):
    first, second = create(seller), create(seller)
    for path in (second, first):
        end(seller, path)
        assert seller.put(path + "/performance", json=METRICS).status_code == 200
        assert seller.post(path + "/performance/complete").status_code == 200
    newer_unfinished = create(seller)
    end(seller, newer_unfinished)
    assert seller.put(newer_unfinished + "/performance", json=METRICS).status_code == 200
    result = seller.post(create(seller, PLANNING) + "/generate-draft").json()
    assert result["reference_campaign_id"] == int(first.rsplit("/", 1)[1])

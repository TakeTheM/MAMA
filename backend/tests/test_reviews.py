import pytest
from fastapi import HTTPException

from test_drafts import BASE
from llm_stub import PRODUCT

pytestmark = pytest.mark.mysql


def drafted(seller, fake_llm, caption="빵을 만나보세요"):
    def handler(task, payload):
        if task == "draft":
            return {"drafts": {channel: {"caption": caption, "hashtags": ["#빵"]} for channel in payload["channels"]}}
        return {"findings": []}
    fake_llm.handler = handler
    created = seller.post(BASE, json=PRODUCT).json()
    path = f"{BASE}/{created['id']}"
    assert seller.post(path + "/generate-draft").status_code == 200
    return path


def test_review_uses_warning_policy_and_rule_fallback(seller, fake_llm):
    path = drafted(seller, fake_llm, "100% 보장 빵")
    result = seller.post(path + "/request-review")
    assert result.status_code == 200
    data = result.json()
    assert data["status"] == "검수 대기"
    assert data["content"] == "100% 보장 빵"
    assert data["review"]["status"] == "completed" and data["review"]["policy"] == "warn"
    assert len(data["review"]["findings"]) == 2  # One finding for each selected channel.
    assert seller.get(path + "/review").json() == data["review"]
    payload = fake_llm.calls[-1][1]
    assert set(payload) == {"drafts", "product_category", "approved_sources"}


def test_unapproved_source_urls_are_removed(seller, fake_llm):
    path = drafted(seller, fake_llm, "확인할 표현")
    fake_llm.handler = lambda task, payload: {"findings": [{
        "channel": "instagram", "start": 0, "end": 3, "expression": "확인할", "rule_id": "R3",
        "reason": "근거를 확인해 주세요", "source_urls": ["https://unapproved.example/article"], "replacement": "검토할",
    }]}
    result = seller.post(path + "/request-review")
    assert result.status_code == 200
    assert result.json()["review"]["findings"][0]["source_urls"] == []
    assert "unapproved.example" not in result.text


def test_suggestion_is_only_applied_on_user_action(seller, fake_llm):
    path = drafted(seller, fake_llm, "100% 보장 빵")
    reviewed = seller.post(path + "/request-review")
    assert reviewed.status_code == 200
    assert seller.get(path).json()["content"] == "100% 보장 빵"
    index = next(i for i, finding in enumerate(reviewed.json()["review"]["findings"]) if finding["channel"] == "instagram")
    result = seller.post(path + "/apply-suggestion", json={"finding_index": index})
    assert result.status_code == 200
    assert result.json()["status"] == "수정 요청"
    assert result.json()["content"] == "제품 정보를 확인해 주세요 빵"
    assert result.json()["review"]["status"] == "stale"
    assert seller.post(path + "/apply-suggestion", json={"finding_index": 1}).status_code == 409
    assert seller.post(path + "/request-review").status_code == 200


def test_review_failure_can_be_retried(seller, fake_llm):
    path = drafted(seller, fake_llm)
    def fail(task, payload):
        raise HTTPException(504, "검수 시간 초과")
    fake_llm.handler = fail
    assert seller.post(path + "/request-review").status_code == 504
    detail = seller.get(path).json()
    assert detail["status"] == "검수 대기" and not detail["can_approve"]
    assert detail["review"]["status"] == "failed"
    assert seller.post(path + "/approve").status_code == 409
    fake_llm.handler = lambda task, payload: {"findings": []}
    assert seller.post(path + "/request-review").status_code == 200
    history = seller.get(path + "/history").json()
    assert sum(row["next_status"] == "검수 대기" for row in history) == 1


def test_bad_finding_position_does_not_allow_approval(seller, fake_llm):
    path = drafted(seller, fake_llm)
    fake_llm.handler = lambda task, payload: {"findings": [{
        "channel": "instagram", "start": 0, "end": 999, "expression": "거짓 위치", "rule_id": "R3",
        "reason": "확인 필요", "replacement": "바꿀 표현", "source_urls": [],
    }]}
    assert seller.post(path + "/request-review").status_code == 502
    assert seller.get(path).json()["review"]["status"] == "failed"


def test_empty_review_draft_preserves_state(seller, fake_llm):
    path = drafted(seller, fake_llm)
    count = len(fake_llm.calls)
    assert seller.post(path + "/request-review", json={"drafts": {}}).status_code == 422
    assert len(fake_llm.calls) == count
    assert seller.get(path).json()["status"] == "초안 생성됨"


def test_review_owner_and_source_catalog(seller, fake_llm, api):
    from conftest import register_login
    path = drafted(seller, fake_llm)
    other = api[0]()
    register_login(other, "other@example.com")
    assert other.post(path + "/request-review").status_code == 404
    assert other.get(path + "/review").status_code == 404
    assert other.post(path + "/apply-suggestion", json={"finding_index": 0}).status_code == 404
    assert seller.get(BASE + "/review-sources").status_code == 200

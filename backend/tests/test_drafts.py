import json

import httpx
import pytest
from fastapi import HTTPException

from app.config import Settings
from app.llm import LLMClient, get_llm
from app.schemas import DraftResult
from main import app

PRODUCT = {
    "product_name": "동네 빵", "product_description": "매일 굽는 빵",
    "product_category": "식품", "product_price": 3000, "goal": "방문 늘리기",
    "target_audience": "동네 주민", "channels": ["instagram", "x"],
    "initial_budget_amount": 100000, "initial_budget_days": 7,
}
BASE = "/api/v1/campaigns"


def good_drafts(channels):
    return {"drafts": {channel: {"caption": f"{channel}에서 빵을 만나보세요", "hashtags": ["#빵"]} for channel in channels}}


class FakeLLM:
    def __init__(self, handler=None):
        self.calls = []
        self.handler = handler

    def complete(self, task, payload, output_type):
        self.calls.append((task, payload))
        value = self.handler(task, payload) if self.handler else good_drafts(payload["channels"])
        return output_type.model_validate(value)


@pytest.fixture
def fake_llm():
    fake = FakeLLM()
    app.dependency_overrides[get_llm] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_llm, None)


@pytest.mark.mysql
def test_generate_drafts(seller, fake_llm):
    created = seller.post(BASE, json=PRODUCT)
    assert created.status_code == 201
    path = f"{BASE}/{created.json()['id']}"
    result = seller.post(path + "/generate-draft")
    assert result.status_code == 200
    assert result.json()["status"] == "초안 생성됨"
    assert set(result.json()["drafts"]) == set(PRODUCT["channels"])
    assert result.json()["content"] == result.json()["drafts"]["instagram"]["caption"]
    assert result.json()["reference_campaign_id"] is None
    assert seller.post(path + "/generate-draft").status_code == 409
    history = seller.get(path + "/history").json()
    assert len(history) == 2 and history[-1]["next_status"] == "초안 생성됨"
    payload = fake_llm.calls[0][1]
    assert not {"owner_id", "customer_name", "address", "phone", "cost", "id"} & payload.keys()


@pytest.mark.mysql
def test_missing_product_input_does_not_call_llm(seller, fake_llm):
    created = seller.post(BASE, json={"content": "광고", "initial_budget_amount": 1, "initial_budget_days": 1})
    result = seller.post(f"{BASE}/{created.json()['id']}/generate-draft")
    assert result.status_code == 422
    assert fake_llm.calls == []


@pytest.mark.mysql
def test_missing_channel_result_preserves_input(seller, fake_llm):
    fake_llm.handler = lambda task, payload: good_drafts(["instagram"])
    created = seller.post(BASE, json=PRODUCT).json()
    path = f"{BASE}/{created['id']}"
    assert seller.post(path + "/generate-draft").status_code == 502
    detail = seller.get(path).json()
    assert detail["status"] == "기획중" and detail["product_name"] == PRODUCT["product_name"]
    assert detail["drafts"] == {}


@pytest.mark.mysql
def test_llm_failure_keeps_planning_input(seller, fake_llm):
    def fail(task, payload):
        raise HTTPException(502, "provider failed")
    fake_llm.handler = fail
    created = seller.post(BASE, json=PRODUCT).json()
    path = f"{BASE}/{created['id']}"
    assert seller.post(path + "/generate-draft").status_code == 502
    assert seller.get(path).json()["status"] == "기획중"


def test_provider_json_contract_and_payload():
    def handler(request):
        body = json.loads(request.content)
        assert str(request.url) == "https://example.com/v1/chat/completions"
        assert body["response_format"] == {"type": "json_object"}
        assert request.headers["Authorization"] == "Bearer test-key"
        assert "test-key" not in body["messages"][0]["content"]
        return httpx.Response(200, json={"choices": [{"finish_reason": "stop", "message": {"content": json.dumps(good_drafts(["x"]))}}]})
    client = LLMClient(Settings(_env_file=None, llm_api_key="test-key", llm_base_url="https://example.com/v1", llm_model="test-model"), httpx.MockTransport(handler))
    assert client.complete("draft", {"channels": ["x"]}, DraftResult).drafts["x"].caption


@pytest.mark.parametrize("mode", ["timeout", "http_error", "invalid_json", "incomplete", "invalid_schema", "refusal"])
def test_provider_failures_are_safe(mode):
    def handler(request):
        if mode == "timeout":
            raise httpx.ReadTimeout("private details", request=request)
        if mode == "http_error":
            return httpx.Response(401, text="secret-test-key")
        content = "bad-json" if mode == "invalid_json" else json.dumps({} if mode == "invalid_schema" else good_drafts(["x"]))
        return httpx.Response(200, json={"choices": [{"finish_reason": "length" if mode == "incomplete" else "stop", "message": {"content": content, "refusal": "refused" if mode == "refusal" else None}}]})
    client = LLMClient(Settings(_env_file=None, llm_api_key="test-key", llm_model="test-model"), httpx.MockTransport(handler))
    with pytest.raises(HTTPException) as caught:
        client.complete("draft", {}, DraftResult)
    assert caught.value.status_code == (504 if mode == "timeout" else 502)
    assert "secret" not in caught.value.detail and "private" not in caught.value.detail


def test_provider_configuration_required():
    with pytest.raises(HTTPException) as caught:
        LLMClient(Settings(_env_file=None)).complete("draft", {}, DraftResult)
    assert caught.value.status_code == 503

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import CampaignStatusHistory
from conftest import register_login
from test_drafts import BASE, PRODUCT, fake_llm, good_drafts
from test_reviews import drafted

pytestmark = pytest.mark.mysql


def test_manual_approval_bypass_is_removed(seller, fake_llm):
    created = seller.post(BASE, json=PRODUCT).json()
    path = f"{BASE}/{created['id']}"
    assert seller.post(path + "/approve").status_code == 409
    assert seller.post(path + "/generate-draft").status_code == 200
    assert seller.post(path + "/approve").status_code == 409
    fake_llm.handler = lambda task, payload: {"findings": []}
    assert seller.post(path + "/request-review").json()["can_approve"]
    assert seller.post(path + "/approve").json()["status"] == "승인됨"


def test_warning_can_be_explicitly_approved(seller, fake_llm):
    path = drafted(seller, fake_llm, "100% 보장 빵")
    reviewed = seller.post(path + "/request-review").json()
    assert reviewed["review"]["findings"] and reviewed["can_approve"]
    approved = seller.post(path + "/approve")
    assert approved.status_code == 200 and approved.json()["status"] == "승인됨"
    history = seller.get(path + "/history").json()
    assert history[-1]["snapshot"]["review_finding_count"] == 2


def test_user_revision_requires_re_review(seller, fake_llm):
    path = drafted(seller, fake_llm)
    assert seller.post(path + "/request-review").status_code == 200
    assert seller.post(path + "/request-revision").json()["status"] == "수정 요청"
    assert seller.patch(path, json={"content": "다시 쓴 광고"}).status_code == 200
    detail = seller.get(path).json()
    assert all(value["caption"] == "다시 쓴 광고" for value in detail["drafts"].values())
    assert not detail["can_approve"]
    assert seller.post(path + "/approve").status_code == 409
    assert seller.post(path + "/request-review").json()["can_approve"]
    assert seller.post(path + "/approve").status_code == 200


@pytest.mark.parametrize("stage", ["planning", "drafted", "reviewed", "approved", "scheduled"])
def test_cancel_is_terminal_before_publication(seller, fake_llm, stage):
    created = seller.post(BASE, json=PRODUCT).json()
    path = f"{BASE}/{created['id']}"
    if stage != "planning":
        assert seller.post(path + "/generate-draft").status_code == 200
    if stage in ("reviewed", "approved", "scheduled"):
        fake_llm.handler = lambda task, payload: {"findings": []}
        assert seller.post(path + "/request-review").status_code == 200
    if stage in ("approved", "scheduled"):
        assert seller.post(path + "/approve").status_code == 200
    if stage == "scheduled":
        assert seller.post(path + "/schedule", json={"scheduled_at": "2030-01-01T00:00:00Z"}).status_code == 200
    result = seller.post(path + "/cancel")
    assert result.status_code == 200 and result.json()["status"] == "취소"
    assert result.json()["allowed_actions"] == []
    for action in ("cancel", "generate-draft", "request-review", "approve", "publish", "end", "request-revision"):
        assert seller.post(path + "/" + action).status_code == 409
    assert seller.patch(path, json={"content": "취소 후 변경"}).status_code == 409


def test_late_draft_result_cannot_overwrite_cancellation(seller, fake_llm, api):
    created = seller.post(BASE, json=PRODUCT).json()
    path = f"{BASE}/{created['id']}"
    concurrent = api[0]()
    concurrent.headers["Authorization"] = seller.headers["Authorization"]
    def handler(task, payload):
        assert concurrent.post(path + "/cancel").status_code == 200
        return good_drafts(payload["channels"])
    fake_llm.handler = handler
    assert seller.post(path + "/generate-draft").status_code == 409
    detail = seller.get(path).json()
    assert detail["status"] == "취소" and detail["drafts"] == {} and detail["content"] == ""


def test_late_review_result_cannot_overwrite_cancellation(seller, fake_llm, api):
    path = drafted(seller, fake_llm)
    concurrent = api[0]()
    concurrent.headers["Authorization"] = seller.headers["Authorization"]
    def handler(task, payload):
        assert concurrent.post(path + "/cancel").status_code == 200
        return {"findings": []}
    fake_llm.handler = handler
    assert seller.post(path + "/request-review").status_code == 409
    assert seller.get(path).json()["status"] == "취소"
    assert not seller.get(path).json()["can_approve"]


def test_edit_during_generation_discards_result(seller, fake_llm, api):
    created = seller.post(BASE, json=PRODUCT).json()
    path = f"{BASE}/{created['id']}"
    concurrent = api[0]()
    concurrent.headers["Authorization"] = seller.headers["Authorization"]
    def handler(task, payload):
        assert concurrent.patch(path, json={"goal": "새로운 목표"}).status_code == 200
        return good_drafts(payload["channels"])
    fake_llm.handler = handler
    assert seller.post(path + "/generate-draft").status_code == 409
    assert seller.get(path).json()["goal"] == "새로운 목표"


def test_cancel_owner_check(seller, fake_llm, api):
    created = seller.post(BASE, json=PRODUCT).json()
    other = api[0]()
    register_login(other, "other@example.com")
    assert other.post(f"{BASE}/{created['id']}/cancel").status_code == 404


def test_concurrent_draft_results_only_commit_once(seller, fake_llm, api):
    created = seller.post(BASE, json=PRODUCT).json()
    path = f"{BASE}/{created['id']}"
    barrier = Barrier(2)
    def handler(task, payload):
        barrier.wait(timeout=10)
        return good_drafts(payload["channels"])
    fake_llm.handler = handler
    clients = [api[0](), api[0]()]
    for client in clients:
        client.headers["Authorization"] = seller.headers["Authorization"]
    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda client: client.post(path + "/generate-draft"), clients))
    assert sorted(result.status_code for result in results) == [200, 409]
    assert len(seller.get(path + "/history").json()) == 2

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, timedelta, timezone
from threading import Barrier

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, func, select
from sqlalchemy.orm import Session

from app import campaign_service
from app.database import utcnow
from app.llm import LLMClient
from app.models import Campaign, CampaignStatusHistory
from main import app

pytestmark = pytest.mark.mysql
BASE = "/api/v1/campaigns"
CAMPAIGN = {"content": "오늘 구운 빵 🍞 #광고", "initial_budget_amount": 100000, "initial_budget_days": 7}


@pytest.fixture(autouse=True)
def pass_review(monkeypatch):
    def complete(self, task, payload, output_type):
        assert task == "review"
        return output_type(findings=[])

    monkeypatch.setattr(LLMClient, "complete", complete)


def create(client):
    result = client.post(BASE, json=CAMPAIGN)
    assert result.status_code == 201
    assert not result.history  # Collection URL must not need a trailing-slash redirect.
    return result.json()["id"]


def approved(client):
    campaign_id = create(client)
    assert client.post(f"{BASE}/{campaign_id}/request-review").status_code == 200
    assert client.post(f"{BASE}/{campaign_id}/approve").status_code == 200
    return campaign_id


def scheduled(client):
    campaign_id = approved(client)
    result = client.post(f"{BASE}/{campaign_id}/schedule", json={"scheduled_at": (utcnow() + timedelta(days=2)).isoformat()})
    assert result.status_code == 200
    return campaign_id


def test_full_normal_flow(client):
    campaign_id = create(client)
    path = f"{BASE}/{campaign_id}"
    assert client.get(path).json()["allowed_actions"] == ["edit", "cancel", "request-review"]
    assert client.patch(path, json={"content": "새로운 광고 문자열"}).status_code == 200
    assert client.post(path + "/request-review").status_code == 200
    assert client.post(path + "/approve").json()["status"] == "승인됨"
    result = client.post(path + "/schedule", json={"scheduled_at": (utcnow() + timedelta(days=2)).isoformat()})
    assert result.status_code == 200
    assert result.json()["warnings"] == []
    assert result.json()["budget_amount"] == CAMPAIGN["initial_budget_amount"]
    assert result.json()["budget_days"] == CAMPAIGN["initial_budget_days"]
    posted = client.post(path + "/publish")
    assert posted.json()["status"] == "집행중"
    assert posted.json()["published_at"].endswith("Z")
    ended = client.post(path + "/end")
    assert ended.json()["status"] == "종료"
    assert ended.json()["allowed_actions"] == ["performance"]
    assert client.get(path).json()["status"] == "종료"
    history = client.get(path + "/history").json()
    assert [row["next_status"] for row in history] == ["기획중", "검수 대기", "승인됨", "게시 예약됨", "집행중", "종료"]
    assert history[0]["previous_status"] is None
    assert all("changed_by" not in row for row in history)
    assert "owner_id" not in ended.json()
    assert history == sorted(history, key=lambda row: (row["recorded_at"], row["id"]))


def test_rejection_revision_and_reservation_history(client):
    campaign_id = approved(client)
    path = f"{BASE}/{campaign_id}"
    original_schedule = (utcnow() + timedelta(days=2)).isoformat()
    assert client.post(path + "/schedule", json={"scheduled_at": original_schedule, "budget_amount": 200000, "budget_days": 10}).status_code == 200
    rejected = client.post(path + "/reject", json={"reason": "플랫폼에서 표현 수정을 요청했습니다"})
    assert rejected.json()["status"] == "플랫폼 반려"
    revision = client.post(path + "/request-revision").json()
    assert revision["status"] == "수정 요청"
    assert revision["scheduled_at"] is None and revision["budget_amount"] is None and revision["budget_days"] is None
    assert revision["rejection_reason"] == "플랫폼에서 표현 수정을 요청했습니다"
    assert client.get(path).json()["rejection_reason"] == revision["rejection_reason"]
    assert client.patch(path, json={"content": "수정한 광고"}).status_code == 200
    assert client.post(path + "/request-review").status_code == 200
    assert client.post(path + "/approve").status_code == 200
    assert client.post(path + "/schedule", json={"scheduled_at": (utcnow() + timedelta(days=3)).isoformat()}).status_code == 200
    history = client.get(path + "/history").json()
    old = next(row for row in history if row["next_status"] == "플랫폼 반려")
    assert old["snapshot"]["budget_amount"] == 200000 and old["snapshot"]["budget_days"] == 10
    assert old["snapshot"]["rejection_reason"] == revision["rejection_reason"]
    assert history[-1]["snapshot"]["budget_amount"] == 100000


@pytest.mark.parametrize("delta,warning", [(timedelta(0), True), (timedelta(hours=24), True), (timedelta(hours=24, microseconds=1), False)])
def test_review_warning_boundary(client, monkeypatch, delta, warning):
    campaign_id = approved(client)
    now = utcnow()
    monkeypatch.setattr(campaign_service, "utcnow", lambda: now)
    result = client.post(f"{BASE}/{campaign_id}/schedule", json={"scheduled_at": (now + delta).isoformat()})
    assert result.status_code == 200
    assert bool(result.json()["warnings"]) == warning


def test_past_schedule_and_timezone_conversion(client, monkeypatch):
    campaign_id = approved(client)
    path = f"{BASE}/{campaign_id}"
    now = utcnow()
    monkeypatch.setattr(campaign_service, "utcnow", lambda: now)
    past = client.post(path + "/schedule", json={"scheduled_at": (now - timedelta(microseconds=1)).isoformat()})
    assert past.status_code == 422
    assert client.get(path).json()["status"] == "승인됨"
    naive = (now + timedelta(days=2)).replace(tzinfo=None).isoformat()
    assert client.post(path + "/schedule", json={"scheduled_at": naive}).status_code == 422
    korean_time = (now + timedelta(days=2)).astimezone(timezone(timedelta(hours=9)))
    result = client.post(path + "/schedule", json={"scheduled_at": korean_time.isoformat()})
    assert result.status_code == 200
    assert result.json()["scheduled_at"] == korean_time.astimezone(UTC).isoformat().replace("+00:00", "Z")
    assert client.get(path).json()["scheduled_at"] == result.json()["scheduled_at"]


@pytest.mark.parametrize("field,value", [
    ("content", " \n\t"), ("content", "x" * 10001),
    ("initial_budget_amount", 0), ("initial_budget_amount", -1),
    ("initial_budget_amount", True), ("initial_budget_amount", 1.5),
    ("initial_budget_amount", 2**63), ("initial_budget_days", 0),
    ("initial_budget_days", -1), ("initial_budget_days", 2**31),
])
def test_invalid_campaign_inputs(client, field, value):
    assert client.post(BASE, json={**CAMPAIGN, field: value}).status_code == 422
    assert client.get(BASE).json()["items"] == []


@pytest.mark.parametrize("patch", [{"content": None}, {"initial_budget_amount": None}, {"content": " "}, {"status": "승인됨"}, {"owner_id": 999}])
def test_invalid_patch_and_state_owner_injection(client, patch):
    campaign_id = create(client)
    assert client.patch(f"{BASE}/{campaign_id}", json=patch).status_code == 422
    assert client.get(f"{BASE}/{campaign_id}").json()["content"] == CAMPAIGN["content"]


@pytest.mark.parametrize("field,value", [("budget_amount", 0), ("budget_amount", -1), ("budget_days", 0), ("budget_days", None)])
def test_invalid_schedule_budget(client, field, value):
    campaign_id = approved(client)
    result = client.post(f"{BASE}/{campaign_id}/schedule", json={"scheduled_at": (utcnow() + timedelta(days=2)).isoformat(), field: value})
    assert result.status_code == 422
    assert client.get(f"{BASE}/{campaign_id}").json()["status"] == "승인됨"


def test_reject_blank_reason_and_skip_transitions(client):
    campaign_id = scheduled(client)
    path = f"{BASE}/{campaign_id}"
    for reason in ["", " \n\t"]:
        assert client.post(path + "/reject", json={"reason": reason}).status_code == 422
    for action in ["end", "approve", "request-revision"]:
        assert client.post(path + "/" + action).status_code == 409
    assert client.get(path).json()["status"] == "게시 예약됨"
    assert len(client.get(path + "/history").json()) == 4
    planning = create(client)
    assert client.post(f"{BASE}/{planning}/publish").status_code == 409


def test_actual_times_are_validated(client):
    campaign_id = scheduled(client)
    path = f"{BASE}/{campaign_id}"
    future = (utcnow() + timedelta(days=1)).isoformat()
    assert client.post(path + "/publish", json={"published_at": future}).status_code == 422
    assert client.post(path + "/publish", json={"published_at": "2026-01-01T12:00:00"}).status_code == 422
    posted_at = utcnow() - timedelta(hours=2)
    assert client.post(path + "/publish", json={"published_at": posted_at.isoformat()}).status_code == 200
    assert client.post(path + "/end", json={"ended_at": future}).status_code == 422
    assert client.post(path + "/end", json={"ended_at": (posted_at - timedelta(seconds=1)).isoformat()}).status_code == 422
    assert client.get(path).json()["status"] == "집행중"
    assert client.post(path + "/end", json={"ended_at": posted_at.isoformat()}).status_code == 200


def test_approval_locks_content_and_schedule(client):
    campaign_id = scheduled(client)
    path = f"{BASE}/{campaign_id}"
    assert client.patch(path, json={"content": "승인 뒤 변경"}).status_code == 409
    assert client.post(path + "/schedule", json={"scheduled_at": (utcnow() + timedelta(days=3)).isoformat()}).status_code == 409


@pytest.mark.parametrize("value", [1234567890, "1234567890", True, "not-a-date"])
def test_schedule_rejects_non_iso_timestamp(client, value):
    campaign_id = approved(client)
    assert client.post(f"{BASE}/{campaign_id}/schedule", json={"scheduled_at": value}).status_code == 422


def test_shared_workspace_and_pagination(client, api):
    first, second = create(client), create(client)
    other = api[0]()
    listing = other.get(BASE, params={"limit": 1, "offset": 0}).json()
    assert [item["id"] for item in listing["items"]] == [second]
    assert other.get(BASE, params={"limit": 1, "offset": 1}).json()["items"][0]["id"] == first
    assert other.get(f"{BASE}/{first}").status_code == 200
    assert other.get(f"{BASE}/{first}/history").status_code == 200
    assert other.patch(f"{BASE}/{first}", json={"content": "공유 캠페인 수정"}).status_code == 200
    assert client.get(f"{BASE}/{first}").json()["content"] == "공유 캠페인 수정"
    assert other.post("/api/v1/auth/login").status_code == 404
    assert client.get(f"{BASE}/9223372036854775807").status_code == 404
    for query in [{"limit": 101}, {"limit": 0}, {"offset": -1}]:
        assert client.get(BASE, params=query).status_code == 422


def test_history_failure_rolls_back_campaign_state(client, mysql_engine):
    campaign_id = create(client)

    def fail_history(mapper, connection, target):
        raise RuntimeError("injected history insert failure")

    event.listen(CampaignStatusHistory, "before_insert", fail_history)
    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            result = client.post(f"{BASE}/{campaign_id}/request-review")
            assert result.status_code == 500
    finally:
        event.remove(CampaignStatusHistory, "before_insert", fail_history)
    with Session(mysql_engine) as db:
        assert db.get(Campaign, campaign_id).status == "기획중"
        assert db.scalar(select(func.count()).select_from(CampaignStatusHistory).where(CampaignStatusHistory.campaign_id == campaign_id)) == 1


def test_history_failure_rolls_back_campaign_creation(client, mysql_engine):
    def fail_history(mapper, connection, target):
        raise RuntimeError("injected history insert failure")

    event.listen(CampaignStatusHistory, "before_insert", fail_history)
    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            assert client.post(BASE, json=CAMPAIGN).status_code == 500
    finally:
        event.remove(CampaignStatusHistory, "before_insert", fail_history)
    with Session(mysql_engine) as db:
        assert db.scalar(select(func.count()).select_from(Campaign)) == 0


def test_concurrent_publish_and_reject_only_one_transition(client, api, mysql_engine, monkeypatch):
    campaign_id = scheduled(client)
    barrier = Barrier(2)
    original = campaign_service.get_campaign

    def synchronized_get(*args, **kwargs):
        if kwargs.get("lock"):
            barrier.wait(timeout=10)
        return original(*args, **kwargs)

    monkeypatch.setattr(campaign_service, "get_campaign", synchronized_get)
    clients = [api[0](), api[0]()]

    def send(index):
        action = "publish" if index == 0 else "reject"
        body = {} if index == 0 else {"reason": "플랫폼 반려"}
        return clients[index].post(f"{BASE}/{campaign_id}/{action}", json=body)

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(send, range(2)))
    assert sorted(result.status_code for result in results) == [200, 409]
    with Session(mysql_engine) as db:
        campaign = db.get(Campaign, campaign_id)
        assert campaign.status in ["집행중", "플랫폼 반려"]
        records = db.scalars(select(CampaignStatusHistory).where(CampaignStatusHistory.campaign_id == campaign_id)).all()
        assert len(records) == 5
        assert sum(row.previous_status == "게시 예약됨" for row in records) == 1

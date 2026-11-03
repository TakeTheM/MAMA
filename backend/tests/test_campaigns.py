from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, timedelta, timezone
from threading import Barrier

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, func, select
from sqlalchemy.orm import Session

from app import campaign_service
from app.database import utcnow
from app.models import Campaign, CampaignStatusHistory
from conftest import register_login
from main import app

pytestmark = pytest.mark.mysql
BASE = "/api/v1/campaigns"
CAMPAIGN = {"content": "오늘 구운 빵 🍞 #광고", "initial_budget_amount": 100000, "initial_budget_days": 7}


def create(client):
    result = client.post(BASE, json=CAMPAIGN)
    assert result.status_code == 201
    assert not result.history  # Collection URL must not need a trailing-slash redirect.
    return result.json()["id"]


def review_campaign(client, campaign_id):
    path = f"{BASE}/{campaign_id}"
    assert client.patch(path, json={"product_name": "빵", "product_description": "매일 굽는 빵", "product_price": 3000, "goal": "방문 늘리기", "channels": ["instagram"]}).status_code == 200
    assert client.post(path + "/generate-draft").status_code == 200
    assert client.post(path + "/request-review").status_code == 200


def approved(client):
    campaign_id = create(client)
    review_campaign(client, campaign_id)
    assert client.post(f"{BASE}/{campaign_id}/approve").status_code == 200
    return campaign_id


def scheduled(client):
    campaign_id = approved(client)
    result = client.post(f"{BASE}/{campaign_id}/schedule", json={"scheduled_at": (utcnow() + timedelta(days=2)).isoformat()})
    assert result.status_code == 200
    return campaign_id


def test_full_normal_flow(seller):
    campaign_id = create(seller)
    path = f"{BASE}/{campaign_id}"
    assert seller.get(path).json()["allowed_actions"] == ["edit", "generate-draft", "cancel"]
    assert seller.patch(path, json={"content": "새로운 광고 문자열"}).status_code == 200
    review_campaign(seller, campaign_id)
    assert seller.post(path + "/approve").json()["status"] == "승인됨"
    result = seller.post(path + "/schedule", json={"scheduled_at": (utcnow() + timedelta(days=2)).isoformat()})
    assert result.status_code == 200
    assert result.json()["warnings"] == []
    assert result.json()["budget_amount"] == CAMPAIGN["initial_budget_amount"]
    assert result.json()["budget_days"] == CAMPAIGN["initial_budget_days"]
    posted = seller.post(path + "/publish")
    assert posted.json()["status"] == "집행중"
    assert posted.json()["published_at"].endswith("Z")
    ended = seller.post(path + "/end")
    assert ended.json()["status"] == "종료"
    assert ended.json()["allowed_actions"] == ["save-performance"]
    assert seller.get(path).json()["status"] == "종료"
    history = seller.get(path + "/history").json()
    assert [row["next_status"] for row in history] == ["기획중", "초안 생성됨", "검수 대기", "승인됨", "게시 예약됨", "집행중", "종료"]
    assert history[0]["previous_status"] is None
    assert all(row["changed_by"] == ended.json()["owner_id"] for row in history)
    assert history == sorted(history, key=lambda row: (row["recorded_at"], row["id"]))


def test_rejection_revision_and_reservation_history(seller):
    campaign_id = approved(seller)
    path = f"{BASE}/{campaign_id}"
    original_schedule = (utcnow() + timedelta(days=2)).isoformat()
    assert seller.post(path + "/schedule", json={"scheduled_at": original_schedule, "budget_amount": 200000, "budget_days": 10}).status_code == 200
    rejected = seller.post(path + "/reject", json={"reason": "플랫폼에서 표현 수정을 요청했습니다"})
    assert rejected.json()["status"] == "플랫폼 반려"
    revision = seller.post(path + "/request-revision").json()
    assert revision["status"] == "수정 요청"
    assert revision["scheduled_at"] is None and revision["budget_amount"] is None and revision["budget_days"] is None
    assert revision["rejection_reason"] == "플랫폼에서 표현 수정을 요청했습니다"
    assert seller.get(path).json()["rejection_reason"] == revision["rejection_reason"]
    assert seller.patch(path, json={"content": "수정한 광고"}).status_code == 200
    assert seller.post(path + "/request-review").status_code == 200
    assert seller.post(path + "/approve").status_code == 200
    assert seller.post(path + "/schedule", json={"scheduled_at": (utcnow() + timedelta(days=3)).isoformat()}).status_code == 200
    history = seller.get(path + "/history").json()
    old = next(row for row in history if row["next_status"] == "플랫폼 반려")
    assert old["snapshot"]["budget_amount"] == 200000 and old["snapshot"]["budget_days"] == 10
    assert old["snapshot"]["rejection_reason"] == revision["rejection_reason"]
    assert history[-1]["snapshot"]["budget_amount"] == 100000


@pytest.mark.parametrize("delta,warning", [(timedelta(0), True), (timedelta(hours=24), True), (timedelta(hours=24, microseconds=1), False)])
def test_review_warning_boundary(seller, monkeypatch, delta, warning):
    campaign_id = approved(seller)
    now = utcnow()
    monkeypatch.setattr(campaign_service, "utcnow", lambda: now)
    result = seller.post(f"{BASE}/{campaign_id}/schedule", json={"scheduled_at": (now + delta).isoformat()})
    assert result.status_code == 200
    assert bool(result.json()["warnings"]) == warning


def test_past_schedule_and_timezone_conversion(seller, monkeypatch):
    campaign_id = approved(seller)
    path = f"{BASE}/{campaign_id}"
    now = utcnow()
    monkeypatch.setattr(campaign_service, "utcnow", lambda: now)
    past = seller.post(path + "/schedule", json={"scheduled_at": (now - timedelta(microseconds=1)).isoformat()})
    assert past.status_code == 422
    assert seller.get(path).json()["status"] == "승인됨"
    naive = (now + timedelta(days=2)).replace(tzinfo=None).isoformat()
    assert seller.post(path + "/schedule", json={"scheduled_at": naive}).status_code == 422
    korean_time = (now + timedelta(days=2)).astimezone(timezone(timedelta(hours=9)))
    result = seller.post(path + "/schedule", json={"scheduled_at": korean_time.isoformat()})
    assert result.status_code == 200
    assert result.json()["scheduled_at"] == korean_time.astimezone(UTC).isoformat().replace("+00:00", "Z")
    assert seller.get(path).json()["scheduled_at"] == result.json()["scheduled_at"]


@pytest.mark.parametrize("field,value", [
    ("content", " \n\t"), ("content", "x" * 10001),
    ("initial_budget_amount", 0), ("initial_budget_amount", -1),
    ("initial_budget_amount", True), ("initial_budget_amount", 1.5),
    ("initial_budget_amount", 2**63), ("initial_budget_days", 0),
    ("initial_budget_days", -1), ("initial_budget_days", 2**31),
])
def test_invalid_campaign_inputs(seller, field, value):
    assert seller.post(BASE, json={**CAMPAIGN, field: value}).status_code == 422
    assert seller.get(BASE).json()["items"] == []


@pytest.mark.parametrize("patch", [{"content": None}, {"initial_budget_amount": None}, {"content": " "}, {"status": "승인됨"}, {"owner_id": 999}])
def test_invalid_patch_and_state_owner_injection(seller, patch):
    campaign_id = create(seller)
    assert seller.patch(f"{BASE}/{campaign_id}", json=patch).status_code == 422
    assert seller.get(f"{BASE}/{campaign_id}").json()["content"] == CAMPAIGN["content"]


@pytest.mark.parametrize("field,value", [("budget_amount", 0), ("budget_amount", -1), ("budget_days", 0), ("budget_days", None)])
def test_invalid_schedule_budget(seller, field, value):
    campaign_id = approved(seller)
    result = seller.post(f"{BASE}/{campaign_id}/schedule", json={"scheduled_at": (utcnow() + timedelta(days=2)).isoformat(), field: value})
    assert result.status_code == 422
    assert seller.get(f"{BASE}/{campaign_id}").json()["status"] == "승인됨"


def test_reject_blank_reason_and_skip_transitions(seller):
    campaign_id = scheduled(seller)
    path = f"{BASE}/{campaign_id}"
    for reason in ["", " \n\t"]:
        assert seller.post(path + "/reject", json={"reason": reason}).status_code == 422
    for action in ["end", "approve", "request-revision"]:
        assert seller.post(path + "/" + action).status_code == 409
    assert seller.get(path).json()["status"] == "게시 예약됨"
    assert len(seller.get(path + "/history").json()) == 5
    planning = create(seller)
    assert seller.post(f"{BASE}/{planning}/publish").status_code == 409


def test_actual_times_are_validated(seller):
    campaign_id = scheduled(seller)
    path = f"{BASE}/{campaign_id}"
    future = (utcnow() + timedelta(days=1)).isoformat()
    assert seller.post(path + "/publish", json={"published_at": future}).status_code == 422
    assert seller.post(path + "/publish", json={"published_at": "2026-01-01T12:00:00"}).status_code == 422
    posted_at = utcnow() - timedelta(hours=2)
    assert seller.post(path + "/publish", json={"published_at": posted_at.isoformat()}).status_code == 200
    assert seller.post(path + "/end", json={"ended_at": future}).status_code == 422
    assert seller.post(path + "/end", json={"ended_at": (posted_at - timedelta(seconds=1)).isoformat()}).status_code == 422
    assert seller.get(path).json()["status"] == "집행중"
    assert seller.post(path + "/end", json={"ended_at": posted_at.isoformat()}).status_code == 200


def test_approval_locks_content_and_schedule(seller):
    campaign_id = scheduled(seller)
    path = f"{BASE}/{campaign_id}"
    assert seller.patch(path, json={"content": "승인 뒤 변경"}).status_code == 409
    assert seller.post(path + "/schedule", json={"scheduled_at": (utcnow() + timedelta(days=3)).isoformat()}).status_code == 409


@pytest.mark.parametrize("value", [1234567890, "1234567890", True, "not-a-date"])
def test_schedule_rejects_non_iso_timestamp(seller, value):
    campaign_id = approved(seller)
    assert seller.post(f"{BASE}/{campaign_id}/schedule", json={"scheduled_at": value}).status_code == 422


def test_ownership_and_pagination(seller, api):
    first, second = create(seller), create(seller)
    listing = seller.get(BASE, params={"limit": 1, "offset": 0}).json()
    assert [item["id"] for item in listing["items"]] == [second]
    assert seller.get(BASE, params={"limit": 1, "offset": 1}).json()["items"][0]["id"] == first
    other = api[0]()
    register_login(other, "other@example.com")
    assert other.get(BASE).json()["items"] == []
    assert other.get(f"{BASE}/{first}").status_code == 404
    assert other.get(f"{BASE}/{first}/history").status_code == 404
    assert other.patch(f"{BASE}/{first}", json={"content": "다른 사람 광고"}).status_code == 404
    for action, body in [
        ("approve", None), ("schedule", {"scheduled_at": (utcnow() + timedelta(days=2)).isoformat()}),
        ("publish", None), ("end", None), ("reject", {"reason": "반려"}), ("request-revision", None),
    ]:
        assert other.post(f"{BASE}/{first}/{action}", json=body).status_code == 404
    assert seller.get(f"{BASE}/9223372036854775807").status_code == 404
    for query in [{"limit": 101}, {"limit": 0}, {"offset": -1}]:
        assert seller.get(BASE, params=query).status_code == 422


def test_history_failure_rolls_back_campaign_state(seller, mysql_engine):
    campaign_id = create(seller)
    review_campaign(seller, campaign_id)

    def fail_history(mapper, connection, target):
        raise RuntimeError("injected history insert failure")

    event.listen(CampaignStatusHistory, "before_insert", fail_history)
    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            result = client.post(f"{BASE}/{campaign_id}/approve", headers=dict(seller.headers))
            assert result.status_code == 500
    finally:
        event.remove(CampaignStatusHistory, "before_insert", fail_history)
    with Session(mysql_engine) as db:
        assert db.get(Campaign, campaign_id).status == "검수 대기"
        assert db.scalar(select(func.count()).select_from(CampaignStatusHistory).where(CampaignStatusHistory.campaign_id == campaign_id)) == 3


def test_history_failure_rolls_back_campaign_creation(seller, mysql_engine):
    def fail_history(mapper, connection, target):
        raise RuntimeError("injected history insert failure")

    event.listen(CampaignStatusHistory, "before_insert", fail_history)
    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            assert client.post(BASE, json=CAMPAIGN, headers=dict(seller.headers)).status_code == 500
    finally:
        event.remove(CampaignStatusHistory, "before_insert", fail_history)
    with Session(mysql_engine) as db:
        assert db.scalar(select(func.count()).select_from(Campaign)) == 0


def test_concurrent_publish_and_reject_only_one_transition(seller, api, mysql_engine, monkeypatch):
    campaign_id = scheduled(seller)
    barrier = Barrier(2)
    original = campaign_service.owned_campaign

    def synchronized_owned(*args, **kwargs):
        if kwargs.get("lock"):
            barrier.wait(timeout=10)
        return original(*args, **kwargs)

    monkeypatch.setattr(campaign_service, "owned_campaign", synchronized_owned)
    clients = [api[0](), api[0]()]
    for client in clients:
        client.headers["Authorization"] = seller.headers["Authorization"]

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
        assert len(records) == 6
        assert sum(row.previous_status == "게시 예약됨" for row in records) == 1

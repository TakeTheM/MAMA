from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy import MetaData, Table
from app.database import utcnow
from sqlalchemy.orm import Session

from app import campaign_service
from app.models import Campaign, CampaignStatusHistory
from main import app
from test_campaigns import scheduled
from test_drafts import BASE
from llm_stub import PRODUCT
from test_performance import METRICS, prepare_fake
from conftest import BACKEND_ROOT

pytestmark = pytest.mark.mysql


def full_campaign(seller):
    result = seller.post(BASE, json=PRODUCT)
    assert result.status_code == 201
    campaign_id = result.json()["id"]
    path = f"{BASE}/{campaign_id}"
    assert seller.post(path + "/generate-draft").json()["status"] == "초안 생성됨"
    review = seller.post(path + "/request-review")
    assert review.status_code == 200 and review.json()["can_approve"]
    assert seller.post(path + "/approve").json()["status"] == "승인됨"
    assert seller.post(path + "/schedule", json={"scheduled_at": "2030-01-01T00:00:00Z"}).status_code == 200
    assert seller.post(path + "/publish").json()["status"] == "집행중"
    assert seller.post(path + "/end").json()["status"] == "종료"
    assert seller.put(path + "/performance", json=METRICS).status_code == 200
    assert seller.get(path).json()["status"] == "종료"
    assert seller.post(path + "/complete-evaluation").json()["status"] == "성과 평가 완료"
    return path, campaign_id


def test_complete_mvp_and_latest_feedback(seller, fake_llm):
    prepare_fake(fake_llm)
    first_path, first = full_campaign(seller)
    second_path, second = full_campaign(seller)
    assert seller.get(second_path).json()["reference_campaign_id"] == first
    third = seller.post(BASE, json=PRODUCT).json()
    result = seller.post(f"{BASE}/{third['id']}/generate-draft")
    assert result.json()["reference_campaign_id"] == second
    states = [row["next_status"] for row in seller.get(second_path + "/history").json()]
    assert states == ["기획중", "초안 생성됨", "검수 대기", "승인됨", "게시 예약됨", "집행중", "종료", "성과 평가 완료"]
    assert {task for task, payload in fake_llm.calls} == {"draft", "review", "performance"}


def test_cancel_and_publish_race_has_single_winner(seller, api, monkeypatch):
    campaign_id = scheduled(seller)
    path = f"{BASE}/{campaign_id}"
    barrier = Barrier(2)
    original = campaign_service.owned_campaign
    def synchronized(*args, **kwargs):
        if kwargs.get("lock"):
            barrier.wait(timeout=10)
        return original(*args, **kwargs)
    monkeypatch.setattr(campaign_service, "owned_campaign", synchronized)
    clients = [api[0](), api[0]()]
    for client in clients:
        client.headers["Authorization"] = seller.headers["Authorization"]
    with ThreadPoolExecutor(max_workers=2) as executor:
        jobs = [executor.submit(clients[0].post, path + "/cancel"), executor.submit(clients[1].post, path + "/publish")]
        results = [job.result(timeout=15) for job in jobs]
    assert sorted(result.status_code for result in results) == [200, 409]
    assert seller.get(path).json()["status"] in ("취소", "집행중")
    history = seller.get(path + "/history").json()
    assert sum(row["previous_status"] == "게시 예약됨" for row in history) == 1


def test_draft_and_history_rollback_together(seller, fake_llm, mysql_engine):
    created = seller.post(BASE, json=PRODUCT).json()
    path = f"{BASE}/{created['id']}"
    def fail(mapper, connection, target):
        if target.next_status == "초안 생성됨":
            raise RuntimeError("injected history failure")
    event.listen(CampaignStatusHistory, "before_insert", fail)
    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            assert client.post(path + "/generate-draft", headers=dict(seller.headers)).status_code == 500
    finally:
        event.remove(CampaignStatusHistory, "before_insert", fail)
    detail = seller.get(path).json()
    assert detail["status"] == "기획중" and detail["content"] == "" and detail["drafts"] == {}
    assert len(seller.get(path + "/history").json()) == 1


def test_upgrade_preserves_legacy_campaign_data(api, mysql_engine):
    config = Config(str(BACKEND_ROOT / "alembic.ini"))
    config.attributes["database_url"] = mysql_engine.url.render_as_string(hide_password=False)
    try:
        command.downgrade(config, "base")
        command.upgrade(config, "0001")
        with mysql_engine.begin() as connection:
            metadata = MetaData()
            users = Table("users", metadata, autoload_with=connection)
            campaigns = Table("campaigns", metadata, autoload_with=connection)
            now = utcnow().replace(tzinfo=None)
            owner_id = connection.execute(users.insert().values(email="legacy@example.com", password_hash="not-a-login-hash", created_at=now)).inserted_primary_key[0]
            campaign_id = connection.execute(campaigns.insert().values(owner_id=owner_id, content="기존 광고", status="승인됨", initial_budget_amount=100000, initial_budget_days=7, created_at=now, updated_at=now)).inserted_primary_key[0]
        command.upgrade(config, "head")
        with Session(mysql_engine) as db:
            campaign = db.get(Campaign, campaign_id)
            assert campaign.content == "기존 광고" and campaign.status == "승인됨"
            assert campaign.channels == [] and campaign.drafts == {} and campaign.revision == 0
            assert campaign.review is None and campaign.product_name is None
    finally:
        command.upgrade(config, "head")


def test_legacy_platform_rejection_can_enter_real_review(seller, mysql_engine):
    owner_id = seller.get("/api/v1/auth/me").json()["id"]
    with Session(mysql_engine) as db:
        campaign = Campaign(owner_id=owner_id, content="기존 문자열 광고", status="승인됨", initial_budget_amount=100000, initial_budget_days=7)
        db.add(campaign)
        db.commit()
        campaign_id = campaign.id
    path = f"{BASE}/{campaign_id}"
    assert seller.post(path + "/schedule", json={"scheduled_at": "2030-01-01T00:00:00Z"}).status_code == 200
    assert seller.post(path + "/reject", json={"reason": "수정 필요"}).status_code == 200
    assert seller.post(path + "/request-revision").status_code == 200
    upgraded = seller.patch(path, json={"channels": ["instagram"], "product_category": "식품"})
    assert upgraded.status_code == 200
    assert upgraded.json()["drafts"]["instagram"]["caption"] == "기존 문자열 광고"
    assert seller.patch(path, json={"drafts": {}}).status_code == 422
    assert seller.post(path + "/request-review").json()["can_approve"]
    assert seller.post(path + "/approve").status_code == 200

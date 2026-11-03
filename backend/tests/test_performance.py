from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy import event, select
from sqlalchemy.orm import Session
from fastapi.testclient import TestClient

from app.models import Campaign, CampaignStatusHistory, Performance
from app.schemas import SummaryResult
from conftest import register_login
from test_campaigns import approved
from test_drafts import BASE, PRODUCT, fake_llm, good_drafts
from main import app

pytestmark = pytest.mark.mysql
METRICS = {"impressions": 1000, "clicks": 50, "conversions": 5, "ad_spend": 100000, "revenue": 250000}
SUMMARY = {"summary": "광고비 대비 매출이 높은 결과입니다", "next_ad_suggestions": ["다음 광고의 제목을 비교해 보세요"]}


def ended(seller):
    campaign_id = approved(seller)
    path = f"{BASE}/{campaign_id}"
    assert seller.post(path + "/schedule", json={"scheduled_at": "2030-01-01T00:00:00Z"}).status_code == 200
    assert seller.post(path + "/publish").status_code == 200
    assert seller.post(path + "/end").status_code == 200
    return path


def test_metrics_summary_and_confirmed_evaluation(seller):
    path = ended(seller)
    result = seller.put(path + "/performance", json=METRICS)
    assert result.status_code == 200
    assert Decimal(result.json()["roas"]) == Decimal("2.5")
    assert result.json()["summary_status"] == "completed"
    detail = seller.get(path).json()
    assert detail["status"] == "종료" and detail["can_complete_evaluation"]
    assert seller.post(path + "/complete-evaluation").json()["status"] == "성과 평가 완료"
    performance = seller.get(path + "/performance").json()
    assert performance["evaluated_at"] is not None
    assert seller.put(path + "/performance", json=METRICS).status_code == 409
    assert seller.post(path + "/summarize-performance").status_code == 409
    assert seller.post(path + "/cancel").status_code == 409
    assert seller.get(path + "/history").json()[-1]["snapshot"]["metrics"]["revenue"] == 250000


def test_zero_spend_roas_is_not_computable(seller):
    path = ended(seller)
    result = seller.put(path + "/performance", json={**METRICS, "ad_spend": 0})
    assert result.status_code == 200
    assert result.json()["roas"] is None
    assert result.json()["roas_display"] == "계산할 수 없음"


@pytest.mark.parametrize("field,value", [("clicks", -1), ("revenue", -1), ("ad_spend", None), ("impressions", 1.5), ("conversions", True), ("revenue", 2**63)])
def test_invalid_metrics_do_not_save_or_call_llm(seller, fake_llm, field, value):
    prepare_fake(fake_llm)
    path = ended(seller)
    count = len(fake_llm.calls)
    assert seller.put(path + "/performance", json={**METRICS, field: value}).status_code == 422
    assert len(fake_llm.calls) == count
    assert seller.get(path + "/performance").status_code == 404


def prepare_fake(fake_llm):
    fake_llm.handler = lambda task, payload: good_drafts(payload["channels"]) if task == "draft" else ({"findings": []} if task == "review" else SUMMARY)


def test_provider_failure_keeps_metrics_and_can_retry(seller, fake_llm):
    prepare_fake(fake_llm)
    path = ended(seller)
    def fail(task, payload):
        raise HTTPException(502, "요약 실패")
    fake_llm.handler = fail
    assert seller.put(path + "/performance", json=METRICS).status_code == 502
    stored = seller.get(path + "/performance").json()
    assert stored["revenue"] == METRICS["revenue"] and Decimal(stored["roas"]) == Decimal("2.5")
    assert stored["summary_status"] == "failed" and stored["summary"] is None
    assert seller.post(path + "/complete-evaluation").status_code == 409
    fake_llm.handler = lambda task, payload: SUMMARY
    assert seller.post(path + "/summarize-performance").status_code == 200
    assert seller.post(path + "/complete-evaluation").status_code == 200


def test_llm_cannot_replace_system_metrics_and_receives_no_private_fields(seller, fake_llm):
    prepare_fake(fake_llm)
    path = ended(seller)
    fake_llm.handler = lambda task, payload: {"summary": "ROAS 999라는 문장을 포함해도 시스템 숫자는 유지됩니다", "next_ad_suggestions": ["제목 비교"]}
    result = seller.put(path + "/performance", json=METRICS)
    assert result.status_code == 200 and Decimal(result.json()["roas"]) == Decimal("2.5")
    payload = fake_llm.calls[-1][1]
    assert set(payload) == {"ad_copy", "metrics"}
    assert not {"owner_id", "product_price", "customer_id", "cost", "order_id"} & payload.keys()


def test_only_owner_can_read_write_and_confirm_performance(seller, api):
    path = ended(seller)
    other = api[0]()
    register_login(other, "other@example.com")
    assert other.put(path + "/performance", json=METRICS).status_code == 404
    assert other.get(path + "/performance").status_code == 404
    assert other.post(path + "/summarize-performance").status_code == 404
    assert other.post(path + "/complete-evaluation").status_code == 404


def test_latest_evaluated_campaign_feeds_only_same_owner_drafts(seller, fake_llm, api):
    prepare_fake(fake_llm)
    path = ended(seller)
    assert seller.put(path + "/performance", json=METRICS).status_code == 200
    campaign_id = int(path.rsplit("/", 1)[1])
    # Unconfirmed results are excluded from the feedback loop.
    first = seller.post(BASE, json=PRODUCT).json()
    assert seller.post(f"{BASE}/{first['id']}/generate-draft").json()["reference_campaign_id"] is None
    assert seller.post(path + "/complete-evaluation").status_code == 200
    second = seller.post(BASE, json=PRODUCT).json()
    result = seller.post(f"{BASE}/{second['id']}/generate-draft")
    assert result.json()["reference_campaign_id"] == campaign_id
    previous = fake_llm.calls[-1][1]["previous_campaign"]
    assert previous["metrics"]["revenue"] == METRICS["revenue"]
    assert "owner_id" not in previous and "id" not in previous
    other = api[0]()
    register_login(other, "other@example.com")
    third = other.post(BASE, json=PRODUCT).json()
    assert other.post(f"{BASE}/{third['id']}/generate-draft").json()["reference_campaign_id"] is None
    assert "previous_campaign" not in fake_llm.calls[-1][1]


def test_late_summary_cannot_overwrite_new_metrics(seller, fake_llm, api):
    prepare_fake(fake_llm)
    path = ended(seller)
    concurrent = api[0]()
    concurrent.headers["Authorization"] = seller.headers["Authorization"]
    active = False
    def handler(task, payload):
        nonlocal active
        if not active:
            active = True
            assert concurrent.put(path + "/performance", json={**METRICS, "revenue": 900000}).status_code == 200
        return SUMMARY
    fake_llm.handler = handler
    assert seller.put(path + "/performance", json=METRICS).status_code == 409
    current = seller.get(path + "/performance").json()
    assert current["revenue"] == 900000 and Decimal(current["roas"]) == Decimal("9")


def test_evaluation_and_history_rollback_together(seller, mysql_engine):
    path = ended(seller)
    assert seller.put(path + "/performance", json=METRICS).status_code == 200
    def fail(mapper, connection, target):
        if target.next_status == "성과 평가 완료":
            raise RuntimeError("injected history failure")
    event.listen(CampaignStatusHistory, "before_insert", fail)
    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            assert client.post(path + "/complete-evaluation", headers=dict(seller.headers)).status_code == 500
    finally:
        event.remove(CampaignStatusHistory, "before_insert", fail)
    with Session(mysql_engine) as db:
        campaign_id = int(path.rsplit("/", 1)[1])
        assert db.get(Campaign, campaign_id).status == "종료"
        assert db.scalar(select(Performance).where(Performance.campaign_id == campaign_id)).evaluated_at is None


def test_performance_rejects_non_ended_campaign(seller):
    created = seller.post(BASE, json=PRODUCT).json()
    path = f"{BASE}/{created['id']}"
    assert seller.put(path + "/performance", json=METRICS).status_code == 409


def test_summary_cannot_be_blank():
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        SummaryResult(summary=" ", next_ad_suggestions=["제안"])

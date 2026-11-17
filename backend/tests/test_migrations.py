import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.database import utcnow
from app.models import Campaign, CampaignStatusHistory, User

from conftest import BACKEND_ROOT

pytestmark = pytest.mark.mysql


def alembic_config(engine, owner_email=None):
    config = Config(str(BACKEND_ROOT / "alembic.ini"))
    config.attributes["database_url"] = engine.url.render_as_string(hide_password=False)
    config.attributes["legacy_owner_email"] = owner_email or ""
    return config


def test_0005_assigns_ownerless_campaigns_to_legacy_owner(api, mysql_engine):
    command.downgrade(alembic_config(mysql_engine), "0004")
    try:
        with Session(mysql_engine) as db:
            # 0004 스키마에는 users.google_sub·name이 없어 사용자는 SQL로 넣는다.
            db.execute(text(
                "INSERT INTO users (email, password_hash, created_at) VALUES ('Old@Example.com', 'legacy', :now)"
            ), {"now": utcnow().replace(tzinfo=None)})
            campaign = Campaign(
                content="공유 시절 캠페인", initial_budget_amount=1000, initial_budget_days=1, status="기획중",
                channels=[], drafts={}, revision=0, created_at=utcnow(), updated_at=utcnow(),
            )
            db.add(campaign)
            db.flush()
            db.add(CampaignStatusHistory(
                campaign_id=campaign.id, previous_status=None, next_status="기획중", recorded_at=utcnow(), snapshot={},
            ))
            db.commit()
            campaign_id = campaign.id

        with pytest.raises(RuntimeError, match="LEGACY_OWNER_EMAIL"):
            command.upgrade(alembic_config(mysql_engine), "head")

        command.upgrade(alembic_config(mysql_engine, " old@example.com "), "head")
        with Session(mysql_engine) as db:
            owner = db.scalar(select(User.id).where(User.email == "Old@Example.com"))
            assert db.get(Campaign, campaign_id).owner_id == owner
            assert db.scalars(select(CampaignStatusHistory.changed_by)).all() == [owner]
    finally:
        command.upgrade(alembic_config(mysql_engine, "cleanup@example.com"), "head")


def test_0005_creates_legacy_owner_when_missing(api, mysql_engine):
    command.downgrade(alembic_config(mysql_engine), "0004")
    try:
        with Session(mysql_engine) as db:
            db.add(Campaign(
                content="공유 시절 캠페인", initial_budget_amount=1000, initial_budget_days=1, status="기획중",
                channels=[], drafts={}, revision=0, created_at=utcnow(), updated_at=utcnow(),
            ))
            db.commit()
        command.upgrade(alembic_config(mysql_engine, "New@Example.com"), "head")
        with Session(mysql_engine) as db:
            owner = db.scalar(select(User).where(User.email == "new@example.com"))
            assert owner is not None and owner.password_hash is None and owner.google_sub is None
            assert db.scalars(select(Campaign.owner_id)).all() == [owner.id]
    finally:
        command.upgrade(alembic_config(mysql_engine, "cleanup@example.com"), "head")

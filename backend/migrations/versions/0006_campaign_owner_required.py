"""Require campaign owners (contract).

새 백엔드와 로그인 화면으로 전환해 소유자 없이 쓰는 0004 백엔드가 모두 내려간 뒤에만 적용한다.
Vercel 운영 빌드는 이 리비전을 자동으로 적용하지 않는다 (scripts/vercel-build.sh, README "배포 순서").
공유 작업공간(0004) 시절 소유자 없이 만든 캠페인은 LEGACY_OWNER_EMAIL 셀러에게 넘긴다.
이 리비전 뒤에는 0004 백엔드로 되돌릴 수 없다.

Revision ID: 0006
"""
from datetime import UTC, datetime

from alembic import context, op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None

users = sa.table("users", sa.column("id", sa.BigInteger()), sa.column("email", sa.String()), sa.column("created_at", sa.DateTime()))
campaigns = sa.table("campaigns", sa.column("id", sa.BigInteger()), sa.column("owner_id", sa.BigInteger()))
history = sa.table(
    "campaign_status_history", sa.column("campaign_id", sa.BigInteger()), sa.column("changed_by", sa.BigInteger()),
)


def legacy_owner_email() -> str:
    value = context.config.attributes.get("legacy_owner_email")
    if value is None:
        from app.config import get_settings
        value = get_settings().legacy_owner_email
    return value.strip().lower()


def required_owner_email(connection) -> str | None:
    """소유자 없는 캠페인·이력이 있으면 넘겨받을 셀러 이메일을 돌려준다. DDL 전에 확인해 실패해도 스키마가 그대로 남는다."""
    orphans = connection.execute(
        sa.select(sa.func.count()).select_from(campaigns).where(campaigns.c.owner_id.is_(None))
    ).scalar()
    orphan_history = connection.execute(
        sa.select(sa.func.count()).select_from(history).where(history.c.changed_by.is_(None))
    ).scalar()
    if not orphans and not orphan_history:
        return None
    email = legacy_owner_email()
    if not email:
        raise RuntimeError(
            f"소유자 없는 캠페인 {orphans}개(이력 {orphan_history}개)가 있습니다. "
            "LEGACY_OWNER_EMAIL에 이 캠페인을 넘겨받을 셀러의 Google 이메일을 넣고 다시 실행하세요"
        )
    return email


def assign_legacy_owner(connection, email: str) -> None:
    def find_owner():
        return connection.execute(
            sa.select(users.c.id).where(sa.func.lower(users.c.email) == email).order_by(users.c.id).limit(1)
        ).scalar()

    owner_id = find_owner()
    if owner_id is None:
        connection.execute(users.insert().values(email=email, created_at=datetime.now(UTC).replace(tzinfo=None)))
        owner_id = find_owner()
    connection.execute(campaigns.update().where(campaigns.c.owner_id.is_(None)).values(owner_id=owner_id))
    # 소유자 없던 시절의 이력은 그 캠페인의 소유자가 남긴 것으로 본다.
    connection.execute(
        history.update().where(history.c.changed_by.is_(None)).values(
            changed_by=sa.select(campaigns.c.owner_id).where(campaigns.c.id == history.c.campaign_id).scalar_subquery()
        )
    )


def upgrade():
    connection = op.get_bind()
    email = required_owner_email(connection)
    if email:
        assign_legacy_owner(connection, email)
    op.alter_column("campaigns", "owner_id", existing_type=sa.BigInteger(), nullable=False)
    op.alter_column("campaign_status_history", "changed_by", existing_type=sa.BigInteger(), nullable=False)


def downgrade():
    op.alter_column("campaign_status_history", "changed_by", existing_type=sa.BigInteger(), nullable=True)
    op.alter_column("campaigns", "owner_id", existing_type=sa.BigInteger(), nullable=True)

"""Google login accounts and cookie sessions.

공유 작업공간(0004) 시절 소유자 없이 만든 캠페인은 LEGACY_OWNER_EMAIL 셀러에게 넘긴다.
그 이메일로 Google 로그인하면 auth.upsert_user가 이 계정과 연결한다.

Revision ID: 0005
"""
from datetime import UTC, datetime

from alembic import context, op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
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
    op.alter_column("users", "password_hash", existing_type=sa.String(255), nullable=True)
    if email:
        assign_legacy_owner(connection, email)
    op.alter_column("campaigns", "owner_id", existing_type=sa.BigInteger(), nullable=False)
    op.alter_column("campaign_status_history", "changed_by", existing_type=sa.BigInteger(), nullable=False)
    op.add_column("users", sa.Column("google_sub", sa.String(255)))
    op.add_column("users", sa.Column("name", sa.String(200)))
    op.create_unique_constraint("uq_users_google_sub", "users", ["google_sub"])
    # 예전 Refresh Token 세션은 새 쿠키 세션으로 쓸 수 없으므로 비운다.
    op.execute(sa.text("DELETE FROM auth_sessions"))
    op.alter_column(
        "auth_sessions", "refresh_token_hash", new_column_name="token_hash",
        existing_type=sa.String(64), existing_nullable=False,
    )
    op.create_unique_constraint("uq_auth_sessions_token_hash", "auth_sessions", ["token_hash"])


def downgrade():
    connection = op.get_bind()
    if connection.execute(sa.text("SELECT 1 FROM users WHERE password_hash IS NULL LIMIT 1")).first():
        raise RuntimeError("Google-only accounts have no password and cannot be downgraded")
    op.drop_constraint("uq_auth_sessions_token_hash", "auth_sessions", type_="unique")
    op.execute(sa.text("DELETE FROM auth_sessions"))
    op.alter_column(
        "auth_sessions", "token_hash", new_column_name="refresh_token_hash",
        existing_type=sa.String(64), existing_nullable=False,
    )
    op.drop_constraint("uq_users_google_sub", "users", type_="unique")
    op.drop_column("users", "name")
    op.drop_column("users", "google_sub")
    op.alter_column("users", "password_hash", existing_type=sa.String(255), nullable=False)
    op.alter_column("campaign_status_history", "changed_by", existing_type=sa.BigInteger(), nullable=True)
    op.alter_column("campaigns", "owner_id", existing_type=sa.BigInteger(), nullable=True)

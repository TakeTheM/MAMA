"""Supabase Auth accounts; drop cookie sessions.

로그인을 Supabase Auth로 옮긴다. 셀러는 Supabase 사용자 UUID(supabase_user_id)로 찾는다.
- users.google_sub는 예전 직접 Google 로그인 기록으로 남긴다(새 로그인은 쓰지 않는다).
- auth_sessions(mama_session 쿠키 세션)는 새 백엔드가 읽지 않으므로 지운다. 프론트는 이미 Bearer 토큰만 보내
  예전 쿠키 세션은 쓸 곳이 없다. 되돌리면 빈 표로 다시 만든다(예전 세션은 복구되지 않는다).

Revision ID: 0007
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None
OPTIONS = {"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4"}


def upgrade():
    op.add_column("users", sa.Column("supabase_user_id", sa.String(36)))
    op.create_unique_constraint("uq_users_supabase_user_id", "users", ["supabase_user_id"])
    op.drop_index("ix_auth_sessions_user_id", table_name="auth_sessions")
    op.drop_table("auth_sessions")


def downgrade():
    datetime = sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql")
    op.create_table(
        "auth_sessions",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", datetime, nullable=False),
        sa.Column("revoked_at", datetime),
        sa.Column("created_at", datetime, nullable=False),
        sa.UniqueConstraint("token_hash", name="uq_auth_sessions_token_hash"),
        **OPTIONS,
    )
    op.create_index("ix_auth_sessions_user_id", "auth_sessions", ["user_id"])
    op.drop_constraint("uq_users_supabase_user_id", "users", type_="unique")
    op.drop_column("users", "supabase_user_id")

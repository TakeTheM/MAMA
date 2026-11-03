"""JWT sessions and manually recorded campaign execution.

Revision ID: 0001
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None
OPTIONS = {"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4"}


def upgrade():
    op.create_table(
        "users",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("email", sa.String(254), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("created_at", mysql.DATETIME(fsp=6), nullable=False),
        sa.UniqueConstraint("email"),
        **OPTIONS,
    )
    op.create_table(
        "auth_sessions",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("refresh_token_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", mysql.DATETIME(fsp=6), nullable=False),
        sa.Column("revoked_at", mysql.DATETIME(fsp=6)),
        sa.Column("created_at", mysql.DATETIME(fsp=6), nullable=False),
        **OPTIONS,
    )
    op.create_index("ix_auth_sessions_user_id", "auth_sessions", ["user_id"])
    op.create_table(
        "campaigns",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("owner_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("initial_budget_amount", sa.BigInteger(), nullable=False),
        sa.Column("initial_budget_days", sa.Integer(), nullable=False),
        sa.Column("scheduled_at", mysql.DATETIME(fsp=6)),
        sa.Column("budget_amount", sa.BigInteger()),
        sa.Column("budget_days", sa.Integer()),
        sa.Column("published_at", mysql.DATETIME(fsp=6)),
        sa.Column("ended_at", mysql.DATETIME(fsp=6)),
        sa.Column("created_at", mysql.DATETIME(fsp=6), nullable=False),
        sa.Column("updated_at", mysql.DATETIME(fsp=6), nullable=False),
        sa.CheckConstraint("initial_budget_amount > 0", name="ck_campaign_initial_amount"),
        sa.CheckConstraint("initial_budget_days > 0", name="ck_campaign_initial_days"),
        sa.CheckConstraint("budget_amount IS NULL OR budget_amount > 0", name="ck_campaign_amount"),
        sa.CheckConstraint("budget_days IS NULL OR budget_days > 0", name="ck_campaign_days"),
        sa.CheckConstraint("status IN ('기획중','승인됨','게시 예약됨','집행중','종료','플랫폼 반려','수정 요청')", name="ck_campaign_status"),
        **OPTIONS,
    )
    op.create_index("ix_campaigns_owner_created", "campaigns", ["owner_id", "created_at", "id"])
    op.create_table(
        "campaign_status_history",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("campaign_id", sa.BigInteger(), sa.ForeignKey("campaigns.id"), nullable=False),
        sa.Column("previous_status", sa.String(30)),
        sa.Column("next_status", sa.String(30), nullable=False),
        sa.Column("changed_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("recorded_at", mysql.DATETIME(fsp=6), nullable=False),
        sa.Column("snapshot", mysql.JSON(), nullable=False),
        **OPTIONS,
    )
    op.create_index("ix_history_campaign_time", "campaign_status_history", ["campaign_id", "recorded_at", "id"])


def downgrade():
    op.drop_table("campaign_status_history")
    op.drop_table("campaigns")
    op.drop_table("auth_sessions")
    op.drop_table("users")

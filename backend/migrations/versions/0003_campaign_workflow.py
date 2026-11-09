"""Persist campaign reviews and performance evaluations."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision = "0003"
down_revision = "0002"
branch_labels = depends_on = None

OLD = "'기획중','초안 생성됨','승인됨','게시 예약됨','집행중','종료','플랫폼 반려','수정 요청'"
NEW = OLD + ",'검수 대기','취소','성과 평가 완료'"


def replace_status_constraint(values):
    op.drop_constraint("ck_campaign_status", "campaigns", type_="check")
    op.create_check_constraint("ck_campaign_status", "campaigns", f"status IN ({values})")


def upgrade():
    op.add_column("campaigns", sa.Column("review", sa.JSON(), nullable=True))
    op.add_column("campaigns", sa.Column("performance", sa.JSON(), nullable=True))
    op.add_column("campaigns", sa.Column("evaluated_at", sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql"), nullable=True))
    op.create_index("ix_campaigns_owner_evaluated", "campaigns", ["owner_id", "status", "evaluated_at", "id"])
    replace_status_constraint(NEW)


def downgrade():
    new_states = ("검수 대기", "취소", "성과 평가 완료")
    campaigns = sa.table("campaigns", sa.column("status"), sa.column("performance"))
    history = sa.table("campaign_status_history", sa.column("next_status"), sa.column("previous_status"))
    connection = op.get_bind()
    has_workflow = sa.select(campaigns.c.status).where(
        sa.or_(campaigns.c.status.in_(new_states), campaigns.c.performance.is_not(None))
    ).limit(1)
    has_history = sa.select(history.c.next_status).where(
        sa.or_(history.c.next_status.in_(new_states), history.c.previous_status.in_(new_states))
    ).limit(1)
    if connection.execute(has_workflow).first() or connection.execute(has_history).first():
        raise RuntimeError("Downgrade would discard campaign workflow data or make its history unreadable")
    replace_status_constraint(OLD)
    op.drop_index("ix_campaigns_owner_evaluated", table_name="campaigns")
    for name in ("evaluated_at", "performance", "review"):
        op.drop_column("campaigns", name)

"""Allow campaigns and history entries without user accounts."""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

OWNER_COLUMNS = (("campaigns", "owner_id"), ("campaign_status_history", "changed_by"))


def upgrade():
    for table, column in OWNER_COLUMNS:
        op.alter_column(table, column, existing_type=sa.BigInteger(), nullable=True)
    op.create_index("ix_campaigns_created", "campaigns", ["created_at", "id"])
    op.create_index("ix_campaigns_evaluated", "campaigns", ["status", "evaluated_at", "id"])


def downgrade():
    connection = op.get_bind()
    for table, column in OWNER_COLUMNS:
        rows = sa.table(table, sa.column(column))
        if connection.execute(sa.select(1).select_from(rows).where(rows.c[column].is_(None)).limit(1)).first():
            raise RuntimeError("Assign owners to shared workspace records before downgrading")
    op.drop_index("ix_campaigns_evaluated", table_name="campaigns")
    op.drop_index("ix_campaigns_created", table_name="campaigns")
    for table, column in OWNER_COLUMNS:
        op.alter_column(table, column, existing_type=sa.BigInteger(), nullable=False)

"""F-01 product input and channel drafts."""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = depends_on = None
OLD = "'기획중','승인됨','게시 예약됨','집행중','종료','플랫폼 반려','수정 요청'"


def upgrade():
    for name, datatype in (
        ("product_name", sa.String(200)), ("product_description", sa.Text()),
        ("product_category", sa.String(100)), ("product_price", sa.BigInteger()),
        ("goal", sa.String(1000)), ("target_audience", sa.String(1000)),
        ("reference_campaign_id", sa.BigInteger()),
    ):
        op.add_column("campaigns", sa.Column(name, datatype))
    op.add_column("campaigns", sa.Column("channels", sa.JSON(), nullable=True))
    op.add_column("campaigns", sa.Column("drafts", sa.JSON(), nullable=True))
    op.add_column("campaigns", sa.Column("revision", sa.Integer(), nullable=False, server_default="0"))
    op.execute("UPDATE campaigns SET channels = '[]', drafts = '{}'")
    op.alter_column("campaigns", "channels", existing_type=sa.JSON(), nullable=False)
    op.alter_column("campaigns", "drafts", existing_type=sa.JSON(), nullable=False)
    op.alter_column("campaigns", "revision", existing_type=sa.Integer(), server_default=None)
    op.drop_constraint("ck_campaign_status", "campaigns", type_="check")
    op.create_check_constraint("ck_campaign_status", "campaigns", f"status IN ({OLD},'초안 생성됨')")


def downgrade():
    op.execute("UPDATE campaigns SET status='기획중' WHERE status='초안 생성됨'")
    op.drop_constraint("ck_campaign_status", "campaigns", type_="check")
    op.create_check_constraint("ck_campaign_status", "campaigns", f"status IN ({OLD})")
    for name in ("revision", "drafts", "channels", "reference_campaign_id", "target_audience", "goal", "product_price", "product_category", "product_description", "product_name"):
        op.drop_column("campaigns", name)

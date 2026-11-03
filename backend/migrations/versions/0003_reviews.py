"""F-02 review results, warning policy and review pending state."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision = "0003"
down_revision = "0002"
branch_labels = depends_on = None
OLD = "'기획중','초안 생성됨','승인됨','게시 예약됨','집행중','종료','플랫폼 반려','수정 요청'"


def upgrade():
    op.add_column("campaigns", sa.Column("review", mysql.JSON(none_as_null=True)))
    op.add_column("campaigns", sa.Column("review_revision", sa.Integer()))
    op.drop_constraint("ck_campaign_status", "campaigns", type_="check")
    op.create_check_constraint("ck_campaign_status", "campaigns", f"status IN ({OLD},'검수 대기')")


def downgrade():
    op.execute("UPDATE campaigns SET status='초안 생성됨' WHERE status='검수 대기'")
    op.drop_constraint("ck_campaign_status", "campaigns", type_="check")
    op.create_check_constraint("ck_campaign_status", "campaigns", f"status IN ({OLD})")
    op.drop_column("campaigns", "review_revision")
    op.drop_column("campaigns", "review")

"""F-03 terminal cancellation state."""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = depends_on = None
OLD = "'기획중','초안 생성됨','검수 대기','승인됨','게시 예약됨','집행중','종료','플랫폼 반려','수정 요청'"


def upgrade():
    op.drop_constraint("ck_campaign_status", "campaigns", type_="check")
    op.create_check_constraint("ck_campaign_status", "campaigns", f"status IN ({OLD},'취소')")


def downgrade():
    if op.get_bind().scalar(sa.text("SELECT COUNT(*) FROM campaigns WHERE status='취소'")):
        raise RuntimeError("취소 캠페인이 있어 안전하게 다운그레이드할 수 없습니다")
    op.drop_constraint("ck_campaign_status", "campaigns", type_="check")
    op.create_check_constraint("ck_campaign_status", "campaigns", f"status IN ({OLD})")

"""F-05 manual metrics, calculated ROAS, confirmed evaluation."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision = "0005"
down_revision = "0004"
branch_labels = depends_on = None
OLD = "'기획중','초안 생성됨','검수 대기','승인됨','게시 예약됨','집행중','종료','플랫폼 반려','수정 요청','취소'"


def upgrade():
    op.create_table(
        "campaign_performance",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("campaign_id", sa.BigInteger(), sa.ForeignKey("campaigns.id"), nullable=False, unique=True),
        *[sa.Column(name, sa.BigInteger(), nullable=False) for name in ("impressions", "clicks", "conversions", "ad_spend", "revenue")],
        sa.Column("roas", sa.Numeric(30, 6)),
        sa.Column("summary", sa.Text()),
        sa.Column("next_ad_suggestions", sa.JSON(), nullable=False),
        sa.Column("summary_status", sa.String(20), nullable=False),
        sa.Column("last_error", sa.String(1000)),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("evaluated_at", sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql")),
        sa.Column("created_at", sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql"), nullable=False),
        sa.Column("updated_at", sa.DateTime().with_variant(mysql.DATETIME(fsp=6), "mysql"), nullable=False),
        sa.CheckConstraint("impressions >= 0 AND clicks >= 0 AND conversions >= 0 AND ad_spend >= 0 AND revenue >= 0", name="ck_performance_nonnegative"),
        sa.CheckConstraint("summary_status IN ('pending','running','completed','failed')", name="ck_performance_summary_status"),
        mysql_engine="InnoDB", mysql_charset="utf8mb4",
    )
    op.drop_constraint("ck_campaign_status", "campaigns", type_="check")
    op.create_check_constraint("ck_campaign_status", "campaigns", f"status IN ({OLD},'성과 평가 완료')")


def downgrade():
    if op.get_bind().scalar(sa.text("SELECT COUNT(*) FROM campaigns WHERE status='성과 평가 완료'")):
        raise RuntimeError("평가 완료 캠페인이 있어 안전하게 다운그레이드할 수 없습니다")
    op.drop_constraint("ck_campaign_status", "campaigns", type_="check")
    op.create_check_constraint("ck_campaign_status", "campaigns", f"status IN ({OLD})")
    op.drop_table("campaign_performance")

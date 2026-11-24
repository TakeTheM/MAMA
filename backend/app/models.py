from datetime import datetime
from enum import StrEnum

from sqlalchemy import BigInteger, CheckConstraint, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base, UTCDateTime, utcnow

TABLE_OPTIONS = {"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4"}


class CampaignStatus(StrEnum):
    PLANNING = "기획중"
    DRAFTED = "초안 생성됨"
    REVIEW_PENDING = "검수 대기"
    APPROVED = "승인됨"
    SCHEDULED = "게시 예약됨"
    RUNNING = "집행중"
    ENDED = "종료"
    REJECTED = "플랫폼 반려"
    REVISION_REQUESTED = "수정 요청"
    CANCELED = "취소"
    EVALUATED = "성과 평가 완료"


class User(Base):
    """Supabase Auth(Google)로 로그인한 셀러.

    supabase_user_id는 Supabase 사용자 UUID(토큰의 sub)다. google_sub는 예전 직접 Google 로그인(0005~0006) 기록이고,
    password_hash는 예전 이메일 로그인 계정에만 남아 있다. 둘 다 새 로그인에서는 쓰지 않는다.
    """

    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("google_sub", name="uq_users_google_sub"),
        UniqueConstraint("supabase_user_id", name="uq_users_supabase_user_id"),
        TABLE_OPTIONS,
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    password_hash: Mapped[str | None] = mapped_column(String(255))
    google_sub: Mapped[str | None] = mapped_column(String(255))
    supabase_user_id: Mapped[str | None] = mapped_column(String(36))
    name: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class Campaign(Base):
    __tablename__ = "campaigns"
    __table_args__ = (
        CheckConstraint("initial_budget_amount > 0", name="ck_campaign_initial_amount"),
        CheckConstraint("initial_budget_days > 0", name="ck_campaign_initial_days"),
        CheckConstraint("budget_amount IS NULL OR budget_amount > 0", name="ck_campaign_amount"),
        CheckConstraint("budget_days IS NULL OR budget_days > 0", name="ck_campaign_days"),
        CheckConstraint(
            "status IN (" + ",".join(f"'{status.value}'" for status in CampaignStatus) + ")",
            name="ck_campaign_status",
        ),
        Index("ix_campaigns_owner_created", "owner_id", "created_at", "id"),
        Index("ix_campaigns_owner_evaluated", "owner_id", "status", "evaluated_at", "id"),
        Index("ix_campaigns_created", "created_at", "id"),
        Index("ix_campaigns_evaluated", "status", "evaluated_at", "id"),
        TABLE_OPTIONS,
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    content: Mapped[str] = mapped_column(Text)
    product_name: Mapped[str | None] = mapped_column(String(200))
    product_description: Mapped[str | None] = mapped_column(Text)
    product_category: Mapped[str | None] = mapped_column(String(100))
    product_price: Mapped[int | None] = mapped_column(BigInteger)
    goal: Mapped[str | None] = mapped_column(String(1000))
    target_audience: Mapped[str | None] = mapped_column(String(1000))
    channels: Mapped[list] = mapped_column(JSON, default=list)
    drafts: Mapped[dict] = mapped_column(JSON, default=dict)
    reference_campaign_id: Mapped[int | None] = mapped_column(BigInteger)
    revision: Mapped[int] = mapped_column(Integer, default=0)
    review: Mapped[dict | None] = mapped_column(JSON)
    performance: Mapped[dict | None] = mapped_column(JSON)
    evaluated_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    status: Mapped[str] = mapped_column(String(30), default=CampaignStatus.PLANNING)
    initial_budget_amount: Mapped[int] = mapped_column(BigInteger)
    initial_budget_days: Mapped[int] = mapped_column(Integer)
    scheduled_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    budget_amount: Mapped[int | None] = mapped_column(BigInteger)
    budget_days: Mapped[int | None] = mapped_column(Integer)
    published_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    ended_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class CampaignStatusHistory(Base):
    __tablename__ = "campaign_status_history"
    __table_args__ = (Index("ix_history_campaign_time", "campaign_id", "recorded_at", "id"), TABLE_OPTIONS)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id"))
    previous_status: Mapped[str | None] = mapped_column(String(30))
    next_status: Mapped[str] = mapped_column(String(30))
    changed_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    recorded_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    snapshot: Mapped[dict] = mapped_column(JSON)

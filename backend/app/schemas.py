from datetime import datetime
from typing import Annotated, Literal

from pydantic import AwareDatetime, BaseModel, BeforeValidator, ConfigDict, EmailStr, Field, field_validator

from app.models import CampaignStatus

Amount = Annotated[int, Field(strict=True, gt=0, le=9_223_372_036_854_775_807)]
Days = Annotated[int, Field(strict=True, gt=0, le=2_147_483_647)]
Content = Annotated[str, Field(min_length=1, max_length=10_000)]
Channel = Literal["instagram", "x", "tiktok"]


class ProductFields(BaseModel):
    product_name: str | None = Field(default=None, min_length=1, max_length=200)
    product_description: str | None = Field(default=None, min_length=1, max_length=10000)
    product_category: str | None = Field(default=None, min_length=1, max_length=100)
    product_price: Annotated[int, Field(strict=True, ge=0, le=9_223_372_036_854_775_807)] | None = None
    goal: str | None = Field(default=None, min_length=1, max_length=1000)
    target_audience: str | None = Field(default=None, min_length=1, max_length=1000)
    channels: list[Channel] = Field(default_factory=list, max_length=3)

    @field_validator("product_name", "product_description", "product_category", "goal", "target_audience")
    @classmethod
    def nonblank_product(cls, value):
        if value is not None and not value.strip():
            raise ValueError("공백만 입력할 수 없습니다")
        return value

    @field_validator("channels")
    @classmethod
    def unique_channels(cls, value):
        if len(value) != len(set(value)):
            raise ValueError("채널은 중복할 수 없습니다")
        return value


class ChannelDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")
    caption: Content
    hashtags: list[Annotated[str, Field(min_length=1, max_length=100)]] = Field(max_length=50)

    @field_validator("caption", "hashtags")
    @classmethod
    def reject_blank(cls, value):
        values = [value] if isinstance(value, str) else value
        if any(not item.strip() for item in values):
            raise ValueError("캡션과 해시태그는 공백일 수 없습니다")
        return value


class DraftResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    drafts: dict[Channel, ChannelDraft]


def parse_iso_datetime(value):
    if isinstance(value, datetime):
        return value
    if not isinstance(value, str):
        raise ValueError("시각은 시간대가 포함된 ISO 8601 문자열이어야 합니다")
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        raise ValueError("시각은 시간대가 포함된 ISO 8601 문자열이어야 합니다") from None


ISODateTime = Annotated[AwareDatetime, BeforeValidator(parse_iso_datetime)]


class InputModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Credentials(InputModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={"example": {"email": "seller@example.com", "password": "example-password-123"}},
    )
    email: EmailStr = Field(max_length=254)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value):
        return value.strip().lower() if isinstance(value, str) else value


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str
    created_at: datetime


class TokenOut(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int = 900


class CampaignCreate(ProductFields, InputModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={"example": {"content": "오늘 구운 빵을 만나보세요", "initial_budget_amount": 100000, "initial_budget_days": 7}},
    )
    content: Content = ""
    initial_budget_amount: Amount
    initial_budget_days: Days

    @field_validator("content")
    @classmethod
    def nonblank_content(cls, value):
        if not value.strip():
            raise ValueError("광고 내용은 공백일 수 없습니다")
        return value


class CampaignPatch(ProductFields, InputModel):
    content: Content | None = None
    initial_budget_amount: Amount | None = None
    initial_budget_days: Days | None = None
    drafts: dict[Channel, ChannelDraft] | None = None

    @field_validator("content")
    @classmethod
    def nonblank_content(cls, value):
        if value is not None and not value.strip():
            raise ValueError("광고 내용은 공백일 수 없습니다")
        return value

    @field_validator("content", "initial_budget_amount", "initial_budget_days", mode="before")
    @classmethod
    def reject_explicit_null(cls, value):
        if value is None:
            raise ValueError("수정할 값은 null일 수 없습니다")
        return value


class ScheduleInput(InputModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={"example": {"scheduled_at": "2030-01-01T09:00:00+09:00", "budget_amount": 100000, "budget_days": 7}},
    )
    scheduled_at: ISODateTime
    budget_amount: Amount | None = None
    budget_days: Days | None = None

    @field_validator("budget_amount", "budget_days", mode="before")
    @classmethod
    def reject_explicit_null(cls, value):
        if value is None:
            raise ValueError("예산은 null일 수 없습니다; 기본값은 필드를 생략하세요")
        return value


class PublishInput(InputModel):
    published_at: ISODateTime | None = None


class EndInput(InputModel):
    ended_at: ISODateTime | None = None


class RejectInput(InputModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={"example": {"reason": "플랫폼 심사에서 광고 표현 수정을 요청했습니다"}},
    )
    reason: str = Field(min_length=1, max_length=10_000)

    @field_validator("reason")
    @classmethod
    def nonblank_reason(cls, value):
        if not value.strip():
            raise ValueError("반려 사유는 공백일 수 없습니다")
        return value


class ReviewRequest(InputModel):
    drafts: dict[Channel, ChannelDraft] | None = None


Rule = Literal["R1", "R3", "R4", "R5"]
ReviewChannel = Channel | Literal["legacy"]


class ReviewFinding(InputModel):
    channel: ReviewChannel
    start: int = Field(strict=True, ge=0)
    end: int = Field(strict=True, gt=0)
    quote: Content
    rule: Rule
    reason: Content
    evidence_url: str | None = None
    suggestion: Content

    @field_validator("reason", "suggestion")
    @classmethod
    def reject_blank(cls, value):
        if not value.strip():
            raise ValueError("공백만 입력할 수 없습니다")
        return value


class ReviewResult(InputModel):
    findings: list[ReviewFinding] = Field(max_length=200)


class ReviewOut(InputModel):
    status: Literal["pending", "failed", "passed", "changes_requested"]
    findings: list[ReviewFinding]


Metric = Annotated[int, Field(strict=True, ge=0, le=9_223_372_036_854_775_807)]


class PerformanceInput(InputModel):
    impressions: Metric
    clicks: Metric
    conversions: Metric
    ad_spend: Metric
    revenue: Metric


class PerformanceSummary(InputModel):
    summary: Content
    suggestion: Content

    @field_validator("summary", "suggestion")
    @classmethod
    def reject_blank(cls, value):
        if not value.strip():
            raise ValueError("공백만 입력할 수 없습니다")
        return value


class PerformanceOut(PerformanceInput):
    roas: float | None
    status: Literal["pending", "failed", "ready", "completed"]
    summary: str | None = None
    suggestion: str | None = None
    evaluated_at: datetime | None = None


class CampaignOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    owner_id: int
    content: str
    product_name: str | None
    product_description: str | None
    product_category: str | None
    product_price: int | None
    goal: str | None
    target_audience: str | None
    channels: list[Channel]
    drafts: dict[Channel, ChannelDraft]
    reference_campaign_id: int | None
    revision: int
    status: CampaignStatus
    initial_budget_amount: int
    initial_budget_days: int
    scheduled_at: datetime | None
    budget_amount: int | None
    budget_days: int | None
    published_at: datetime | None
    ended_at: datetime | None
    created_at: datetime
    updated_at: datetime
    allowed_actions: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    rejection_reason: str | None = None
    review: ReviewOut | None = None


class CampaignList(BaseModel):
    items: list[CampaignOut]
    limit: int
    offset: int


class HistoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    campaign_id: int
    previous_status: CampaignStatus | None
    next_status: CampaignStatus
    changed_by: int
    recorded_at: datetime
    snapshot: dict

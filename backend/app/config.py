from functools import lru_cache
from pathlib import Path

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[1] / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = ""
    llm_api_key: SecretStr = SecretStr("")
    llm_base_url: str = "https://api.openai.com/v1"
    llm_model: str = ""
    llm_timeout: float = 60
    # Supabase Auth 로그인 확인 (docs: backend/README.md "로그인(Supabase Auth)"). https://<프로젝트ref>.supabase.co
    supabase_url: str = ""

    @field_validator("supabase_url")
    @classmethod
    def _strip_trailing_slash(cls, value: str) -> str:
        return value.strip().rstrip("/")
    # 마이그레이션 0006 전용: 소유자 없이 만든 예전 캠페인을 넘겨받을 셀러의 Google 이메일
    legacy_owner_email: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()

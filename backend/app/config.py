from functools import lru_cache
from pathlib import Path

from pydantic import SecretStr
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
    # Google 로그인 (docs: backend/README.md "Google 로그인")
    google_client_id: str = ""
    google_client_secret: SecretStr = SecretStr("")
    # Google에 등록한 승인된 리디렉션 URI와 글자까지 같아야 한다. 프론트 주소 + /api/v1/auth/google/callback
    google_redirect_uri: str = "http://localhost:3000/api/v1/auth/google/callback"
    # 로그인 중간 상태 쿠키 서명용. 32자 이상 임의 문자열
    jwt_secret: SecretStr = SecretStr("")
    # 배포(https)에서는 true. 로컬 http에서는 false여야 쿠키가 저장된다
    cookie_secure: bool = False
    session_days: int = 7
    # 마이그레이션 0005 전용: 소유자 없이 만든 예전 캠페인을 넘겨받을 셀러의 Google 이메일
    legacy_owner_email: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()

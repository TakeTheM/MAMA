from functools import lru_cache
from pathlib import Path

from fastapi import HTTPException
from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[1] / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = ""
    jwt_secret: SecretStr = SecretStr("")
    jwt_issuer: str = "mama-api"
    jwt_audience: str = "mama-api"
    cookie_secure: bool = False
    allowed_origins: str = "http://localhost:3000,http://localhost:8000"

    def signing_key(self) -> str:
        key = self.jwt_secret.get_secret_value()
        if len(key.encode()) < 32:
            raise HTTPException(503, "JWT_SECRET은 32바이트 이상으로 설정해 주세요")
        return key

    @property
    def origins(self) -> set[str]:
        return {origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()}


@lru_cache
def get_settings() -> Settings:
    return Settings()

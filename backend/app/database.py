from collections.abc import Iterator
from datetime import UTC, datetime
from functools import lru_cache

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.dialects.mysql import DATETIME
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import DeclarativeBase, Session
from sqlalchemy.types import TypeDecorator

from app.config import get_settings


def utcnow() -> datetime:
    return datetime.now(UTC)


class UTCDateTime(TypeDecorator):
    """MySQL DATETIME stores UTC without an offset; Python always receives aware UTC."""

    impl = DATETIME(fsp=6)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("timezone is required")
        return value.astimezone(UTC).replace(tzinfo=None)

    def process_result_value(self, value, dialect):
        return value.replace(tzinfo=UTC) if value is not None else None


class Base(DeclarativeBase):
    pass


def make_engine(url: str) -> Engine:
    parsed = make_url(url)
    if parsed.drivername != "mysql+pymysql":
        raise ValueError("DATABASE_URL must use mysql+pymysql")
    return create_engine(
        parsed.update_query_dict({"charset": "utf8mb4"}),
        pool_pre_ping=True,
        hide_parameters=True,
        connect_args={"init_command": "SET time_zone = '+00:00'"},
    )


@lru_cache
def get_engine() -> Engine:
    url = get_settings().database_url
    if not url:
        raise HTTPException(503, "DATABASE_URL을 설정해 주세요")
    return make_engine(url)


def get_db() -> Iterator[Session]:
    with Session(get_engine(), expire_on_commit=False) as session:
        # Uncommitted changes and locks are rolled back on every error path.
        yield session

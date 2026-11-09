from collections.abc import Iterator
from datetime import UTC, datetime
from functools import lru_cache

from fastapi import HTTPException
from sqlalchemy import DateTime, create_engine
from sqlalchemy.dialects.mysql import DATETIME
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.exc import ArgumentError
from sqlalchemy.orm import DeclarativeBase, Session
from sqlalchemy.pool import NullPool
from sqlalchemy.types import TypeDecorator

from app.config import get_settings


def utcnow() -> datetime:
    return datetime.now(UTC)


class UTCDateTime(TypeDecorator):
    """Store naive UTC on either database and always expose aware UTC in Python."""

    impl = DateTime
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "mysql":
            return dialect.type_descriptor(DATETIME(fsp=6))
        return dialect.type_descriptor(DateTime(timezone=False))

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("timezone is required")
        return value.astimezone(UTC).replace(tzinfo=None)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


class Base(DeclarativeBase):
    pass


def normalize_database_url(url):
    parsed = make_url(url)
    if parsed.drivername in ("postgresql", "postgres", "postgresql+psycopg"):
        return parsed.set(drivername="postgresql+psycopg")
    if parsed.drivername == "mysql+pymysql":
        return parsed
    raise ValueError("DATABASE_URL must use postgresql, postgresql+psycopg or mysql+pymysql")


def make_engine(url: str) -> Engine:
    parsed = normalize_database_url(url)
    if parsed.drivername == "postgresql+psycopg":
        return create_engine(
            parsed,
            poolclass=NullPool,
            hide_parameters=True,
            connect_args={"prepare_threshold": None, "connect_timeout": 10},
        )
    return create_engine(
        parsed.update_query_dict({"charset": "utf8mb4"}),
        pool_pre_ping=True,
        hide_parameters=True,
        connect_args={"init_command": "SET time_zone = '+00:00'", "connect_timeout": 10},
    )


@lru_cache
def get_engine() -> Engine:
    url = get_settings().database_url
    if not url:
        raise HTTPException(503, "DATABASE_URL을 설정해 주세요")
    try:
        return make_engine(url)
    except (ArgumentError, ValueError, TypeError):
        raise HTTPException(503, "DATABASE_URL 형식을 확인해 주세요") from None


def get_db() -> Iterator[Session]:
    with Session(get_engine(), expire_on_commit=False) as session:
        # Uncommitted changes and locks are rolled back on every error path.
        yield session

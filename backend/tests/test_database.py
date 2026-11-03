from datetime import UTC, datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy.dialects import mysql, postgresql
from sqlalchemy.engine import URL
from sqlalchemy.exc import OperationalError
from sqlalchemy.pool import NullPool
from sqlalchemy.schema import CreateTable

from app import database
from app.config import Settings
from app.database import Base, UTCDateTime, get_engine, make_engine
from main import app


@pytest.mark.parametrize("driver", ["postgresql", "postgres", "postgresql+psycopg"])
def test_postgres_pooler_configuration(monkeypatch, driver):
    captured = {}
    sentinel = object()
    def factory(url, **kwargs):
        captured.update(url=url, **kwargs)
        return sentinel
    monkeypatch.setattr(database, "create_engine", factory)
    url = URL.create(driver, username="postgres.project", password="secret:postgresql://@?#", host="pooler.example", port=6543, database="postgres", query={"sslmode": "require"})
    assert make_engine(url) is sentinel
    assert captured["url"].drivername == "postgresql+psycopg"
    assert captured["url"].password == url.password
    assert captured["url"].query["sslmode"] == "require"
    assert captured["poolclass"] is NullPool
    assert captured["connect_args"]["prepare_threshold"] is None
    assert captured["hide_parameters"]


def test_mysql_configuration_remains_available(monkeypatch):
    captured = {}
    monkeypatch.setattr(database, "create_engine", lambda url, **kwargs: captured.update(url=url, **kwargs))
    make_engine("mysql+pymysql://user:password@localhost/mama")
    assert captured["url"].query["charset"] == "utf8mb4"
    assert captured["pool_pre_ping"]
    assert "prepare_threshold" not in captured["connect_args"]


@pytest.mark.parametrize("url", ["", "bad-url-with-sensitive-password", "sqlite:///sensitive.db"])
def test_missing_or_invalid_database_url_is_safe_503(monkeypatch, url):
    get_engine.cache_clear()
    monkeypatch.setattr(database, "get_settings", lambda: Settings(_env_file=None, database_url=url))
    try:
        with pytest.raises(HTTPException) as caught:
            get_engine()
        assert caught.value.status_code == 503
        assert "sensitive" not in caught.value.detail
    finally:
        get_engine.cache_clear()


def test_metadata_compiles_on_both_database_dialects():
    for dialect in (mysql.dialect(), postgresql.dialect()):
        for table in Base.metadata.sorted_tables:
            ddl = str(CreateTable(table).compile(dialect=dialect))
            if dialect.name == "postgresql":
                assert "DATETIME" not in ddl


def test_utc_datetime_normalizes_without_losing_offsets():
    datatype = UTCDateTime()
    korean_time = datetime(2026, 11, 3, 12, tzinfo=timezone(timedelta(hours=9)))
    assert datatype.process_bind_param(korean_time, postgresql.dialect()) == datetime(2026, 11, 3, 3)
    assert datatype.process_result_value(datetime(2026, 11, 3, 3), postgresql.dialect()) == korean_time.astimezone(UTC)
    assert datatype.process_result_value(korean_time, postgresql.dialect()) == korean_time.astimezone(UTC)
    with pytest.raises(ValueError):
        datatype.process_bind_param(datetime(2026, 11, 3, 3), postgresql.dialect())


def test_db_health_failure_does_not_expose_connection_info():
    engine = MagicMock()
    engine.connect.side_effect = OperationalError("SELECT 1", {}, Exception("postgresql://user:sensitive-password@host/db"))
    app.dependency_overrides[get_engine] = lambda: engine
    try:
        with TestClient(app) as client:
            result = client.get("/api/health/db")
            assert result.status_code == 503
            assert result.json() == {"detail": "DB 연결을 확인할 수 없습니다"}
            assert "sensitive-password" not in result.text
            assert client.get("/api/health").json() == {"status": "ok"}
    finally:
        app.dependency_overrides.pop(get_engine, None)


@pytest.mark.mysql
def test_real_database_health_endpoint_and_connection_options(api, mysql_engine):
    app.dependency_overrides[get_engine] = lambda: mysql_engine
    client = api[0]()
    assert client.get("/api/health/db").json() == {"db": 1}
    if mysql_engine.dialect.name == "postgresql":
        assert isinstance(mysql_engine.pool, NullPool)
        with mysql_engine.connect() as connection:
            assert connection.connection.driver_connection.prepare_threshold is None

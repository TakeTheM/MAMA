import os
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from dotenv import dotenv_values
from fastapi.testclient import TestClient
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import Base, get_db, make_engine, normalize_database_url
from main import app
from app.llm import get_llm
from llm_stub import FakeLLM

BACKEND_ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="session")
def mysql_engine():
    values = dotenv_values(BACKEND_ROOT / ".env")
    test_url = os.environ.get("TEST_DATABASE_URL") or values.get("TEST_DATABASE_URL")
    if not test_url:
        pytest.skip("TEST_DATABASE_URL is required for database integration tests")
    parsed = normalize_database_url(test_url)
    if not parsed.database or not parsed.database.endswith("_test"):
        pytest.fail("Refusing to modify a database whose name does not end in _test")
    development_url = os.environ.get("DATABASE_URL") or values.get("DATABASE_URL")
    if development_url:
        development = normalize_database_url(development_url)
        def target(url):
            port = 5432 if url.drivername == "postgresql+psycopg" else 3306
            return (url.drivername, url.host, url.port or port, url.database)
        if target(parsed) == target(development):
            pytest.fail("TEST_DATABASE_URL must not point to the development database")
    config = Config(str(BACKEND_ROOT / "alembic.ini"))
    config.attributes["database_url"] = test_url
    command.upgrade(config, "head")
    engine = make_engine(test_url)
    yield engine
    engine.dispose()


@pytest.fixture
def api(mysql_engine):
    def clean():
        with mysql_engine.begin() as connection:
            for table in reversed(Base.metadata.sorted_tables):
                connection.execute(delete(table))

    clean()

    def db_override():
        with Session(mysql_engine, expire_on_commit=False) as session:
            yield session

    settings = Settings(
        _env_file=None,
        jwt_secret="test-only-signing-key-with-at-least-64-bytes-for-algorithm-rejection-tests",
        allowed_origins="http://testserver,http://localhost:3000",
    )
    app.dependency_overrides[get_db] = db_override
    app.dependency_overrides[get_settings] = lambda: settings
    class DefaultLLM:
        def complete(self, task, payload, output_type):
            if task == "draft":
                value = {"drafts": {channel: {"caption": "오늘 구운 빵 🍞 #광고", "hashtags": ["#광고"]} for channel in payload["channels"]}}
            elif task == "review":
                value = {"findings": []}
            elif task == "performance":
                value = {"summary": "입력한 광고 성과를 확인했습니다", "next_ad_suggestions": ["다음 광고의 문구를 비교해 보세요"]}
            else:
                raise AssertionError("Unexpected LLM task")
            return output_type.model_validate(value)
    app.dependency_overrides[get_llm] = lambda: DefaultLLM()
    clients = []

    def new_client():
        client = TestClient(app)
        clients.append(client)
        return client

    yield new_client, settings
    for client in clients:
        client.close()
    app.dependency_overrides.clear()
    clean()


@pytest.fixture
def client(api):
    return api[0]()


def register_login(client, email="seller@example.com", password="password-123"):
    assert client.post("/api/v1/auth/register", json={"email": email, "password": password}).status_code == 201
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    client.headers["Authorization"] = "Bearer " + response.json()["access_token"]
    return response


@pytest.fixture
def seller(client):
    register_login(client)
    return client


@pytest.fixture
def fake_llm(api):
    fake = FakeLLM()
    previous = app.dependency_overrides.get(get_llm)
    app.dependency_overrides[get_llm] = lambda: fake
    yield fake
    if previous is not None:
        app.dependency_overrides[get_llm] = previous
    else:
        app.dependency_overrides.pop(get_llm, None)

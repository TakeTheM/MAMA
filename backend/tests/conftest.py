import os
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from dotenv import dotenv_values
from fastapi.testclient import TestClient
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.auth import SESSION_COOKIE, create_session
from app.config import Settings, get_settings
from app.database import Base, get_db, make_engine, normalize_database_url, utcnow
from app.models import User
from main import app

BACKEND_ROOT = Path(__file__).resolve().parents[1]
TEST_JWT_SECRET = "test-only-state-signing-secret-at-least-32-chars"


def login(engine, settings, email: str) -> str:
    """Google 로그인을 거친 것처럼 셀러와 세션을 DB에 만들고 세션 쿠키 값을 돌려준다."""
    with Session(engine, expire_on_commit=False) as db:
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(email=email, google_sub="google-" + email, name="셀러", created_at=utcnow())
            db.add(user)
            db.flush()
        token = create_session(db, user, settings)
        db.commit()
    return token


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
            default_port = 5432 if url.drivername == "postgresql+psycopg" else 3306
            return (url.drivername, url.host, url.port or default_port, url.database)
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

    settings = Settings(_env_file=None, jwt_secret=TEST_JWT_SECRET)
    app.dependency_overrides[get_db] = db_override
    app.dependency_overrides[get_settings] = lambda: settings
    clients = []

    def new_client(email: str | None = "seller@example.com"):
        """email 셀러로 로그인한 클라이언트. 같은 email이면 같은 셀러, None이면 로그인하지 않는다."""
        client = TestClient(app)
        if email is not None:
            client.cookies.set(SESSION_COOKIE, login(mysql_engine, settings, email))
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

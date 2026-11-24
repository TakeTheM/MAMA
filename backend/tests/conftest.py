import os
import uuid
from datetime import timedelta
from pathlib import Path

import jwt
import pytest
from alembic import command
from alembic.config import Config
from cryptography.hazmat.primitives.asymmetric import ec
from dotenv import dotenv_values
from fastapi.testclient import TestClient
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.auth import SupabaseIdentity, SupabaseTokenVerifier, get_token_verifier, upsert_user
from app.config import Settings, get_settings
from app.database import Base, get_db, make_engine, normalize_database_url, utcnow
from main import app

BACKEND_ROOT = Path(__file__).resolve().parents[1]
TEST_SUPABASE_URL = "https://test-project.supabase.co"
TEST_ISSUER = TEST_SUPABASE_URL + "/auth/v1"
# 테스트용 Supabase 서명 키(ES256). 실제 프로젝트의 비대칭 JWT 서명 키를 흉내 낸다.
TEST_SIGNING_KEY = ec.generate_private_key(ec.SECP256R1())


class FakeJWKS:
    """PyJWKClient 대신 고정 공개키를 돌려준다. 토큰 헤더에 kid가 없으면 실제 클라이언트처럼 거절한다."""

    def __init__(self, public_key):
        self.key = public_key

    def get_signing_key_from_jwt(self, token):
        if not jwt.get_unverified_header(token).get("kid"):
            raise jwt.PyJWKClientError("Unable to find a signing key that matches")
        return self


def fake_verifier() -> SupabaseTokenVerifier:
    return SupabaseTokenVerifier(TEST_SUPABASE_URL, jwks=FakeJWKS(TEST_SIGNING_KEY.public_key()))


def supabase_user_id(email: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, "mama-test:" + email.lower()))


def access_token(account: str, *, key=TEST_SIGNING_KEY, algorithm="ES256", headers=None, **overrides) -> str:
    """Supabase Auth가 Google 로그인 셀러에게 발급하는 access token 모양. overrides 값이 None이면 그 클레임을 뺀다."""
    now = utcnow()
    claims = {
        "iss": TEST_ISSUER, "aud": "authenticated", "role": "authenticated", "sub": supabase_user_id(account),
        "email": account, "iat": now, "exp": now + timedelta(hours=1), "is_anonymous": False,
        "app_metadata": {"provider": "google", "providers": ["google"]},
        "user_metadata": {"full_name": "셀러", "email": account},
    }
    claims.update(overrides)
    return jwt.encode(
        {k: v for k, v in claims.items() if v is not None}, key, algorithm=algorithm,
        headers={"kid": "test-key"} if headers is None else headers,
    )


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

    settings = Settings(_env_file=None, supabase_url=TEST_SUPABASE_URL)
    app.dependency_overrides[get_db] = db_override
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_token_verifier] = fake_verifier
    clients = []

    def new_client(email: str | None = "seller@example.com"):
        """email 셀러로 로그인한 클라이언트. 같은 email이면 같은 셀러, None이면 로그인하지 않는다.
        셀러 행은 첫 요청 전에 미리 만든다(테스트가 바로 DB에서 셀러를 찾을 수 있게)."""
        client = TestClient(app)
        if email is not None:
            with Session(mysql_engine, expire_on_commit=False) as db:
                upsert_user(db, SupabaseIdentity(user_id=supabase_user_id(email), email=email.lower(), name="셀러"))
                db.commit()
            client.headers["Authorization"] = "Bearer " + access_token(email)
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

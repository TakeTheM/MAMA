import time
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Event

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import auth
from app.auth import AccountError, SupabaseIdentity, SupabaseTokenVerifier, get_token_verifier
from app.config import Settings, get_settings
from app.database import get_db
from app.database import utcnow
from app.models import User
from main import app

from conftest import TEST_SUPABASE_URL, access_token, fake_verifier, supabase_user_id

ME = "/api/v1/auth/me"


# ---- DB 없이 도는 단위 테스트 ----

def verify(token: str) -> SupabaseIdentity:
    return fake_verifier().verify(token)


def test_verify_accepts_google_account_token():
    identity = verify(access_token("Seller@Gmail.com", user_metadata={"full_name": "  빵집 사장님 "}))
    assert identity == SupabaseIdentity(
        user_id=supabase_user_id("Seller@Gmail.com"), email="seller@gmail.com", name="빵집 사장님", email_trusted=True,
    )
    assert verify(access_token("seller@example.com", user_metadata=None)).email_trusted is False
    # 여러 로그인 수단 중 Google이 연결돼 있으면 받는다.
    assert verify(access_token("a@example.com", app_metadata={"provider": "email", "providers": ["email", "google"]}))


def expect_401(token: str):
    with pytest.raises(HTTPException) as failure:
        verify(token)
    assert failure.value.status_code == 401


@pytest.mark.parametrize("overrides", [
    {"aud": "anon"},
    {"iss": "https://other-project.supabase.co/auth/v1"},
    {"exp": utcnow() - timedelta(minutes=5)},
    {"sub": None},
    {"exp": None},
    {"role": "anon"},
    {"is_anonymous": True},
    {"email": None},
    {"email": "not-an-email"},
    # 이메일·비밀번호 가입 계정(메일 미확인 가능)이나 app_metadata 없는 토큰은 받지 않는다.
    {"app_metadata": {"provider": "email", "providers": ["email"]}},
    {"app_metadata": None},
    # user_metadata는 사용자가 바꿀 수 있으므로 여기에 google을 적어도 소용없다.
    {"app_metadata": {"provider": "email"}, "user_metadata": {"provider": "google", "providers": ["google"]}},
])
def test_verify_rejects_bad_claims(overrides):
    expect_401(access_token("seller@example.com", **overrides))


def test_verify_rejects_other_signing_key_and_symmetric_tokens():
    expect_401(access_token("seller@example.com", key=ec.generate_private_key(ec.SECP256R1())))
    # 예전 HS256 공유 비밀 토큰: kid가 없어 공개키를 찾지 못한다.
    expect_401(access_token("seller@example.com", key="legacy-shared-secret-at-least-32-bytes!", algorithm="HS256", headers={}))
    # kid를 붙여 공개키를 HS256 비밀로 쓰게 하는 알고리즘 혼동도 막는다.
    expect_401(access_token("seller@example.com", key="legacy-shared-secret-at-least-32-bytes!", algorithm="HS256"))
    expect_401("not-a-jwt")


def test_jwks_connection_failure_is_503_not_401():
    class DownJWKS:
        def get_signing_key_from_jwt(self, token):
            raise jwt.PyJWKClientConnectionError("down")

    with pytest.raises(HTTPException) as failure:
        SupabaseTokenVerifier(TEST_SUPABASE_URL, jwks=DownJWKS()).verify(access_token("seller@example.com"))
    assert failure.value.status_code == 503


def test_verifier_reads_jwks_from_supabase_project():
    verifier = SupabaseTokenVerifier("https://jwks-url-check.supabase.co")
    assert verifier.issuer == "https://jwks-url-check.supabase.co/auth/v1"
    assert verifier.jwks.uri == "https://jwks-url-check.supabase.co/auth/v1/.well-known/jwks.json"
    assert Settings(_env_file=None, supabase_url=" https://x.supabase.co/ ").supabase_url == "https://x.supabase.co"


@pytest.fixture
def no_db_client():
    def use(settings: Settings, verifier=None):
        app.dependency_overrides[get_settings] = lambda: settings
        # DB 없이 돈다. 토큰 확인에서 끝나는 요청만 보낸다.
        app.dependency_overrides[get_db] = lambda: None
        if verifier is not None:
            app.dependency_overrides[get_token_verifier] = verifier
        return TestClient(app)
    yield use
    app.dependency_overrides.clear()


def test_missing_supabase_settings_is_503(no_db_client):
    client = no_db_client(Settings(_env_file=None))
    assert client.get(ME, headers={"Authorization": "Bearer " + access_token("seller@example.com")}).status_code == 503


@pytest.mark.parametrize("header", [None, "", "Bearer", "Bearer ", "Basic abc", "Token abc"])
def test_missing_or_malformed_bearer_header_is_401(no_db_client, header):
    client = no_db_client(Settings(_env_file=None, supabase_url=TEST_SUPABASE_URL), fake_verifier)
    response = client.get(ME, headers={} if header is None else {"Authorization": header})
    assert response.status_code == 401 and response.json()["detail"] == "로그인이 필요합니다"
    assert response.headers["www-authenticate"] == "Bearer"


def test_old_google_login_endpoints_are_gone(no_db_client):
    client = no_db_client(Settings(_env_file=None, supabase_url=TEST_SUPABASE_URL), fake_verifier)
    assert client.get("/api/v1/auth/google/login", follow_redirects=False).status_code == 404
    assert client.get("/api/v1/auth/google/callback", follow_redirects=False).status_code == 404
    assert client.post("/api/v1/auth/logout").status_code == 404


# ---- DB 통합 테스트 (TEST_DATABASE_URL 필요) ----

def bearer(email: str, **overrides) -> dict:
    return {"Authorization": "Bearer " + access_token(email, **overrides)}


def test_first_request_creates_seller_and_same_user_maps_to_same_seller(api, mysql_engine):
    client = api[0](None)
    response = client.get(ME, headers=bearer("new@example.com", user_metadata={"full_name": "빵집 사장님"}))
    assert response.status_code == 200
    me = response.json()
    assert me["email"] == "new@example.com" and me["name"] == "빵집 사장님"
    created = client.post(
        "/api/v1/campaigns", headers=bearer("new@example.com"),
        json={"content": "오늘 구운 빵", "initial_budget_amount": 1000, "initial_budget_days": 1},
    )
    assert created.status_code == 201 and created.json()["owner_id"] == me["id"]
    # 같은 Supabase 사용자는 다시 와도 같은 셀러다. 이름이 바뀌면 따라간다.
    again = client.get(ME, headers=bearer("new@example.com", user_metadata={"full_name": "새 이름"})).json()
    assert again["id"] == me["id"] and again["name"] == "새 이름"
    with Session(mysql_engine) as db:
        assert db.scalars(select(User.supabase_user_id)).all() == [supabase_user_id("new@example.com")]


def test_invalid_token_is_401_without_creating_seller(api, mysql_engine):
    client = api[0](None)
    assert client.get(ME, headers=bearer("new@example.com", exp=utcnow() - timedelta(minutes=1))).status_code == 401
    assert client.get("/api/v1/campaigns", headers=bearer("new@example.com", aud="anon")).status_code == 401
    with Session(mysql_engine) as db:
        assert db.scalars(select(User)).all() == []


def test_existing_gmail_account_from_old_google_login_is_linked_once(api, mysql_engine):
    with Session(mysql_engine) as db:
        db.add(User(email="Seller@Gmail.com", google_sub="old-google-sub", created_at=utcnow()))
        db.commit()
    client = api[0](None)
    me = client.get(ME, headers=bearer("seller@gmail.com"))
    assert me.status_code == 200
    with Session(mysql_engine) as db:
        user = db.scalar(select(User))
        assert user.id == me.json()["id"] and user.supabase_user_id == supabase_user_id("seller@gmail.com")
        assert user.google_sub == "old-google-sub"

    # 이미 다른 Supabase 사용자와 연결된 이메일은 가로챌 수 없다. 토큰은 유효하므로 401이 아니라 403이다.
    other = client.get(ME, headers=bearer("seller@gmail.com", sub="00000000-0000-4000-8000-000000000000"))
    assert other.status_code == 403 and "이미 다른 로그인 계정" in other.json()["detail"]


def test_untrusted_email_is_not_linked_to_existing_account(api, mysql_engine):
    with Session(mysql_engine) as db:
        db.add(User(email="seller@example.com", google_sub="old-google-sub", created_at=utcnow()))
        db.commit()
    client = api[0](None)
    response = client.get(ME, headers=bearer("seller@example.com"))
    assert response.status_code == 403 and "운영자에게 계정 연결" in response.json()["detail"]
    with Session(mysql_engine) as db:
        assert db.scalars(select(User.supabase_user_id)).all() == [None]


def _upsert_in_thread(engine, identity, started):
    def run():
        with Session(engine, expire_on_commit=False) as db:
            started.set()
            try:
                user = auth.upsert_user(db, identity)
                db.commit()
                return user.id
            except AccountError:
                db.rollback()
                return "account"
    return run


@pytest.mark.parametrize("second_user, expected", [("00000000-0000-4000-8000-000000000002", "account"), (None, "same")])
def test_concurrent_first_login_links_existing_account_once(api, mysql_engine, second_user, expected):
    with Session(mysql_engine) as db:
        legacy = User(email="seller@gmail.com", google_sub="old-google-sub", created_at=utcnow())
        db.add(legacy)
        db.commit()
        legacy_id = legacy.id
    first_id = "00000000-0000-4000-8000-000000000001"
    first = SupabaseIdentity(user_id=first_id, email="seller@gmail.com", email_trusted=True)
    second = SupabaseIdentity(user_id=second_user or first_id, email="seller@gmail.com", email_trusted=True)
    started = Event()
    with Session(mysql_engine, expire_on_commit=False) as holder, ThreadPoolExecutor(max_workers=1) as executor:
        assert auth.upsert_user(holder, first).id == legacy_id  # 행 잠금을 쥔 채 커밋하지 않는다
        future = executor.submit(_upsert_in_thread(mysql_engine, second, started))
        assert started.wait(10)
        time.sleep(0.3)
        assert not future.done()  # 두 번째 연결은 첫 연결이 끝날 때까지 기다린다
        holder.commit()
        result = future.result(timeout=10)
    assert result == (legacy_id if expected == "same" else "account")
    with Session(mysql_engine) as db:
        assert db.scalars(select(User.supabase_user_id)).all() == [first_id]


def test_concurrent_first_signup_with_same_user_reuses_seller(api, mysql_engine):
    identity = SupabaseIdentity(user_id="00000000-0000-4000-8000-000000000001", email="new@example.com")
    started = Event()
    with Session(mysql_engine, expire_on_commit=False) as holder, ThreadPoolExecutor(max_workers=1) as executor:
        created = auth.upsert_user(holder, identity)
        future = executor.submit(_upsert_in_thread(mysql_engine, identity, started))
        assert started.wait(10)
        time.sleep(0.3)
        holder.commit()
        assert future.result(timeout=10) == created.id
    with Session(mysql_engine) as db:
        assert len(db.scalars(select(User)).all()) == 1

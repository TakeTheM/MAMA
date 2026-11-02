from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier

import jwt
import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import utcnow
from app.models import AuthSession, User
from app.security import AUTH_PATH, REFRESH_COOKIE, token_hash
from conftest import register_login

pytestmark = pytest.mark.mysql
AUTH = "/api/v1/auth"


def test_registration_normalizes_and_hashes_password(client, mysql_engine):
    result = client.post(AUTH + "/register", json={"email": "  SELLER@Example.com  ", "password": " password-123 "})
    assert result.status_code == 201
    assert result.json()["email"] == "seller@example.com"
    assert "password" not in result.text
    with Session(mysql_engine) as db:
        user = db.scalar(select(User))
        assert user.password_hash.startswith("$argon2")
        assert user.password_hash != " password-123 "
    duplicate = client.post(AUTH + "/register", json={"email": "seller@example.com", "password": "password-123"})
    assert duplicate.status_code == 409
    assert client.post(AUTH + "/login", json={"email": "seller@example.com", "password": "password-123"}).status_code == 401
    assert client.post(AUTH + "/login", json={"email": "seller@example.com", "password": " password-123 "}).status_code == 200


@pytest.mark.parametrize("password", ["short", "x" * 129])
def test_bad_password_length(client, password):
    assert client.post(AUTH + "/register", json={"email": "seller@example.com", "password": password}).status_code == 422


def test_login_me_and_refresh_cookie(client, mysql_engine):
    response = register_login(client)
    assert response.json()["token_type"] == "bearer"
    assert response.json()["expires_in"] == 900
    assert "refresh_token" not in response.json()
    cookie_header = response.headers["set-cookie"].lower()
    assert "httponly" in cookie_header and "samesite=lax" in cookie_header and "path=/api/v1/auth" in cookie_header
    assert "domain=" not in cookie_header and "secure" not in cookie_header
    assert response.headers["cache-control"] == "no-store"
    assert client.get(AUTH + "/me").json()["email"] == "seller@example.com"
    refresh = client.cookies.get(REFRESH_COOKIE)
    with Session(mysql_engine) as db:
        stored = db.scalar(select(AuthSession))
        assert stored.refresh_token_hash == token_hash(refresh)
        assert stored.refresh_token_hash != refresh


def test_unknown_account_and_wrong_password_have_same_error(client):
    register_login(client)
    wrong = client.post(AUTH + "/login", json={"email": "seller@example.com", "password": "wrong-password"})
    absent = client.post(AUTH + "/login", json={"email": "absent@example.com", "password": "wrong-password"})
    assert wrong.status_code == absent.status_code == 401
    assert wrong.json() == absent.json()


def test_missing_bearer_is_401(client):
    assert client.get(AUTH + "/me").status_code == 401
    assert client.get("/api/v1/campaigns").status_code == 401


@pytest.mark.parametrize("change", ["expired", "tampered", "refresh", "wrong_issuer", "wrong_audience", "missing_jti", "wrong_algorithm", "bad_sid"])
def test_invalid_access_tokens_are_rejected(seller, api, change):
    settings = api[1]
    token = seller.headers["Authorization"].split()[1]
    claims = jwt.decode(token, options={"verify_signature": False})
    key = settings.signing_key()
    if change == "expired":
        claims["iat"] = int((utcnow() - timedelta(hours=1)).timestamp())
        claims["exp"] = int((utcnow() - timedelta(seconds=1)).timestamp())
    elif change == "tampered":
        key = "wrong-key-with-at-least-32-bytes-long"
    elif change == "refresh":
        claims["type"] = "refresh"
    elif change == "wrong_issuer":
        claims["iss"] = "other-api"
    elif change == "wrong_audience":
        claims["aud"] = "other-api"
    elif change == "missing_jti":
        del claims["jti"]
    elif change == "bad_sid":
        claims["sid"] = "1 OR 1=1"
    forged = jwt.encode(claims, key, algorithm="HS384" if change == "wrong_algorithm" else "HS256")
    assert seller.get(AUTH + "/me", headers={"Authorization": "Bearer " + forged}).status_code == 401


def test_refresh_rotation_replay_revokes_entire_session(seller, mysql_engine):
    original = seller.cookies.get(REFRESH_COOKIE)
    with Session(mysql_engine) as db:
        original_expiry = db.scalar(select(AuthSession)).expires_at
    response = seller.post(AUTH + "/refresh", headers={"X-CSRF-Protection": "1"})
    assert response.status_code == 200
    new_refresh = seller.cookies.get(REFRESH_COOKIE)
    assert original != new_refresh
    access = response.json()["access_token"]
    with Session(mysql_engine) as db:
        stored = db.scalar(select(AuthSession))
        assert stored.expires_at == original_expiry
        assert stored.refresh_token_hash == token_hash(new_refresh)
    seller.cookies.clear()
    seller.cookies.set(REFRESH_COOKIE, original, path=AUTH_PATH)
    assert seller.post(AUTH + "/refresh", headers={"X-CSRF-Protection": "1"}).status_code == 401
    assert seller.get(AUTH + "/me", headers={"Authorization": "Bearer " + access}).status_code == 401
    seller.cookies.clear()
    seller.cookies.set(REFRESH_COOKIE, new_refresh, path=AUTH_PATH)
    assert seller.post(AUTH + "/refresh", headers={"X-CSRF-Protection": "1"}).status_code == 401


def test_refresh_csrf_origin_and_token_type(seller):
    assert seller.post(AUTH + "/refresh").status_code == 403
    assert seller.post(AUTH + "/refresh", headers={"X-CSRF-Protection": "1", "Origin": "https://evil.example"}).status_code == 403
    assert seller.post(AUTH + "/refresh", headers={"X-CSRF-Protection": "1", "Origin": "http://localhost:3000"}).status_code == 200
    seller.cookies.clear()
    seller.cookies.set(REFRESH_COOKIE, seller.headers["Authorization"].split()[1], path=AUTH_PATH)
    assert seller.post(AUTH + "/refresh", headers={"X-CSRF-Protection": "1"}).status_code == 401
    seller.cookies.clear()
    assert seller.post(AUTH + "/refresh", headers={"X-CSRF-Protection": "1"}).status_code == 401


def test_logout_immediately_invalidates_access_and_refresh(seller):
    result = seller.post(AUTH + "/logout")
    assert result.status_code == 204
    assert result.content == b""
    assert seller.cookies.get(REFRESH_COOKIE) is None
    assert seller.get(AUTH + "/me").status_code == 401
    assert seller.post(AUTH + "/refresh", headers={"X-CSRF-Protection": "1"}).status_code == 401


def test_logout_only_revokes_current_login(seller, api):
    second = api[0]()
    login = second.post(AUTH + "/login", json={"email": "seller@example.com", "password": "password-123"})
    second.headers["Authorization"] = "Bearer " + login.json()["access_token"]
    assert seller.post(AUTH + "/logout").status_code == 204
    assert second.get(AUTH + "/me").status_code == 200


def test_expired_session_blocks_access_and_refresh(seller, mysql_engine):
    with Session(mysql_engine) as db:
        db.scalar(select(AuthSession)).expires_at = utcnow() - timedelta(seconds=1)
        db.commit()
    assert seller.get(AUTH + "/me").status_code == 401
    assert seller.post(AUTH + "/refresh", headers={"X-CSRF-Protection": "1"}).status_code == 401


def test_concurrent_refresh_has_one_winner_and_detects_replay(seller, api, mysql_engine):
    refresh = seller.cookies.get(REFRESH_COOKIE)
    clients = [api[0](), api[0]()]
    for client in clients:
        client.cookies.set(REFRESH_COOKIE, refresh, path=AUTH_PATH)
    barrier = Barrier(2)

    def send(client):
        barrier.wait(timeout=10)
        return client.post(AUTH + "/refresh", headers={"X-CSRF-Protection": "1"})

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(send, clients))
    assert sorted(result.status_code for result in results) == [200, 401]
    with Session(mysql_engine) as db:
        assert db.scalar(select(AuthSession)).revoked_at is not None


def test_https_cookie_flags(client, api):
    api[1].cookie_secure = True
    client.post(AUTH + "/register", json={"email": "seller@example.com", "password": "password-123"})
    result = client.post(AUTH + "/login", json={"email": "seller@example.com", "password": "password-123"})
    assert "Secure" in result.headers["set-cookie"]

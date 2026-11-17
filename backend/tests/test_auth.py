from datetime import timedelta
from urllib.parse import parse_qs, urlsplit

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import auth
from app.auth import GoogleIdentity, GoogleOAuth, OAuthError, get_google, pkce_challenge, safe_next, verify_id_token
from app.config import Settings, get_settings
from app.database import utcnow
from app.models import AuthSession, User
from main import app

from conftest import TEST_JWT_SECRET

CLIENT_ID = "test-client.apps.googleusercontent.com"
LOGIN = "/api/v1/auth/google/login"
CALLBACK = "/api/v1/auth/google/callback"
GOOGLE_SETTINGS = dict(
    google_client_id=CLIENT_ID, google_client_secret="test-secret",
    google_redirect_uri="http://localhost:3000/api/v1/auth/google/callback",
)


# ---- DB 없이 도는 단위 테스트 ----

@pytest.mark.parametrize("value, expected", [
    ("/campaigns/3/plan?tab=1", "/campaigns/3/plan?tab=1"),
    (None, "/"), ("", "/"), ("campaigns", "/"), ("//evil.example", "/"), ("/\\evil.example", "/"),
    ("https://evil.example", "/"), ("/login?error=state", "/"), ("/api/v1/auth/logout", "/"), ("/a\r\nSet-Cookie: x", "/"),
])
def test_safe_next_only_allows_same_site_paths(value, expected):
    assert safe_next(value) == expected


def test_pkce_challenge_matches_rfc7636_example():
    assert pkce_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk") == "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"


class FakeJWKS:
    def __init__(self, key):
        self.key = key

    def get_signing_key_from_jwt(self, token):
        return self


@pytest.fixture(scope="module")
def rsa_key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


def id_token(key, **overrides):
    now = utcnow()
    claims = {
        "iss": "https://accounts.google.com", "aud": CLIENT_ID, "sub": "1234567890", "email": "Seller@Example.com",
        "email_verified": True, "name": "빵집 사장님", "nonce": "nonce-1", "iat": now, "exp": now + timedelta(minutes=5),
    }
    claims.update(overrides)
    return jwt.encode({k: v for k, v in claims.items() if v is not None}, key, algorithm="RS256")


def test_verify_id_token_accepts_valid_google_token(rsa_key):
    identity = verify_id_token(id_token(rsa_key), client_id=CLIENT_ID, nonce="nonce-1", jwks=FakeJWKS(rsa_key.public_key()))
    assert identity == GoogleIdentity(sub="1234567890", email="seller@example.com", name="빵집 사장님")


@pytest.mark.parametrize("overrides, code", [
    ({"aud": "someone-else"}, "token"),
    ({"iss": "https://evil.example"}, "token"),
    ({"nonce": "replayed"}, "token"),
    ({"nonce": None}, "token"),
    ({"exp": utcnow() - timedelta(minutes=5)}, "token"),
    ({"email_verified": False}, "email"),
    ({"email": None}, "email"),
])
def test_verify_id_token_rejects_bad_claims(rsa_key, overrides, code):
    with pytest.raises(OAuthError) as failure:
        verify_id_token(id_token(rsa_key, **overrides), client_id=CLIENT_ID, nonce="nonce-1", jwks=FakeJWKS(rsa_key.public_key()))
    assert failure.value.code == code


def test_verify_id_token_rejects_other_signing_key(rsa_key):
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    with pytest.raises(OAuthError):
        verify_id_token(id_token(other), client_id=CLIENT_ID, nonce="nonce-1", jwks=FakeJWKS(rsa_key.public_key()))


@pytest.fixture
def settings_only():
    def use(**values):
        settings = Settings(_env_file=None, **values)
        app.dependency_overrides[get_settings] = lambda: settings
        return TestClient(app)
    yield use
    app.dependency_overrides.clear()


def test_login_requires_google_settings(settings_only):
    assert settings_only(jwt_secret=TEST_JWT_SECRET).get(LOGIN, follow_redirects=False).status_code == 503
    assert settings_only(**GOOGLE_SETTINGS).get(LOGIN, follow_redirects=False).status_code == 503  # JWT_SECRET 없음


def test_login_redirects_to_google_with_pkce_and_state_cookie(settings_only):
    response = settings_only(**GOOGLE_SETTINGS, jwt_secret=TEST_JWT_SECRET).get(LOGIN, params={"next": "/campaigns/new"}, follow_redirects=False)
    assert response.status_code == 302
    location = urlsplit(response.headers["location"])
    assert f"{location.scheme}://{location.netloc}{location.path}" == auth.GOOGLE_AUTHORIZE_URL
    query = {key: values[0] for key, values in parse_qs(location.query).items()}
    assert query["client_id"] == CLIENT_ID and query["redirect_uri"] == GOOGLE_SETTINGS["google_redirect_uri"]
    assert query["scope"] == "openid email profile" and query["code_challenge_method"] == "S256"
    cookie = response.headers["set-cookie"]
    assert "HttpOnly" in cookie and "Path=/api/v1/auth/google" in cookie and "SameSite=lax" in cookie
    saved = jwt.decode(response.cookies[auth.STATE_COOKIE], TEST_JWT_SECRET, algorithms=["HS256"])
    assert saved["state"] == query["state"] and saved["nonce"] == query["nonce"] and saved["next"] == "/campaigns/new"
    assert pkce_challenge(saved["verifier"]) == query["code_challenge"]


# ---- DB 통합 테스트 (TEST_DATABASE_URL 필요) ----

@pytest.fixture
def google(api, monkeypatch):
    _, settings = api
    for key, value in GOOGLE_SETTINGS.items():
        monkeypatch.setattr(settings, key, value if key != "google_client_secret" else type(settings.google_client_secret)(value))
    calls = []
    identity = {"value": GoogleIdentity(sub="google-sub-1", email="seller@example.com", name="빵집 사장님")}

    def exchange(self, *, code, code_verifier, nonce):
        calls.append({"code": code, "verifier": code_verifier, "nonce": nonce})
        if code == "bad":
            raise OAuthError("google")
        return identity["value"]

    monkeypatch.setattr(GoogleOAuth, "exchange", exchange)
    app.dependency_overrides[get_google] = lambda: GoogleOAuth(settings)
    return calls, identity


def start_login(client, next_path="/campaigns/new"):
    response = client.get(LOGIN, params={"next": next_path}, follow_redirects=False)
    assert response.status_code == 302
    return parse_qs(urlsplit(response.headers["location"]).query)["state"][0]


def test_google_login_creates_session_and_logout_revokes_it(api, google, mysql_engine):
    calls, _ = google
    client = api[0](None)
    state = start_login(client)
    response = client.get(CALLBACK, params={"code": "good", "state": state}, follow_redirects=False)
    assert response.status_code == 302 and response.headers["location"] == "/campaigns/new"
    assert calls[0]["code"] == "good" and len(calls[0]["verifier"]) >= 43
    session_cookie = [value for value in response.headers.get_list("set-cookie") if value.startswith(auth.SESSION_COOKIE + "=")][0]
    assert "HttpOnly" in session_cookie and "Path=/" in session_cookie and "SameSite=lax" in session_cookie

    me = client.get("/api/v1/auth/me").json()
    assert me["email"] == "seller@example.com" and me["name"] == "빵집 사장님"
    created = client.post("/api/v1/campaigns", json={"content": "오늘 구운 빵", "initial_budget_amount": 1000, "initial_budget_days": 1})
    assert created.status_code == 201 and created.json()["owner_id"] == me["id"]

    # 같은 Google 계정으로 다시 로그인하면 같은 셀러다.
    again = api[0](None)
    again.get(CALLBACK, params={"code": "good", "state": start_login(again)}, follow_redirects=False)
    assert again.get("/api/v1/auth/me").json()["id"] == me["id"]

    token = client.cookies[auth.SESSION_COOKIE]
    assert client.post("/api/v1/auth/logout").status_code == 204
    client.cookies.set(auth.SESSION_COOKIE, token)  # 쿠키를 지우지 않고 다시 보내도 폐기된 세션이다
    assert client.get("/api/v1/auth/me").status_code == 401
    assert again.get("/api/v1/auth/me").status_code == 200
    with Session(mysql_engine) as db:
        stored = db.scalars(select(AuthSession.token_hash)).all()
        assert token not in stored and auth.hash_token(token) in stored


@pytest.mark.parametrize("params, error", [
    ({"error": "access_denied"}, "denied"),
    ({"code": "good", "state": "forged"}, "state"),
    ({"code": "good"}, "state"),
    ({"code": "bad", "state": None}, "google"),
])
def test_google_callback_failures_return_to_login(api, google, params, error):
    client = api[0](None)
    state = start_login(client)
    if "state" in params and params["state"] is None:
        params = {**params, "state": state}
    response = client.get(CALLBACK, params=params, follow_redirects=False)
    assert response.status_code == 302 and response.headers["location"] == f"/login?error={error}"
    assert auth.SESSION_COOKIE not in response.cookies
    assert client.get("/api/v1/auth/me").status_code == 401


def test_callback_without_state_cookie_is_rejected(api, google):
    client = api[0](None)
    state = start_login(client)
    client.cookies.clear()
    response = client.get(CALLBACK, params={"code": "good", "state": state}, follow_redirects=False)
    assert response.headers["location"] == "/login?error=state"


def test_expired_session_is_rejected(api, mysql_engine):
    client = api[0]()
    assert client.get("/api/v1/auth/me").status_code == 200
    with Session(mysql_engine) as db:
        for session in db.scalars(select(AuthSession)):
            session.expires_at = utcnow() - timedelta(seconds=1)
        db.commit()
    assert client.get("/api/v1/auth/me").status_code == 401


def test_existing_email_account_is_linked_once(api, google, mysql_engine):
    _, identity = google
    with Session(mysql_engine) as db:
        db.add(User(email="seller@example.com", password_hash="legacy", created_at=utcnow()))
        db.commit()
    client = api[0](None)
    client.get(CALLBACK, params={"code": "good", "state": start_login(client)}, follow_redirects=False)
    assert client.get("/api/v1/auth/me").status_code == 200
    with Session(mysql_engine) as db:
        assert db.scalar(select(User.google_sub).where(User.email == "seller@example.com")) == "google-sub-1"

    # 이미 다른 Google 계정과 연결된 이메일은 가로챌 수 없다.
    identity["value"] = GoogleIdentity(sub="google-sub-2", email="seller@example.com")
    other = api[0](None)
    response = other.get(CALLBACK, params={"code": "good", "state": start_login(other)}, follow_redirects=False)
    assert response.headers["location"] == "/login?error=account"


def test_existing_email_account_is_linked_ignoring_case(api, google, mysql_engine):
    with Session(mysql_engine) as db:
        db.add(User(email="Seller@Example.com", password_hash="legacy", created_at=utcnow()))
        db.commit()
    client = api[0](None)
    client.get(CALLBACK, params={"code": "good", "state": start_login(client)}, follow_redirects=False)
    assert client.get("/api/v1/auth/me").status_code == 200
    with Session(mysql_engine) as db:
        assert db.scalars(select(User.google_sub)).all() == ["google-sub-1"]

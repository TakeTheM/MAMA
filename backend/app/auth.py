"""Google 로그인(OAuth 2.0 Authorization Code + PKCE)과 쿠키 세션.

흐름 (브라우저는 항상 프론트 주소의 /api/... 로만 접속하고 Next.js rewrites가 여기로 넘긴다):
1. GET /api/v1/auth/google/login  → state·PKCE·nonce를 서명 쿠키에 넣고 Google 동의 화면으로 302
2. GET /api/v1/auth/google/callback → state 확인, code를 토큰으로 교환, ID 토큰 서명·클레임 검증,
   셀러 계정을 찾거나 만들고 세션 쿠키(mama_session, httpOnly)를 발급한 뒤 원래 화면으로 302
3. 이후 요청은 세션 쿠키로 current_user를 찾는다. 로그아웃은 DB의 세션을 폐기한다.

Google 토큰은 저장하지 않는다. 로그인 확인에 필요한 sub·email·name만 쓴다.
"""
import base64
import hashlib
import secrets
from datetime import timedelta
from typing import Annotated
from urllib.parse import urlencode

import httpx
import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import get_db, utcnow
from app.models import AuthSession, User
from app.schemas import UserOut

SESSION_COOKIE = "mama_session"
STATE_COOKIE = "mama_oauth"
CALLBACK_PATH = "/api/v1/auth/google"
STATE_SECONDS = 600

GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"
GOOGLE_ISSUERS = ("https://accounts.google.com", "accounts.google.com")

router = APIRouter(prefix="/api/v1/auth", tags=["로그인"])
DB = Annotated[Session, Depends(get_db)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


class OAuthError(Exception):
    """화면에 보여 줄 짧은 사유 코드(/login?error=...)를 담는다."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


class GoogleIdentity(BaseModel):
    sub: str
    email: str
    name: str | None = None
    # Google이 이 주소의 현재 소유권을 보증하는지 (gmail.com 주소이거나 Workspace 도메인 hd가 있음).
    # 아니면 예전에 인증된 주소가 지금은 다른 사람 것일 수 있어 기존 계정에 자동 연결하지 않는다.
    email_trusted: bool = False


def verify_id_token(id_token: str, *, client_id: str, nonce: str, jwks: jwt.PyJWKClient) -> GoogleIdentity:
    """ID 토큰의 서명(Google 공개키)·발급자·대상·만료·nonce·이메일 인증 여부를 확인한다."""
    try:
        key = jwks.get_signing_key_from_jwt(id_token).key
        claims = jwt.decode(
            id_token, key, algorithms=["RS256"], audience=client_id, issuer=GOOGLE_ISSUERS,
            options={"require": ["exp", "iat", "iss", "aud", "sub"]}, leeway=60,
        )
    except (jwt.PyJWTError, jwt.PyJWKClientError):
        raise OAuthError("token") from None
    if not secrets.compare_digest(str(claims.get("nonce", "")), nonce):
        raise OAuthError("token")
    email = claims.get("email")
    if not email or claims.get("email_verified") is not True:
        raise OAuthError("email")
    email = email.strip().lower()
    trusted = email.endswith("@gmail.com") or bool(claims.get("hd"))
    return GoogleIdentity(sub=str(claims["sub"]), email=email, name=claims.get("name"), email_trusted=trusted)


class GoogleOAuth:
    """Google과 직접 통신하는 부분. 테스트에서는 get_google을 바꿔 끼운다."""

    _jwks: jwt.PyJWKClient | None = None

    def __init__(self, settings: Settings):
        self.client_id = settings.google_client_id
        self.client_secret = settings.google_client_secret.get_secret_value()
        self.redirect_uri = settings.google_redirect_uri

    @property
    def configured(self) -> bool:
        return bool(self.client_id and self.client_secret and self.redirect_uri)

    def authorize_url(self, *, state: str, nonce: str, code_challenge: str) -> str:
        return GOOGLE_AUTHORIZE_URL + "?" + urlencode({
            "client_id": self.client_id,
            "redirect_uri": self.redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "nonce": nonce,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
            "prompt": "select_account",
        })

    def exchange(self, *, code: str, code_verifier: str, nonce: str) -> GoogleIdentity:
        try:
            response = httpx.post(GOOGLE_TOKEN_URL, data={
                "code": code,
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "redirect_uri": self.redirect_uri,
                "grant_type": "authorization_code",
                "code_verifier": code_verifier,
            }, timeout=10)
        except httpx.HTTPError:
            raise OAuthError("google") from None
        if response.status_code != 200:
            raise OAuthError("google")
        id_token = response.json().get("id_token")
        if not isinstance(id_token, str):
            raise OAuthError("google")
        # 공개키는 클래스 단위로 캐시한다 (요청마다 Google에서 받지 않도록).
        if GoogleOAuth._jwks is None:
            GoogleOAuth._jwks = jwt.PyJWKClient(GOOGLE_JWKS_URL, cache_keys=True, lifespan=3600, timeout=10)
        return verify_id_token(id_token, client_id=self.client_id, nonce=nonce, jwks=GoogleOAuth._jwks)


def get_google(settings: SettingsDep) -> GoogleOAuth:
    return GoogleOAuth(settings)


Google = Annotated[GoogleOAuth, Depends(get_google)]


# ---- 로그인 중간 상태 (state·PKCE verifier·nonce·돌아갈 주소) ----

def safe_next(value: str | None) -> str:
    """로그인 후 돌아갈 주소는 같은 사이트 안의 경로만 허용한다 (오픈 리디렉트 방지)."""
    if not value or not value.startswith("/") or value.startswith("//") or "\\" in value:
        return "/"
    if any(ord(char) < 32 for char in value) or value.startswith(("/login", "/api/")):
        return "/"
    return value


def _jwt_secret(settings: Settings) -> str:
    secret = settings.jwt_secret.get_secret_value()
    if len(secret) < 32:
        raise HTTPException(503, "JWT_SECRET을 32자 이상으로 설정해 주세요")
    return secret


def sign_state(data: dict, settings: Settings) -> str:
    payload = {**data, "exp": utcnow() + timedelta(seconds=STATE_SECONDS)}
    return jwt.encode(payload, _jwt_secret(settings), algorithm="HS256")


def read_state(token: str | None, settings: Settings) -> dict | None:
    if not token:
        return None
    try:
        return jwt.decode(token, _jwt_secret(settings), algorithms=["HS256"], options={"require": ["exp"]})
    except jwt.PyJWTError:
        return None


def pkce_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


# ---- 셀러 계정과 세션 ----

def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def upsert_user(db: Session, identity: GoogleIdentity) -> User:
    """Google 계정(sub)의 셀러를 찾거나 만든다. 동시 첫 로그인에서도 한 계정에 sub가 하나만 연결된다."""
    user = db.scalar(select(User).where(User.google_sub == identity.sub))
    if user is None:
        # 예전 계정은 대소문자가 섞여 저장됐을 수 있어 소문자로 비교한다.
        existing_id = db.scalar(
            select(User.id).where(func.lower(User.email) == identity.email).order_by(User.id).limit(1)
        )
        if existing_id is not None:
            user = _link_existing(db, existing_id, identity)
        else:
            user = _create_user(db, identity)
    user.name = identity.name
    db.flush()
    return user


def _link_existing(db: Session, user_id: int, identity: GoogleIdentity) -> User:
    if not identity.email_trusted:
        # 주소 소유권이 바뀌었을 수 있다. 메일함 확인 절차 없이 기존 캠페인을 넘기지 않는다.
        raise OAuthError("link")
    # 비어 있을 때만 채운다. 동시에 다른 sub가 연결하면 행 잠금 뒤 조건이 거짓이 되어 0행이 바뀐다.
    db.execute(
        update(User).where(User.id == user_id, User.google_sub.is_(None)).values(google_sub=identity.sub)
        .execution_options(synchronize_session=False)
    )
    user = db.get(User, user_id, populate_existing=True)
    if user is None or user.google_sub != identity.sub:
        raise OAuthError("account")
    return user


def _create_user(db: Session, identity: GoogleIdentity) -> User:
    try:
        with db.begin_nested():
            user = User(email=identity.email, google_sub=identity.sub, created_at=utcnow())
            db.add(user)
        return user
    except IntegrityError:
        # 같은 Google 계정의 동시 첫 로그인이 먼저 만들었으면 그 계정을 쓴다.
        user = db.scalar(select(User).where(User.google_sub == identity.sub))
        if user is None:
            raise OAuthError("account") from None
        return user


def create_session(db: Session, user: User, settings: Settings) -> str:
    token = secrets.token_urlsafe(32)
    now = utcnow()
    db.add(AuthSession(
        user_id=user.id, token_hash=hash_token(token),
        expires_at=now + timedelta(days=settings.session_days), created_at=now,
    ))
    return token


def _active_session(db: Session, token: str | None) -> AuthSession | None:
    if not token:
        return None
    return db.scalar(select(AuthSession).where(
        AuthSession.token_hash == hash_token(token),
        AuthSession.revoked_at.is_(None),
        AuthSession.expires_at > utcnow(),
    ))


def current_user(request: Request, db: DB) -> User:
    session = _active_session(db, request.cookies.get(SESSION_COOKIE))
    user = db.get(User, session.user_id) if session else None
    if user is None:
        raise HTTPException(401, "로그인이 필요합니다")
    return user


CurrentUser = Annotated[User, Depends(current_user)]


def _cookie_options(settings: Settings) -> dict:
    return {"httponly": True, "secure": settings.cookie_secure, "samesite": "lax"}


# ---- 엔드포인트 ----

@router.get("/google/login", summary="Google 로그인 시작", status_code=302, response_class=RedirectResponse)
def google_login(google: Google, settings: SettingsDep, next: str | None = None):
    if not google.configured:
        raise HTTPException(503, "Google 로그인 설정(GOOGLE_CLIENT_ID 등)이 없습니다")
    state, nonce, verifier = secrets.token_urlsafe(32), secrets.token_urlsafe(32), secrets.token_urlsafe(64)
    signed = sign_state({"state": state, "nonce": nonce, "verifier": verifier, "next": safe_next(next)}, settings)
    response = RedirectResponse(
        google.authorize_url(state=state, nonce=nonce, code_challenge=pkce_challenge(verifier)), status_code=302,
    )
    response.set_cookie(STATE_COOKIE, signed, max_age=STATE_SECONDS, path=CALLBACK_PATH, **_cookie_options(settings))
    return response


@router.get("/google/callback", summary="Google 로그인 결과 처리", status_code=302, response_class=RedirectResponse)
def google_callback(
    request: Request, db: DB, google: Google, settings: SettingsDep,
    code: str | None = None, state: str | None = None, error: str | None = None,
):
    def finish(location: str) -> RedirectResponse:
        response = RedirectResponse(location, status_code=302)
        response.delete_cookie(STATE_COOKIE, path=CALLBACK_PATH, **_cookie_options(settings))
        return response

    saved = read_state(request.cookies.get(STATE_COOKIE), settings)
    if error:
        return finish("/login?error=denied")
    if not saved or not code or not state or not secrets.compare_digest(state, str(saved.get("state", ""))):
        return finish("/login?error=state")
    try:
        identity = google.exchange(code=code, code_verifier=saved["verifier"], nonce=saved["nonce"])
        user = upsert_user(db, identity)
    except OAuthError as failure:
        db.rollback()
        return finish(f"/login?error={failure.code}")
    token = create_session(db, user, settings)
    db.commit()
    response = finish(safe_next(saved.get("next")))
    response.set_cookie(
        SESSION_COOKIE, token, max_age=settings.session_days * 86400, path="/", **_cookie_options(settings),
    )
    return response


@router.get("/me", response_model=UserOut, summary="로그인한 셀러")
def me(user: CurrentUser):
    return user


@router.post("/logout", status_code=204, summary="로그아웃")
def logout(request: Request, db: DB, settings: SettingsDep):
    session = _active_session(db, request.cookies.get(SESSION_COOKIE))
    if session is not None:
        session.revoked_at = utcnow()
        db.commit()
    response = Response(status_code=204)
    response.delete_cookie(SESSION_COOKIE, path="/", **_cookie_options(settings))
    return response

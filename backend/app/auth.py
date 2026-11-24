"""Supabase Auth 로그인 확인.

로그인(Google 동의 화면, 세션 보관·갱신)은 프론트가 Supabase Auth로 처리한다.
프론트는 모든 /api 요청에 `Authorization: Bearer <Supabase access token>`을 붙이고, 백엔드는 이 토큰을 검증해 셀러를 찾는다.

- 서명: Supabase 프로젝트의 비대칭 서명 키(JWKS)로만 검증한다. 예전 HS256 공유 비밀 토큰은 받지 않는다.
- 클레임: iss = {SUPABASE_URL}/auth/v1, aud = authenticated, role = authenticated, exp·sub 필수, Google 로그인 계정만.
- 401은 토큰 문제(없음·서명·만료·발급자 불일치)일 때만 쓴다. 토큰은 유효한데 셀러를 연결할 수 없으면 403,
  Supabase 공개키를 받지 못하면 503이다. 프론트는 401이면 로그인 화면으로 보내므로, 토큰이 유효할 때 401을 주면
  로그인 → 401 → 로그인이 이유 없이 반복된다.

user_metadata는 사용자가 updateUser로 직접 바꿀 수 있으므로 표시 이름 외에는 쓰지 않는다.
"""
from typing import Annotated

import jwt
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import get_db, utcnow
from app.models import User
from app.schemas import UserOut

# 비대칭 키만 허용한다. HS* 를 허용하면 공유 비밀이 새었을 때 누구나 토큰을 만들 수 있다.
ALGORITHMS = ["ES256", "RS256", "EdDSA"]
AUDIENCE = "authenticated"
LOGIN_REQUIRED = "로그인이 필요합니다"

router = APIRouter(prefix="/api/v1/auth", tags=["로그인"])
DB = Annotated[Session, Depends(get_db)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


class AccountError(Exception):
    """토큰은 유효하지만 셀러 계정에 연결할 수 없을 때. 403으로 답한다."""


class SupabaseIdentity(BaseModel):
    user_id: str
    email: str
    name: str | None = None
    # Google이 이 주소의 현재 소유권을 보증하는지(gmail.com). 아니면 예전 계정에 자동 연결하지 않는다.
    # Workspace 도메인(hd)은 Supabase 토큰에 믿을 수 있는 형태로 오지 않아 쓰지 않는다.
    email_trusted: bool = False


def _unauthorized() -> HTTPException:
    return HTTPException(401, LOGIN_REQUIRED, headers={"WWW-Authenticate": "Bearer"})


def _is_google_account(claims: dict) -> bool:
    """app_metadata는 사용자가 바꿀 수 없다. 이메일·비밀번호 가입 계정(메일 미확인 가능)은 받지 않는다."""
    app_metadata = claims.get("app_metadata")
    if not isinstance(app_metadata, dict):
        return False
    providers = app_metadata.get("providers")
    return app_metadata.get("provider") == "google" or (isinstance(providers, list) and "google" in providers)


def identity_from_claims(claims: dict) -> SupabaseIdentity:
    if claims.get("role") != AUDIENCE or claims.get("is_anonymous") is True or not _is_google_account(claims):
        raise _unauthorized()
    email = claims.get("email")
    if not isinstance(email, str) or "@" not in email:
        raise _unauthorized()
    email = email.strip().lower()
    metadata = claims.get("user_metadata") if isinstance(claims.get("user_metadata"), dict) else {}
    name = metadata.get("full_name") or metadata.get("name")
    name = (name.strip()[:200] or None) if isinstance(name, str) else None
    return SupabaseIdentity(user_id=str(claims["sub"]), email=email, name=name, email_trusted=email.endswith("@gmail.com"))


class SupabaseTokenVerifier:
    """Supabase access token 검증. 공개키(JWKS)는 URL마다 한 번 만들어 캐시한다. 테스트에서는 get_token_verifier를 바꿔 끼운다."""

    _clients: dict[str, jwt.PyJWKClient] = {}

    def __init__(self, supabase_url: str, jwks: jwt.PyJWKClient | None = None):
        self.issuer = f"{supabase_url}/auth/v1"
        if jwks is None:
            jwks = SupabaseTokenVerifier._clients.get(self.issuer)
            if jwks is None:
                jwks = jwt.PyJWKClient(f"{self.issuer}/.well-known/jwks.json", cache_keys=True, lifespan=600, timeout=5)
                SupabaseTokenVerifier._clients[self.issuer] = jwks
        self.jwks = jwks

    def verify(self, token: str) -> SupabaseIdentity:
        try:
            key = self.jwks.get_signing_key_from_jwt(token).key
        except jwt.PyJWKClientConnectionError:
            raise HTTPException(503, "로그인 확인 서버(Supabase)에 연결하지 못했습니다") from None
        except (jwt.PyJWKClientError, jwt.PyJWTError):
            # 형식이 깨졌거나 kid가 없는(HS256 등) 토큰, 알 수 없는 키
            raise _unauthorized() from None
        try:
            claims = jwt.decode(
                token, key, algorithms=ALGORITHMS, audience=AUDIENCE, issuer=self.issuer,
                options={"require": ["exp", "iat", "iss", "aud", "sub"]}, leeway=30,
            )
        except jwt.PyJWTError:
            raise _unauthorized() from None
        return identity_from_claims(claims)


def get_token_verifier(settings: SettingsDep) -> SupabaseTokenVerifier:
    if not settings.supabase_url:
        raise HTTPException(503, "Supabase 로그인 설정(SUPABASE_URL)이 없습니다")
    return SupabaseTokenVerifier(settings.supabase_url)


Verifier = Annotated[SupabaseTokenVerifier, Depends(get_token_verifier)]


# 헤더가 없거나 Bearer가 아니면 None을 받아 직접 401을 만든다(기본 403 대신). OpenAPI에 Bearer 인증으로 표시된다.
bearer_scheme = HTTPBearer(auto_error=False, description="Supabase Auth access token")
BearerCredentials = Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)]


# ---- 셀러 계정 ----

def upsert_user(db: Session, identity: SupabaseIdentity) -> User:
    """Supabase 사용자의 셀러를 찾거나 만든다. 동시 첫 요청에서도 한 셀러에 Supabase 사용자가 하나만 연결된다."""
    user = db.scalar(select(User).where(User.supabase_user_id == identity.user_id))
    if user is None:
        # 예전 계정은 대소문자가 섞여 저장됐을 수 있어 소문자로 비교한다.
        existing_id = db.scalar(
            select(User.id).where(func.lower(User.email) == identity.email).order_by(User.id).limit(1)
        )
        user = _link_existing(db, existing_id, identity) if existing_id is not None else _create_user(db, identity)
    if identity.name and user.name != identity.name:
        user.name = identity.name
    db.flush()
    return user


def _link_existing(db: Session, user_id: int, identity: SupabaseIdentity) -> User:
    if not identity.email_trusted:
        # 주소 소유권이 바뀌었을 수 있다. 확인 절차 없이 기존 캠페인을 넘기지 않는다.
        raise AccountError("같은 이메일로 만든 기존 계정이 있어요. 운영자에게 계정 연결을 요청해 주세요.")
    # 비어 있을 때만 채운다. 동시에 다른 사용자가 연결하면 행 잠금 뒤 조건이 거짓이 되어 0행이 바뀐다.
    db.execute(
        update(User).where(User.id == user_id, User.supabase_user_id.is_(None)).values(supabase_user_id=identity.user_id)
        .execution_options(synchronize_session=False)
    )
    user = db.get(User, user_id, populate_existing=True)
    if user is None or user.supabase_user_id != identity.user_id:
        raise AccountError("이 이메일은 이미 다른 로그인 계정과 연결돼 있어요. 처음 쓰던 Google 계정으로 로그인해 주세요.")
    return user


def _create_user(db: Session, identity: SupabaseIdentity) -> User:
    try:
        with db.begin_nested():
            user = User(email=identity.email, supabase_user_id=identity.user_id, name=identity.name, created_at=utcnow())
            db.add(user)
        return user
    except IntegrityError:
        # 같은 사용자의 동시 첫 요청이 먼저 만들었으면 그 계정을 쓴다.
        user = db.scalar(select(User).where(User.supabase_user_id == identity.user_id))
        if user is None:
            raise AccountError("계정을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.") from None
        return user


def current_user(credentials: BearerCredentials, db: DB, verifier: Verifier) -> User:
    if credentials is None or not credentials.credentials.strip():
        raise _unauthorized()
    identity = verifier.verify(credentials.credentials.strip())
    try:
        user = upsert_user(db, identity)
    except AccountError as failure:
        db.rollback()
        raise HTTPException(403, str(failure)) from None
    # 처음 연결·이름 변경은 이 요청의 처리 결과와 상관없이 남긴다(바뀐 것이 없으면 읽기 트랜잭션만 끝난다).
    db.commit()
    return user


CurrentUser = Annotated[User, Depends(current_user)]


@router.get("/me", response_model=UserOut, summary="로그인한 셀러")
def me(user: CurrentUser):
    return user

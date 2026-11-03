from dataclasses import dataclass
from datetime import timedelta
from hashlib import sha256
from hmac import compare_digest
from typing import Annotated
from uuid import uuid4

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import get_db, utcnow
from app.models import AuthSession, User

password_hash = PasswordHash.recommended()
_dummy_hash = password_hash.hash("mama-dummy-password-for-timing")
bearer = HTTPBearer(auto_error=False)
REFRESH_COOKIE = "mama_refresh"
AUTH_PATH = "/api/v1/auth"


def unauthorized() -> HTTPException:
    return HTTPException(401, "인증 정보가 올바르지 않거나 만료되었습니다", headers={"WWW-Authenticate": "Bearer"})


def token_hash(token: str) -> str:
    return sha256(token.encode()).hexdigest()


def matches_refresh(token: str, stored_hash: str) -> bool:
    return compare_digest(token_hash(token), stored_hash)


def issue_tokens(auth_session: AuthSession, settings: Settings) -> tuple[str, str]:
    now = utcnow()
    common = {
        "sub": str(auth_session.user_id),
        "sid": auth_session.id,
        "iat": int(now.timestamp()),
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
    }
    access = jwt.encode(
        {**common, "jti": str(uuid4()), "type": "access", "exp": int((now + timedelta(minutes=15)).timestamp())},
        settings.signing_key(), algorithm="HS256",
    )
    refresh = jwt.encode(
        {**common, "jti": str(uuid4()), "type": "refresh", "exp": int(auth_session.expires_at.timestamp())},
        settings.signing_key(), algorithm="HS256",
    )
    return access, refresh


def decode_token(token: str, token_type: str, settings: Settings) -> dict:
    try:
        claims = jwt.decode(
            token, settings.signing_key(), algorithms=["HS256"],
            issuer=settings.jwt_issuer, audience=settings.jwt_audience,
            options={"require": ["sub", "sid", "jti", "type", "iat", "exp", "iss", "aud"]},
        )
        if (
            claims["type"] != token_type
            or not isinstance(claims["sub"], str)
            or not claims["sub"].isascii()
            or not claims["sub"].isdigit()
            or not 0 < int(claims["sub"]) <= 9_223_372_036_854_775_807
            or type(claims["sid"]) is not int
            or not 0 < claims["sid"] <= 9_223_372_036_854_775_807
            or type(claims["iat"]) is not int
            or type(claims["exp"]) is not int
            or claims["exp"] <= claims["iat"]
            or not claims["jti"]
        ):
            raise unauthorized()
        return claims
    except (jwt.InvalidTokenError, ValueError, TypeError):
        raise unauthorized() from None


@dataclass
class Principal:
    user: User
    session: AuthSession


def get_principal(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> Principal:
    if credentials is None:
        raise unauthorized()
    claims = decode_token(credentials.credentials, "access", settings)
    auth_session = db.scalar(select(AuthSession).where(AuthSession.id == claims["sid"]))
    if (
        auth_session is None or auth_session.user_id != int(claims["sub"])
        or auth_session.revoked_at is not None or auth_session.expires_at <= utcnow()
    ):
        raise unauthorized()
    user = db.get(User, auth_session.user_id)
    if user is None:
        raise unauthorized()
    return Principal(user=user, session=auth_session)

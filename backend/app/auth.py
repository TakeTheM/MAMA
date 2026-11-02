from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import get_db, utcnow
from app.models import AuthSession, User
from app.schemas import Credentials, TokenOut, UserOut
from app.security import (
    AUTH_PATH, REFRESH_COOKIE, Principal, _dummy_hash, decode_token, get_principal,
    issue_tokens, matches_refresh, password_hash, token_hash, unauthorized,
)

router = APIRouter(prefix=AUTH_PATH, tags=["인증"])
DB = Annotated[Session, Depends(get_db)]
Config = Annotated[Settings, Depends(get_settings)]
Authenticated = Annotated[Principal, Depends(get_principal)]


def set_refresh_cookie(response: Response, refresh: str, auth_session: AuthSession, settings: Settings):
    response.set_cookie(
        REFRESH_COOKIE, refresh,
        max_age=max(0, int((auth_session.expires_at - utcnow()).total_seconds())),
        expires=auth_session.expires_at,
        path=AUTH_PATH, httponly=True, secure=settings.cookie_secure, samesite="lax",
    )
    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"


@router.post("/register", response_model=UserOut, status_code=201)
def register(data: Credentials, db: DB):
    user = User(email=str(data.email), password_hash=password_hash.hash(data.password))
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if getattr(exc.orig, "args", (None,))[0] == 1062:
            raise HTTPException(409, "이미 사용 중인 이메일입니다") from None
        raise
    return user


@router.post("/login", response_model=TokenOut)
def login(data: Credentials, response: Response, db: DB, settings: Config):
    user = db.scalar(select(User).where(User.email == str(data.email)))
    valid = password_hash.verify(data.password, user.password_hash if user else _dummy_hash)
    if not valid or user is None:
        raise unauthorized()
    auth_session = AuthSession(user_id=user.id, refresh_token_hash="", expires_at=utcnow() + timedelta(days=7))
    db.add(auth_session)
    db.flush()
    access, refresh = issue_tokens(auth_session, settings)
    auth_session.refresh_token_hash = token_hash(refresh)
    db.commit()
    set_refresh_cookie(response, refresh, auth_session, settings)
    return TokenOut(access_token=access)


@router.get("/me", response_model=UserOut)
def me(principal: Authenticated):
    return principal.user


@router.post("/refresh", response_model=TokenOut)
def refresh_tokens(
    request: Request, response: Response, db: DB, settings: Config,
    refresh: Annotated[str | None, Cookie(alias=REFRESH_COOKIE)] = None,
    csrf: Annotated[str | None, Header(alias="X-CSRF-Protection")] = None,
):
    if csrf != "1" or (request.headers.get("origin") is not None and request.headers["origin"] not in settings.origins):
        raise HTTPException(403, "허용되지 않은 재발급 요청입니다")
    if refresh is None:
        raise unauthorized()
    claims = decode_token(refresh, "refresh", settings)
    auth_session = db.scalar(select(AuthSession).where(AuthSession.id == claims["sid"]).with_for_update())
    if (
        auth_session is None or auth_session.user_id != int(claims["sub"])
        or auth_session.revoked_at is not None or auth_session.expires_at <= utcnow()
    ):
        raise unauthorized()
    if not matches_refresh(refresh, auth_session.refresh_token_hash):
        # Commit revocation before returning 401; an exception must not roll it back.
        auth_session.revoked_at = utcnow()
        db.commit()
        raise unauthorized()
    access, new_refresh = issue_tokens(auth_session, settings)
    auth_session.refresh_token_hash = token_hash(new_refresh)
    db.commit()
    set_refresh_cookie(response, new_refresh, auth_session, settings)
    return TokenOut(access_token=access)


@router.post("/logout", status_code=204)
def logout(response: Response, principal: Authenticated, db: DB, settings: Config):
    auth_session = db.scalar(
        select(AuthSession).where(AuthSession.id == principal.session.id)
        .with_for_update().execution_options(populate_existing=True)
    )
    auth_session.revoked_at = utcnow()
    db.commit()
    response.delete_cookie(REFRESH_COOKIE, path=AUTH_PATH, httponly=True, secure=settings.cookie_secure, samesite="lax")
    response.headers["Cache-Control"] = "no-store"

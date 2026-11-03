from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError

from app.auth import router as auth_router
from app.campaigns import router as campaign_router
from app.database import get_engine

app = FastAPI(
    title="MAMA API", version="0.2.0",
    description=(
        "JWT 로그인 후 Authorize에 Access Token을 입력하세요. "
        "Refresh Token은 HttpOnly 쿠키로 전달되며 재발급에는 X-CSRF-Protection: 1이 필요합니다. "
        "상품 입력 → 채널별 초안 → 검수 → 사용자 승인 → 게시·종료 기록 → 성과 평가를 제공합니다. "
        "검수 성공 후 위험 표현은 경고로 표시하며 사용자가 승인 여부를 결정합니다. "
        "게시·종료·반려는 사용자가 남기는 기록이며 외부 플랫폼을 호출하지 않습니다."
    ),
)
app.include_router(auth_router)
app.include_router(campaign_router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get(
    "/api/health/db", tags=["상태 확인"], summary="DB 연결 확인",
    responses={503: {"description": "DB 미설정 또는 연결 실패"}},
)
def health_db(engine: Annotated[Engine, Depends(get_engine)]) -> dict[str, int]:
    try:
        with engine.connect() as connection:
            return {"db": connection.execute(text("SELECT 1")).scalar_one()}
    except SQLAlchemyError:
        raise HTTPException(503, "DB 연결을 확인할 수 없습니다") from None

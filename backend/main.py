from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy import select
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError

from app.campaigns import router as campaign_router
from app.database import get_engine
from app.models import Campaign, CampaignStatusHistory

app = FastAPI(
    title="MAMA API", version="0.1.0",
    description=(
        "로그인 없이 캠페인을 관리하는 공유 작업공간입니다. "
        "게시·종료·반려는 사용자가 남기는 기록이며 외부 플랫폼을 호출하지 않습니다."
    ),
)
app.include_router(campaign_router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/health/db")
def health_db(engine: Engine = Depends(get_engine)) -> dict[str, int]:
    try:
        with engine.connect() as connection:
            connection.execute(select(Campaign).limit(0))
            connection.execute(select(CampaignStatusHistory).limit(0))
        return {"db": 1}
    except SQLAlchemyError:
        raise HTTPException(503, "DB 연결을 확인할 수 없습니다") from None

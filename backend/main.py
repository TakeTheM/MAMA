from fastapi import FastAPI

from app.auth import router as auth_router
from app.campaigns import router as campaign_router

app = FastAPI(
    title="MAMA API", version="0.1.0",
    description=(
        "JWT 로그인 후 Authorize에 Access Token을 입력하세요. "
        "Refresh Token은 HttpOnly 쿠키로 전달되며 재발급에는 X-CSRF-Protection: 1이 필요합니다. "
        "캠페인 수동 승인은 임시 경로이며 AI 검수 통과를 의미하지 않습니다. "
        "게시·종료·반려는 사용자가 남기는 기록이며 외부 플랫폼을 호출하지 않습니다."
    ),
)
app.include_router(auth_router)
app.include_router(campaign_router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}

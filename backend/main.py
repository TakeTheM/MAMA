from fastapi import FastAPI

from app.auth import router as auth_router
from app.campaigns import router as campaign_router

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

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 현재 상태

MAMA(팀 TakeTheM, M을 가져가)는 소상공인·이커머스 셀러의 광고 초안·검수·승인·게시 기록·성과 확인을 잇는 웹 서비스다. 문서와 `frontend/`·`backend/` 코드가 함께 있다. 문서는 한국어로 쓴다.

2026-11-17 중간 미팅 보고서를 반영했다. 보고서 당시의 목업·JWT API·PR 검토 현황과 현재 구현을 혼동하지 않는다. 현재는 **로그인 없는 공유 작업공간**이며 캠페인·게시 화면은 기본 HTTP API를 사용한다. 실제 AI·DB·배포 통합 검증 완료 여부는 별도 확인한다. 보고서의 로그인·계정별 저장은 후속 요구다.

## 문서 구조와 기준

같은 내용을 중복하지 않고 문서·F/US 번호로 가리킨다. 새 번호를 임의로 만들지 않는다.

- `docs/PRD.md`: 제품 개요와 문서 안내.
- `docs/requirements/backlog.md`: F-01~F-05·필수 US-01~US-07과 인수 조건. 취소 US-06·플랫폼 반려 US-07 포함.
- `docs/requirements/user-flows.md`: 정상·반려·취소 사용자 흐름.
- `docs/decisions/mvp-scope.md`: MVP 포함·제외와 이유.
- `docs/domain/03-rules-states-llm.md`: 상태 이름·전이, L1 초안·L2 검수·L3 요약과 LLM 입력 경계.
- `docs/interview/mid-meeting-report.md`: 보고서 원문 링크, 작성 당시 현황과 현재 코드의 차이, 확인 질문·후속 작업.
- `docs/STACK.md`: 현재 스택과 초기 후보 비교. `docs/SETUP_PLAN.md`는 초기 설치 당시 기록이다.
- `backend/README.md`·`backend/docs/openapi.json`: 현재 환경변수·DB·배포·API 계약.

## 아키텍처와 경계

Next.js·TypeScript → `/api/*` rewrites → FastAPI → PostgreSQL/Supabase. Python 3.13·uv, SQLAlchemy·Alembic을 사용한다. MySQL은 기존 호환 경로다. 현재 백엔드 배포 절차는 Vercel(`backend`)이며 초기 Render 계획과 구분한다. 프론트 Vercel Root Directory는 `frontend`다.

- 상태 전이·허용 동작·LLM 호출·규칙 검사·ROAS·DB 접근은 FastAPI가 판단한다. 상태 전이와 이력은 같은 트랜잭션으로 저장한다.
- 화면은 `allowed_actions` 등 서버 응답으로 버튼을 표시한다. 같은 업무 규칙을 TypeScript에 다시 만들지 않는다.
- 위험 표현은 경고다. **현재 문구의 검수가 완료되면 경고가 있어도 사용자가 승인할 수 있다.** LLM이 수정 요청·승인 상태를 자동으로 결정하지 않는다. 검수 실패·처리 중에는 승인하지 않는다.
- 게시·종료·플랫폼 반려는 사용자 수동 기록이다. 외부 플랫폼 게시·광고비 집행·성과 수집·자동 종료는 MVP 제외다.
- 숫자는 서버가 계산하고 LLM은 설명한다. 요약이 준비된 뒤 사용자가 평가 완료를 눌러야 상태가 바뀐다.
- 공유 작업공간의 최근 평가 완료 광고를 다음 초안에 참고한다. 계정별 소유권·개인화가 이미 있는 것으로 가정하지 않는다.
- LLM 호출은 `backend/app/llm.py` 한 곳에서 한다. 저장 직전 상태·revision을 재확인해 취소·수정 뒤 늦은 결과를 거절한다.
- LLM에 고객 정보·주문 번호·원가·비밀값을 보내지 않는다. 근거 링크는 허용 목록을 검사한다.
- 비밀값은 백엔드 환경변수에 둔다. 프론트에는 `BACKEND_URL`만 두고 키·DB 연결 정보를 `NEXT_PUBLIC_`로 노출하지 않는다.

## 실행과 검증

설치는 루트 README를 따른다. 로컬은 `./scripts/dev.sh`, 포트 충돌 시 `BACKEND_PORT=8001 ./scripts/dev.sh`를 쓴다. DB 사용 전 `backend/`에서 `uv run alembic upgrade head`로 스키마를 준비한다.

- 프론트: `cd frontend && npm test`, `npm run lint`, `npx tsc --noEmit`.
- 백엔드: `cd backend && uv run pytest`.
- DB 통합 테스트: 개발 DB와 다른 전용 `TEST_DATABASE_URL`이 필요하며 이름은 `_test`로 끝나야 한다. 데이터 정리가 있으므로 개발 DB를 지정하지 않는다. URL이 없으면 통합 테스트를 건너뛴다.
- 의존성 변경 시 `backend/uv.lock`과 배포용 `backend/requirements.txt`를 함께 갱신한다.

## 작업 규칙

- main에 직접 커밋하지 않는다. 브랜치는 `작업유형/파일이름` 형식이다. PR은 하나의 작업 단위이며 작성자 외 1명 이상 승인 후 병합한다.
- 문서 커밋 메시지는 `docs :: 내용` 형식이다.
- 도메인 단계 표는 블록별 담당자가 수정한다. 근거 카드·회고는 각자 파일을 쓴다. daily 회고는 같은 PR에 모은다.
- 이슈 템플릿은 `.github/ISSUE_TEMPLATE/bug.md`·`user-story.md`다.
- 확인하지 않은 고객 답변·실제 AI 응답·배포 성공을 완료로 쓰지 않는다. 팀의 미정 사항은 해당 문서에 남긴다.

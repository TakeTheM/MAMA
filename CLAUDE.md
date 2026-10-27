# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 현재 상태

MAMA(팀 TakeTheM)는 소상공인 셀러가 법 규칙에 맞는 SNS 광고를 기획·검수·승인·게시 기록·성과 확인까지 한 흐름으로 진행하게 하는 웹 서비스다. **아직 소스 코드가 없고 문서만 있는 저장소**이다. 빌드·린트·테스트 명령은 없다. 문서는 모두 한국어로 쓴다.

## 문서 구조 (단일 출처 원칙)

같은 내용을 두 곳에 쓰지 않고 문서 이름과 US/F 번호로 가리킨다. 새 번호를 만들지 않는다.

- `docs/PRD.md` — 안내판. 내용을 옮기지 않고 아래 문서를 가리킨다.
- `docs/requirements/backlog.md` — 기능(`F-xx`)·스토리(`US-xx`)·인수 조건의 기준. 필수 스토리는 US-01~US-07 (취소 US-06, 플랫폼 반려 US-07 포함).
- `docs/decisions/mvp-scope.md` — MVP 포함·제외와 제외 이유.
- `docs/domain/03-rules-states-llm.md` — 상태값(기획중 … 성과 평가 완료, 수정 요청·플랫폼 반려·일시정지·취소)과 LLM 3곳(L1 초안, L2 위험 표현 검수, L3 성과 요약)의 기준. 상태 이름은 이 문서와 똑같이 쓴다.
- `docs/STACK.md` — 기술 스택 결정 기록. `docs/team/`, `docs/interview/`, `docs/proposal/`, `logs/daily/`(일일 회고)가 나머지.

## 확정된 아키텍처 (docs/STACK.md, C안 수정)

Next.js(TypeScript, Tailwind) 프론트 → `/api/*`를 Next.js rewrites로 FastAPI에 전달 → FastAPI → Supabase Postgres. 배포는 Vercel(프론트, Root Directory `frontend`) + Render(백엔드, `backend`, Python 3.13 고정, uv). 테스트는 프론트 Vitest, 백엔드 Pytest.

코드를 만들 때 지킬 경계:
- **규칙은 FastAPI에만 둔다.** 상태 전이 허용 여부(상태 변경과 상태 기록은 같은 트랜잭션), 소유 셀러 권한, LLM 호출(`llm.py` 한 곳), 금지어 이중 검사, ROAS 계산, DB 접근은 백엔드 담당이다. Next.js는 화면과 전달만 하며 DB 연결 정보·비밀값을 두지 않는다(`BACKEND_URL`만).
- 승인 버튼 활성 여부 등은 FastAPI 응답(예: `can_approve`)을 그대로 보여 주고 TS로 규칙을 다시 만들지 않는다.
- **사람이 확인하기 전에는 LLM이 상태를 바꾸지 않는다.** LLM에 보내지 않을 정보는 `03-rules-states-llm.md` 3-4를 따른다. 취소 뒤 늦게 도착한 LLM 결과는 저장 직전에 현재 상태를 다시 확인한다.
- 비밀값(`LLM_API_KEY`, `JWT_SECRET`, `DATABASE_URL`)은 값을 비운 `.env.example`만 커밋한다. `NEXT_PUBLIC_` 접두사를 붙이지 않는다.
- 데이터는 클라이언트 컴포넌트에서 `/api/...`로 가져오는 방식이 기본이다.

STACK.md에는 "확인 필요/미정" 항목(학교 LLM 키 제공사·한도, 저장소 public/private, 로그인 방식 ①JWT 쿠키 ②Supabase Auth 등)이 남아 있으니, 가정하지 말고 해당 표를 확인한다.

## 작업 규칙 (docs/team/working-agreement.md)

- main에 직접 커밋하지 않는다. 브랜치 이름은 `작업유형/파일이름` (예: `docs/working-agreement`), PR을 올리고 작성자 외 1명 이상 승인 후 병합한다.
- PR은 기능/작업 단위 하나로 구성한다. 단 daily 회고(`logs/daily/`)는 모두가 같은 PR에 커밋한다.
- 표가 있는 단계 파일(`docs/domain/01~03` 등)은 블록마다 정리 담당 1명만 고친다. 근거 카드(`docs/domain/cards/`, 사람마다 파일 하나)와 개인 회고는 각자 쓴다.
- 커밋 메시지는 `docs :: 내용` 형식을 쓴다(예: `docs :: PRD.md 작성`).
- 이슈 템플릿: `.github/ISSUE_TEMPLATE/bug.md`, `user-story.md`.
- `.claude/agents/stack-advisor.md`: 기술 스택 후보를 비교하는 서브에이전트(최종 결정은 팀이 한다).

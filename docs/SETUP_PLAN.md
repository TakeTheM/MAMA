# 프로젝트 초기화 계획과 실행 확인

> **저장 위치:** `docs/SETUP_PLAN.md`

> **사용 방법**
>
> - 만들기 전에 1~4절을 채웁니다. Plan 모드로 받은 계획을 팀이 읽고 고친 뒤 승인한 내용입니다. 만든 뒤에는 실제 결과와 비교합니다(7절).
> - 범위는 **실행되는 최소 구조까지**입니다. 폴더·의존성·기본 화면·서버 시작·실행 방법. PRD의 실제 기능은 만들지 않습니다.
> - 스택과 버전은 `STACK.md`를 따릅니다. 설치와 초기화는 Claude가 아니라 **학생이 공식 문서를 보고 직접** 합니다. 확인한 공식 문서의 주소와 절, 직접 실행한 명령을 1·3절에 적습니다. 공식 문서를 확인하지 못한 것은 `미확인`으로 씁니다. 최신 버전으로 무조건 바꾸지 않습니다. 계획(Claude가 제안)과 공식 문서가 다르면 공식 문서를 따르고 7절에 차이를 적습니다.
> - 5절과 6절은 정리 담당 한 사람이 적습니다. 나머지는 팀 채팅에 올립니다.
> - 6절 실행 확인은 5명 모두, 각자 자기 Mac에서 실행한 결과입니다. "AI가 완료라고 답함"은 확인이 아닙니다. 실행하지 않은 것은 `미실행`, 테스트가 아직 없으면 `테스트 미구성`으로 씁니다.
> - `>`로 시작하는 안내 문장은 지워도 됩니다.

- 작성일: 2026-10-27
- 근거: `STACK.md`(C안 수정), `PRD.md`(v0.1), `decisions/mvp-scope.md`
- 상태: 계획 초안 (팀 검토 전)

## 1. 사용할 기술과 버전

> '사용할 버전'은 `STACK.md`에 적힌 값이고, 적혀 있지 않은 것은 `STACK.md에 없음`으로 둡니다. '찾아볼 공식 문서·절'의 절 이름은 예상이므로 실제 제목을 확인해 고칩니다. '최신 안정 버전'·'확인한 사람'·'확인 날짜' 칸은 공식 문서를 직접 열어 본 사람이 채웁니다. 아직 아무도 확인하지 않았으므로 모두 `미확인`입니다.

| 기술                              | 사용할 버전 (STACK.md)                             | 최신 안정 버전 | 호환성·제약 (직접 확인할 것)                                                                              | 찾아볼 공식 문서 (주소·절)                                                                                                                                       | 확인한 사람 | 확인 날짜 |
| --------------------------------- | -------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --------- |
| Node.js                           | STACK.md에 없음 (`.nvmrc`로 고정)                  | 미확인         | Next.js 16 최소 Node 버전, Vercel 지원 버전, 현재 LTS가 겹쳐야 함                                         | https://nodejs.org/en/about/previous-releases · Next.js 설치 문서 "System requirements" 절 · https://vercel.com/docs/functions/runtimes/node-js/node-js-versions | 미확인      | 미확인    |
| Node 버전 관리                    | nvm 또는 fnm (통일 미정)                           | -              | `.nvmrc`를 읽는 방식, 5명이 같은 도구를 써야 함                                                           | nvm GitHub README "Installing and Updating"·".nvmrc" 절                                                                                                          | 미확인      | 미확인    |
| Next.js (App Router) + TypeScript | 16                                                 | 미확인         | 화면과 `/api/*` rewrites 프록시만 맡음. DB 연결 정보·비밀값을 두지 않음. create-next-app 질문 항목·기본값 | https://nextjs.org/docs/app/getting-started/installation · "Automatic installation" 절                                                                           | 미확인      | 미확인    |
| Next.js rewrites                  | (설정 기능)                                        | -              | `/api/:path*`를 외부 주소로 넘기는 문법                                                                   | https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites                                                                                         | 미확인      | 미확인    |
| Next.js 환경변수                  | (설정 기능)                                        | -              | `.env.local` 읽는 순서, `NEXT_PUBLIC_` 노출 규칙                                                          | https://nextjs.org/docs/app/guides/environment-variables                                                                                                         | 미확인      | 미확인    |
| Tailwind CSS                      | v4                                                 | 미확인         | create-next-app이 v4를 기본으로 넣는지. shadcn/ui는 이번에 넣지 않음(4절)                                 | Next.js 설치 문서의 Tailwind 절 · Tailwind 공식 "Install with Next.js" 절                                                                                        | 미확인      | 미확인    |
| Vitest                            | STACK.md에 없음                                    | 미확인         | Next.js와 함께 쓸 때 필요한 패키지(jsdom, testing-library 등)                                             | Next.js 문서 "Testing" › "Vitest" 절                                                                                                                             | 미확인      | 미확인    |
| Python                            | 3.13 (`.python-version`으로 고정)                  | 미확인         | Render 기본값은 3.14.8이라 고정하지 않으면 로컬과 배포가 달라짐. Render가 `.python-version`을 읽는지      | https://render.com/docs/python-version · https://docs.astral.sh/uv/concepts/python-versions/                                                                     | 미확인      | 미확인    |
| uv                                | STACK.md에 없음                                    | 미확인         | 설치 방법, `.venv` 생성 위치, `uv sync --locked` 동작                                                     | https://docs.astral.sh/uv/ · "Installation" 절, "Projects" › "Project environment" 절                                                                            | 미확인      | 미확인    |
| FastAPI                           | STACK.md에 없음                                    | 미확인         | 설치 패키지 이름(`fastapi[standard]` 여부), `fastapi dev` 명령                                            | https://fastapi.tiangolo.com/ · "Installation"·"First Steps" 절                                                                                                  | 미확인      | 미확인    |
| Pytest                            | STACK.md에 없음                                    | 미확인         | FastAPI TestClient에 필요한 추가 패키지                                                                   | FastAPI 문서 "Tutorial › Testing" 절 · docs.pytest.org "Get Started" 절                                                                                          | 미확인      | 미확인    |
| Supabase (Postgres)               | Free 플랜                                          | -              | DB 500MB, 1주 비활성 시 일시정지. 이번에는 연결하지 않고 연결 문자열 형식만 확인                          | https://supabase.com/pricing · Supabase 문서 "Connecting to your database" 절                                                                                    | 미확인      | 미확인    |
| Homebrew                          | STACK.md에 없음                                    | 미확인         | Apple Silicon(`/opt/homebrew`)과 Intel(`/usr/local`) 설치 경로                                            | https://docs.brew.sh/Installation                                                                                                                                | 미확인      | 미확인    |
| Python ORM·마이그레이션           | 미정 (`STACK.md` 후보: SQLAlchemy + Alembic)       | -              | 이번 범위 밖. 팀 결정 뒤 다음 단계에서 추가                                                               | -                                                                                                                                                                | -           | -         |
| 린트·포맷                         | 프론트: create-next-app 기본 ESLint / 백엔드: 미정 | 미확인         | 백엔드 린트 도구는 `STACK.md`에 없음 (아래 표)                                                            | 미확인                                                                                                                                                           | 미확인      | 미확인    |

### 착수 전 팀이 결정할 것

| 결정할 것                                              | 왜 지금 필요한가                                                     | 제안 담당     |
| ------------------------------------------------------ | -------------------------------------------------------------------- | ------------- |
| 코드 저장소 이름, public/private (TakeTheM 조직)       | 이 저장소(`MAMA-docs`)는 문서용. private이면 Vercel Hobby 배포 불가  | 박하린        |
| Node 버전과 nvm/fnm 통일                               | `.nvmrc` 값이 정해져야 공유 영역 초기화를 시작할 수 있음             | 박하린        |
| uv(`STACK.md`) vs `python3 -m venv` + pip              | 3절 명령과 lock 파일 형식이 달라짐. 어느 쪽이든 `backend/.venv`를 씀 | 이규민        |
| 영역별 담당자 (2절 표는 `team/roles.md` S1 기준 제안)  | 공유 영역 담당이 의존성 파일을 혼자 맡으므로 먼저 정해야 함          | 임소리        |
| FastAPI 경로를 모두 `/api` 아래에 둘지 (`/api/health`) | rewrites 설정과 백엔드 경로가 맞아야 함                              | 이규민·윤미수 |
| 백엔드 린트·포맷 도구 (쓰지 않음 / Ruff 등)            | 3절 '린트·포맷' 행을 채우기 위해                                     | 이규민        |
| 프론트 스모크 테스트 범위 (jsdom 등 테스트 환경)       | Vitest 설정과 추가 패키지가 달라짐                                   | 김태훈        |
| `dev.sh`로 함께 실행 vs 터미널 2개                     | 한쪽이 실패했을 때 오류가 보이는 방식이 달라짐                       | 박하린        |

## 2. 폴더 구조와 담당 영역

> **규칙: 공유 파일(루트 설정, 의존성 파일, `.gitignore`)은 공유 영역에서만 만들고 고칩니다.** 의존성 파일은 `package.json`, `package-lock.json`, `pyproject.toml`, `uv.lock`입니다. 다른 영역에서 패키지나 설정이 더 필요하면 공유 영역 담당에게 요청합니다. lock 파일 충돌을 막기 위해서입니다.
> 프론트와 백엔드는 한 저장소의 두 폴더로 둡니다(`STACK.md` C안: Vercel Root Directory `frontend`, Render `backend`). 아래는 계획이며, 생성 명령이 실제로 만드는 파일과 다르면 실제를 따르고 7절에 적습니다.

```text
(코드 저장소, 이름 미정)/
├── .gitignore                         ┐
├── .nvmrc                             │
├── README.md                          │
├── scripts/dev.sh                     │
├── frontend/package.json              │
├── frontend/package-lock.json         │
├── frontend/tsconfig.json             │ 공유 영역
├── frontend/eslint.config.mjs         │ (생성 도구가 만들면)
├── frontend/next.config.ts            │ (/api/* → BACKEND_URL rewrites)
├── frontend/.env.example              │
├── backend/pyproject.toml             │ (pytest 설정 포함)
├── backend/uv.lock                    │
├── backend/.python-version            │ (3.13)
├── backend/.env.example               ┘
├── backend/app/__init__.py            ┐ 서버 영역
├── backend/app/main.py                ┘ (FastAPI 앱, GET /api/health)
├── frontend/app/layout.tsx            ┐
├── frontend/app/page.tsx              │ 화면 영역
├── frontend/app/globals.css           ┘
├── frontend/vitest.config.mts         ┐
├── frontend/__tests__/page.test.tsx   │ 테스트 영역
└── backend/tests/test_health.py       ┘
```

> 상태 확인 주소는 `/api/health`로 둡니다. rewrites가 `/api/*`를 그대로 넘기므로 3000과 8000에서 같은 경로로 부를 수 있고, `STACK.md`의 "`/api/health`로 백엔드 깨우기"와도 맞습니다.

| 역할                               | 맡는 영역 (폴더·파일)                                                 | 만드는 것                                                                                                                                                    | 만들지 않는 것                                 |
| ---------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| 공유 기반 — 박하린 (테크 리드)     | 위 '공유 영역' 파일 전부                                              | 두 폴더 초기화(create-next-app, uv 프로젝트 생성), 의존성·lock 파일, 테스트 도구 의존성 추가, rewrites 설정, `.env.example`, `dev.sh`, README의 설치·실행 절 | 화면·서버 코드                                 |
| 서버 — 이규민 (개발자 2)           | `backend/app/`                                                        | FastAPI 앱 시작 지점, `GET /api/health` → `{"status": "ok"}`                                                                                                 | 의존성 파일, DB 연결, 로그인                   |
| 화면 — 윤미수 (개발자 1)           | `frontend/app/`                                                       | 기본 화면 1개 (서비스 이름 + 백엔드 상태 `ok` / `연결 안 됨` 표시)                                                                                           | 의존성 파일, `next.config.ts`                  |
| 테스트·실행 — 김태훈 (테스트 담당) | `frontend/vitest.config.mts`, `frontend/__tests__/`, `backend/tests/` | 스모크 테스트 2개 (프론트 1, 백엔드 1). 새 폴더에서 처음부터 실행 확인                                                                                       | 의존성 파일 (필요한 패키지는 공유 영역에 요청) |
| 정리 담당 — 임소리 (리더)          | `docs/` (이 문서 5·6·7절)                                             | 수정 요청과 실행 확인 결과 기록                                                                                                                              | -                                              |

> 담당자 이름은 `team/roles.md`의 S1 역할을 따른 제안입니다(1절 '착수 전 팀이 결정할 것'에서 확정).

**병합 순서:** ① 공유 기반 → ② 서버 / 화면 (서로 다른 폴더라 동시 진행) → ③ 테스트·실행 → ④ 정리 담당이 6절 기록

## 3. 설치와 실행 방법 (Mac)

> 설치·초기화 명령은 **공식 문서에서 확인한 것을 직접 실행한 것만** 적습니다. 아래 '명령' 칸은 `STACK.md`와 계획에서 나온 **후보**이며, 직접 실행해 확인하기 전까지 '근거'와 '직접 실행한 사람'은 `미확인`·`미실행`입니다.

### 3-1. Mac 사전 설치와 주의점

**사전 설치:** Xcode Command Line Tools(`xcode-select --install`, git·빌드 도구 포함), Homebrew, uv, nvm(또는 fnm), git

- `uname -m`이 Apple Silicon은 `arm64`, Intel은 `x86_64`여야 합니다. Apple Silicon에서 `x86_64`가 나오면 Rosetta 터미널이라 x86용 Node·Python이 섞입니다.
- Homebrew 경로가 Apple Silicon `/opt/homebrew`, Intel `/usr/local`로 다릅니다. 경로를 코드나 `dev.sh`에 직접 쓰지 않습니다. Apple Silicon은 설치 안내에 나오는 PATH 설정(`~/.zprofile`)을 해야 `brew`가 잡힙니다.
- Mac 기본 `/usr/bin/python3`는 버전이 낮습니다(확인 필요). 3.13은 uv로 설치하고, 가상환경 안의 `python3`를 쓰는지 `which python3`로 확인합니다.
- `node_modules`·`.venv`는 커밋하거나 다른 Mac에 복사하지 않습니다(아키텍처마다 SWC·Tailwind 같은 네이티브 바이너리가 다름). 깨지면 프론트는 `rm -rf node_modules && npm ci`, 백엔드는 `rm -rf .venv && uv sync --locked`로 다시 설치합니다.
- 포트 5000은 AirPlay 수신 모드가 씁니다. 3000·8000이 이미 쓰이면 `lsof -i :3000`으로 확인합니다.
- (이번 뼈대 밖) 나중에 argon2·Postgres 드라이버를 넣을 때 arm64 휠 제공 여부를 확인합니다.

### 3-2. 설치·초기화·실행

| 단계                                     | 명령 (후보)                                                                               | 실행 위치                | 근거 공식 문서 (주소·절)                                              | 직접 실행한 사람                               |
| ---------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------- | ---------------------------------------------- |
| 아키텍처 확인                            | `uname -m`                                                                                | 아무 곳                  | -                                                                     | Claude (박하린 Mac)                            |
| 도구 설치                                | Homebrew 공식 설치 스크립트 → `brew install uv` → nvm 설치                                | 아무 곳                  | https://docs.brew.sh/Installation · uv "Installation" 절 · nvm README | 미실행                                         |
| Node 설치                                | `nvm install` → `nvm use` (`.nvmrc` 읽음)                                                 | 루트                     | nvm README ".nvmrc" 절                                                | 미실행                                         |
| 프로젝트 초기화 — 프론트 (공유 담당 1회) | `npx create-next-app@<버전> frontend` (TypeScript, App Router, Tailwind, ESLint 선택)     | 루트                     | Next.js "Automatic installation" 절                                   | Claude (박하린 Mac)                            |
| 프로젝트 초기화 — 백엔드 (공유 담당 1회) | `uv init` → `uv python pin 3.13` → `uv add fastapi…` → `uv add --dev pytest…`             | `backend/`               | uv "Working on projects" 절 · FastAPI "Installation" 절               | Claude (박하린 Mac)                            |
| 프로젝트 초기화 — Vitest (공유 담당 1회) | `npm install -D vitest …` (패키지 목록은 문서 확인)                                       | `frontend/`              | Next.js "Testing › Vitest" 절                                         | Claude (박하린 Mac)                            |
| 가상환경·설치 (백엔드)                   | `uv python install` → `uv sync --locked` (`backend/.venv` 생성)                           | `backend/`               | uv "Project environment" 절                                           | Claude (박하린 Mac)                            |
| 가상환경 확인                            | `source .venv/bin/activate` → `python3 --version` (3.13.x) → `which python3` (`.venv` 안) | `backend/`               | Python 문서 "venv" 절                                                 | Claude (박하린 Mac) — 3.13.17, `.venv` 안 확인 |
| 설치 (프론트)                            | `npm ci`                                                                                  | `frontend/`              | npm 문서 "npm ci"                                                     | Claude (박하린 Mac, create-next-app이 설치)    |
| 환경변수 파일                            | `cp backend/.env.example backend/.env` / `cp frontend/.env.example frontend/.env.local`   | 루트                     | Next.js 환경변수 절                                                   | Claude (박하린 Mac)                            |
| 실행 (함께)                              | `./scripts/dev.sh`                                                                        | 루트                     | -                                                                     | Claude (박하린 Mac, BACKEND_PORT=8001)         |
| 실행 (따로)                              | 백엔드 `uv run fastapi dev app/main.py --port 8000` / 프론트 `npm run dev`                | `backend/` / `frontend/` | FastAPI "First Steps" 절 · Next.js 설치 문서                          | Claude (박하린 Mac, 백엔드 8001)               |
| 테스트                                   | 백엔드 `uv run pytest` / 프론트 `npm test`                                                | `backend/` / `frontend/` | FastAPI "Testing" 절 · Next.js "Vitest" 절                            | Claude (박하린 Mac)                            |
| 린트·포맷                                | 프론트 `npm run lint` / 백엔드 미정                                                       | `frontend/` / `backend/` | 미확인                                                                | Claude (박하린 Mac, 프론트만)                  |

> uv 대신 표준 venv로 정하면 백엔드 설치 행은 `python3 -m venv .venv` → `source .venv/bin/activate` → `python3 -m pip install …`로 바꿉니다(1절 결정 사항).

- **서버 포트:** 프론트 `3000`, 백엔드 `8000` (5000은 쓰지 않음 — Mac AirPlay가 씀)
- **필요한 환경변수 이름 (값은 쓰지 않음):**

  | 파일                  | 이름           | 이번 뼈대에서 쓰나              |
  | --------------------- | -------------- | ------------------------------- |
  | `frontend/.env.local` | `BACKEND_URL`  | 예 (rewrites 대상, 비밀값 아님) |
  | `backend/.env`        | `DATABASE_URL` | 아니오 (이름만 둠)              |
  | `backend/.env`        | `JWT_SECRET`   | 아니오                          |
  | `backend/.env`        | `LLM_API_KEY`  | 아니오                          |

  비밀값에 `NEXT_PUBLIC_`를 붙이지 않습니다. 값을 비운 `.env.example`만 커밋합니다.

- **`.gitignore`에 넣을 것:** `node_modules/`, `.next/`, `.venv/`, `__pycache__/`, `.pytest_cache/`, `.env`, `.env.local`, `.DS_Store`
- **성공 기준:**
  1. http://localhost:8000/api/health 가 `{"status": "ok"}`를 돌려준다
  2. http://localhost:8000/docs 에서 FastAPI 문서 화면이 열린다
  3. http://localhost:3000 에 서비스 이름과 백엔드 상태 `ok`가 보인다 (rewrites 프록시가 동작한다는 뜻)
  4. 백엔드를 끄고 3000을 새로고침하면 `연결 안 됨`이 보인다
  5. `backend/`에서 `uv run pytest` → `1 passed`, `frontend/`에서 `npm test` → `1 passed`
  6. 새로 clone한 폴더에서 3-2 순서대로만 해서 1~5가 된다 (5명 각자 Mac에서 확인)

## 4. 이번에 하는 것과 하지 않는 것

| 이번에 한다                                                                      | 이번에 하지 않는다                                       |
| -------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 폴더·의존성·실행 설정 (`.nvmrc`, `.python-version`, lock 파일, `scripts/dev.sh`) | PRD의 실제 업무 기능 (F-01~F-05, US-01~US-07)            |
| 기본 화면 1개 (서비스 이름 + 백엔드 상태 표시)                                   | 광고 입력·초안·검수·승인·게시 기록·성과 화면             |
| 서버 시작 지점과 `GET /api/health`                                               | 회원가입·로그인 (로그인 방식 ①/② 미정)                   |
| Next.js → FastAPI `/api/*` rewrites 연결                                         | DB 연결·테이블·마이그레이션 (ORM 미정), 실제 데이터 처리 |
| 실행·테스트 방법, 스모크 테스트 (프론트·백엔드 각 1개)                           | 상태 전이·상태 기록, LLM 호출 (학교 LLM 키 미확인)       |
| `.env.example` (이름만)                                                          | 기능별 테스트                                            |
|                                                                                  | shadcn/ui 설치, Vercel·Render 배포 (다음 단계)           |

## 5. 계획 수정 요청 (정리 담당이 적음)

| 수정 요청한 내용 | 반영 / 보류 / 반영하지 않음 | 이유 |
| ---------------- | --------------------------- | ---- |
|                  |                             |      |

## 6. 실행 확인 (5명 전원, 정리 담당이 모아 적음)

| 이름   | macOS 버전·칩                                         | 설치 | 기본 실행 | 테스트 명령 | 남은 문제                                                                              |
| ------ | ----------------------------------------------------- | ---- | --------- | ----------- | -------------------------------------------------------------------------------------- |
| 임소리 | MacBook Air M3 (macOS 26.62) · Apple Silicon (arm64)  | 성공 | 성공      | 성공        | 박하린이 확인 (2026-10-27)                                                             |
| 박하린 | MacBook Pro M4 (macOS 27.0.1) · Apple Silicon (arm64) | 성공 | 성공      | 성공        | nvm 미설치라 Node 25.8.1로 실행. Node 24로 재설치 필요. 8000은 다른 프로젝트가 사용 중 |
| 윤미수 | MacBook Air M3 (macOS 27.0.1) · Apple Silicon (arm64) | 성공 | 성공      | 성공        | 박하린이 확인 (2026-10-27)                                                             |
| 이규민 | MacBook Air M3 (macOS 26.62) · Apple Silicon (arm64)  | 성공 | 성공      | 성공        | 박하린이 확인 (2026-10-27)                                                             |
| 김태훈 | MacBook Air M3 (macOS 27.0.1) · Apple Silicon (arm64) | 성공 | 성공      | 성공        | 박하린이 확인 (2026-10-27)                                                             |

> 값: 설치·기본 실행은 `성공 / 실패`, 테스트 명령은 `성공 / 실패 / 테스트 미구성`.
> 실패한 팀원은 실행한 명령과 오류 메시지를 그대로 적습니다. "안 돼요"는 기록이 아닙니다.

## 7. 계획과 실제의 차이

> 2026-10-27, 팀 결정(B안)에 따라 공유·서버·화면·테스트 영역의 설치·초기화를 **Claude가 박하린의 Mac(arm64, macOS 27.0.1)에서 실행**했습니다. 아래 설치 버전은 실제로 설치된 값이며, 1절의 공식 문서 확인은 아직 팀이 하지 않았습니다.
> 실제 설치 버전: Node 25.8.1(임시, 아래 참고) · npm 11.11.0 · Next.js 16.4.3 · React 19.3.0 · TypeScript 5.9.3 · Tailwind CSS 4.3.3 · ESLint 9.39.5 · Vitest 4.1.12 · Python 3.13.17 · uv 0.11.2 · FastAPI 0.162.0 · Uvicorn 0.54.0 · Pytest 9.1.1
> 확인 결과: `uv run pytest` 1 passed, `npm test` 1 passed, `npm run lint` 오류 없음, `tsc --noEmit` 통과. `/api/health`(백엔드 직접 호출과 3000 경유 rewrites) 모두 `{"status":"ok"}`, `/docs` 200, 백엔드를 끄면 3000의 `/api/health`가 500(화면은 `연결 안 됨` 표시). 브라우저 화면은 눈으로 확인하지 않았습니다.

| 계획                             | 실제                                                                                                                                                                   | 이유                                                                                                                                                                                 |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 설치·초기화는 학생이 직접        | Claude가 실행                                                                                                                                                          | 팀 결정 (B안)                                                                                                                                                                        |
| 코드 저장소는 별도 (이름 미정)   | `MAMA-docs` 저장소 안에 `frontend/`, `backend/`, `scripts/`                                                                                                            | 팀 결정                                                                                                                                                                              |
| nvm으로 Node 24 설치             | **nvm 미설치.** `.nvmrc`는 `24`로 만들었지만 설치·실행은 이 Mac의 Node 25.8.1로 함                                                                                     | nvm 공식 설치 스크립트(`curl … \| bash`) 실행이 권한에서 막힘. 박하린이 nvm을 설치한 뒤 `nvm install && nvm use` → `cd frontend && rm -rf node_modules && npm ci`로 다시 설치해야 함 |
| Node 24가 LTS인지 확인           | nodejs.org 배포 목록에서 v24.22.1이 LTS(Krypton). Next.js 16.4.3의 `engines.node`는 `>=20.9.0`                                                                         | 공식 릴리스 문서 절은 팀이 다시 확인                                                                                                                                                 |
| 백엔드 포트 8000                 | 이 Mac에서는 다른 프로젝트(`PTKOREA/CRM-prototype` 백엔드)가 8000을 쓰고 있어 8001로 확인                                                                              | 다른 프로젝트 서버는 끄지 않음. `dev.sh`에 포트 사용 검사와 `BACKEND_PORT` 변수를 추가                                                                                               |
| `dev.sh`는 두 서버를 함께 실행   | 포트가 이미 쓰이면 바로 멈추고 알림, `BACKEND_PORT`·`FRONTEND_PORT`로 변경 가능, 프론트에 `BACKEND_URL` 전달                                                           | 위 포트 충돌 때문                                                                                                                                                                    |
| `uv init` 결과 그대로 사용       | uv가 만든 예제 `main.py`와 빈 `README.md` 삭제, `pyproject.toml`의 `readme` 줄 삭제, pytest 설정(`testpaths`, `pythonpath`) 추가                                       | 계획 구조(`app/main.py`)와 맞추기 위해                                                                                                                                               |
| create-next-app 결과 그대로 사용 | `frontend/README.md` 삭제. 생성된 `next.config.ts`의 `cacheComponents`·`partialPrefetching`·Tailwind turbopack 로더 설정은 그대로 두고 rewrites만 추가                 | 설치·실행 방법은 루트 README 한 곳에 둠                                                                                                                                              |
| `.gitignore`는 공유 영역에서     | create-next-app이 `frontend/.gitignore`를 만들었고 `.env*`를 모두 제외해 `.env.example`도 빠짐 → `!.env.example` 추가. 루트 `.gitignore`에 Python 항목 추가            | `.env.example`을 커밋하기 위해                                                                                                                                                       |
| Vitest 패키지 목록은 문서 확인   | `vitest`, `@vitejs/plugin-react`, `jsdom`, `@testing-library/react`, `@testing-library/dom`, `vite-tsconfig-paths` 설치. `npm test`는 `vitest run`(한 번 실행 후 종료) | 성공 기준 "1 passed 후 종료"에 맞추기 위해 watch 모드를 쓰지 않음                                                                                                                    |
| (계획에 없음)                    | Next.js 경고: `/Users/harin/Documents/package-lock.json`을 무시함                                                                                                      | 저장소 밖의 오래된 파일. 동작에는 영향 없음. 지우지 않음                                                                                                                             |

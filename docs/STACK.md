# 기술 스택 결정 기록


- 결정일: 2026.10.27
- 근거: stack-inputs.md(팀 경험·조건), mvp-scope.md, backlog.md(필수 스토리)

## 우리 팀 상황

| 항목 | 내용 |
| --- | --- |
| 서비스 | 셀러 광고 한 건의 초안 작성 → 표현 검수 → 승인 → 게시·종료 기록 → 성과 요약을 관리하는 웹 서비스 |
| 핵심 기능 (필수 스토리 기준) | AI 광고 초안 작성(US-01), 논란 표현 검수(US-03), 성과 요약·다음 광고 제안(US-05). 상태 전이·상태 기록, 소유 셀러 권한, 취소(US-06)·플랫폼 반려(US-07) 경로 포함 |
| 팀이 **직접 써 본** 언어·도구 (이름만 들어 본 것은 제외) | React(5명 모두), TypeScript(임소리·윤미수·김태훈·이규민, 박하린은 확인 필요), Next.js(임소리·윤미수·박하린), React Native(임소리·박하린), Electron·Vercel(박하린), Python(FastAPI·Flask·Django)·Java(Spring Boot·JPA)·Docker·k8s·Cloudflare(이규민) |
| 개발 기간 | 8주, 팀 합계 20시간 |
| 화면 (웹 / 모바일, 반응형 여부) | 웹 (반응형 여부 확인 필요) |
| 시연 방식 (로컬 / 외부 접속) | 배포 후 외부 접속 |
| 제약 (비용, 설치 권한, 외부 서비스) | 무료로만. 설치 권한·외부 서비스 제한 없음. 5명 모두 Mac. LLM은 학교 제공 키 사용(제공사·한도 확인 필요). 간단한 회원가입·로그인 필요 |

## 후보 2안 비교


| 비교 항목 | A안: Next.js 풀스택 + Supabase | B안: React(Vite) + FastAPI + Neon | C안: Next.js + FastAPI + Neon (혼합) |
| --- | --- | --- | --- |
| 프론트엔드 | Next.js 16 (App Router) + TypeScript — 써 본 사람: 임소리·윤미수·박하린 | React + Vite + TypeScript — React는 5명 모두, Vite 경험은 확인 필요 | Next.js 16 + TypeScript — 써 본 사람: 임소리·윤미수·박하린. 화면과 얇은 프록시만 맡음 |
| 백엔드 | Next.js Route Handler / Server Action — 위 3명 | FastAPI (Python 3.10 이상) — 써 본 사람: 이규민 1명 | FastAPI (Python 3.13 고정, uv) — 써 본 사람: 이규민 1명. 상태 전이·권한·LLM·규칙 검사 전부 |
| DB | Supabase Postgres (신규) | Neon Postgres + SQLAlchemy 등 ORM (신규) | Neon Postgres + ORM·마이그레이션 도구(예: SQLAlchemy + Alembic) (신규) |
| 로그인 | Supabase Auth 기본 제공(`@supabase/ssr`). 소유자 검사는 서버 코드 + RLS 이중 | FastAPI에서 직접 구현 (PyJWT + pwdlib) | FastAPI가 JWT를 httpOnly 쿠키로 발급 (PyJWT + pwdlib[argon2]) (신규) |
| UI 도구 | Tailwind CSS v4 + shadcn/ui (신규) | Tailwind CSS v4 + shadcn/ui (신규) | Tailwind CSS v4 + shadcn/ui (신규) |
| 배포 | Vercel Hobby 하나 — 써 본 사람: 박하린 | 프론트 Vercel, 백엔드 Render Free Web Service (서비스 2개) | 프론트 Vercel, 백엔드 Render, DB Neon (서비스 3개) |
| 새로 배워야 할 것 | Supabase(Auth·DB·RLS), Vercel AI SDK, Tailwind, shadcn/ui | Neon, Render, ORM, JWT 로그인 직접 구현, Tailwind, shadcn/ui. 이규민 외 4명은 Python 전체 | B안과 같음 + Next.js rewrites. 프론트는 Next.js라 3명이 바로 작업 가능 |
| 화면·서버 연결에서 어려울 곳 | 서버/클라이언트 컴포넌트 경계(윤미수가 어려웠다고 기록). LLM·DB 쓰기·상태 전이는 서버에만 둬야 함 | 서비스 2개라 CORS·API 주소 환경변수 설정 필요. 프론트 4명은 API가 나올 때까지 목업으로 작업 | Next.js rewrites로 `/api/*`를 FastAPI로 전달해 CORS 불필요. 프록시를 거친 `Set-Cookie` 전달은 확인 필요. 백엔드가 이규민 1명에게 몰리는 것은 B안과 같음 |
| 테스트·실행 재현 | 좋음. Node 하나만 맞추면 됨: `nvm install && nvm use` → `npm ci` → `cp .env.example .env.local` → `npm run dev`. 로컬 Docker 불필요 | 보통. Node + Python 두 런타임: `brew install uv` → `uv sync --locked` → `uv run fastapi dev` + 프론트는 A안과 같음. `.python-version`으로 버전 고정 필요(Render 기본 3.14.8) | 보통. Node + Python 두 런타임. `./scripts/dev.sh` 하나로 프론트(3000)와 백엔드(8000)를 함께 실행. Neon 개발용 DB를 공유하면 Docker 불필요 |
| 비용·무료 한도 (확인한 것 / 확인 필요) | 확인: Vercel Hobby는 비상업 용도만, **GitHub 조직 private 저장소는 배포 불가**. Supabase Free는 DB 500MB, **1주 비활성 시 일시정지**, 기본 인증 메일 시간당 2통. 확인 필요: 학교 LLM 키 한도 | 확인: Render Free는 **15분 비활성 시 꺼짐**(월 750시간), Render Free Postgres는 30일 뒤 만료라 쓰지 않음. Neon Free는 1GB, 5분 비활성 시 scale to zero. 확인 필요: Render 콜드 스타트 시간, 학교 LLM 키 한도 | B안 조건 + Vercel Hobby 조건. 확인: Render가 다시 켜지는 데 약 1분, **Vercel 외부 프록시 타임아웃 120초**. 확인 필요: 학교 LLM 키 한도 |

### C안 세부 설계 (C안을 고를 때 참고)

**역할 분담: 규칙은 FastAPI에만 둔다. Next.js는 보여 주고 전달만 한다.**

| 담당 | Next.js | FastAPI |
| --- | --- | --- |
| 화면, 입력 폼, 버튼 활성/비활성 표시 | O | |
| 입력 형식 검증 | O (UX용 보조) | O (최종 판정) |
| `/api/*` 요청을 FastAPI로 전달 (rewrites) | O | |
| 회원가입·로그인·쿠키 발급·소유 셀러 검사 | | O |
| 상태 전이 허용 여부, 상태 기록 1줄 (같은 트랜잭션) | | O |
| LLM 호출 3곳, 보내지 않을 정보 걸러 내기 | | O |
| 금지어 이중 검사, 근거 링크 허용 목록 | | O |
| ROAS 계산, 24시간 알림 판정 | | O |
| DB 접근 | X (연결 정보를 두지 않음) | O |

- 승인 버튼 활성 여부 같은 판단은 FastAPI 응답(예: `can_approve`)을 그대로 보여 줍니다. 같은 규칙을 TypeScript로 다시 만들지 않습니다.
- 데이터는 클라이언트 컴포넌트에서 `/api/...`로 가져오는 방식을 기본으로 둡니다. Server Component에서 부르면 쿠키를 직접 전달해야 해서 복잡해집니다.
- FastAPI의 OpenAPI 문서(`/docs`)를 API 계약 문서로 씁니다. TS 타입 자동 생성 도구 사용 여부는 팀이 정합니다(호환성 확인 필요).

**로그인 방식 후보**

| 후보 | 장점 | 단점 | 20시간 기준 |
| --- | --- | --- | --- |
| ① FastAPI 자체 JWT + httpOnly 쿠키 | 인증·권한이 FastAPI 한 곳. 외부 서비스가 늘지 않음. FastAPI 공식 튜토리얼 방식 | 가입·로그인·로그아웃·해시·만료를 직접 구현. 프록시를 거친 쿠키 전달은 확인 필요 | 1순위 |
| ② Supabase Auth + FastAPI에서 JWKS 검증 | 가입·로그인이 이미 있음. DB와 같은 Supabase를 써서 서비스가 늘지 않음 | FastAPI에 JWKS 검증을 붙여야 함. Supabase 일시정지·메일 제한은 A안과 같음 | 2순위 |
| ③ Auth.js (credentials) | Next.js 안에서 끝남 | 회원가입 기본 미제공, Better Auth로 편입됨. FastAPI와 토큰 공유를 직접 설계 | 비추천 |

**Next.js ↔ FastAPI 호출 방식**

| 방식 | CORS | 쿠키 | 타임아웃 |
| --- | --- | --- | --- |
| 브라우저가 Render를 직접 호출 | 필요 | 크로스사이트 쿠키(`SameSite=None`), 브라우저 차단 가능성 확인 필요 | Vercel 영향 없음, Render 콜드 스타트는 그대로 |
| **Next.js rewrites 프록시 (권장)** | 불필요 | Vercel 도메인의 1st-party 쿠키 | Vercel 외부 프록시 120초 |
| Route Handler BFF 프록시 | 불필요 | 쿠키·헤더를 직접 전달(코드 증가) | Hobby 함수 최대 300초, 함수 한도 사용 |

- 콜드 스타트(약 1분) + LLM 응답이 120초에 가까워질 수 있습니다. 로그인 화면에서 `/api/health`를 먼저 불러 백엔드를 깨우고, 시연 직전에 미리 접속합니다. 그래도 넘으면 LLM 엔드포인트만 Route Handler나 폴링 구조로 바꿉니다.

**설치·실행 (C안)**

```bash
brew install uv
nvm install && nvm use                         
(cd backend && uv python install && uv sync --locked)
(cd frontend && npm ci)
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local   

./scripts/dev.sh  
```

- 배포: Vercel은 Root Directory를 `frontend`로 지정합니다. Render는 `backend`로 지정하고(확인 필요), `.python-version`으로 3.13을 고정합니다. Render 시작 명령의 `$PORT` 주입 방식은 확인 필요입니다.


### Mac(Apple Silicon) 공통 주의점
- 터미널에서 `uname -m`이 `arm64`여야 합니다. Rosetta 터미널에서 설치하면 x86용 Node·Python이 섞입니다.
- Homebrew는 `/opt/homebrew`에 설치됩니다(Intel Mac은 `/usr/local`). 경로를 코드에 직접 쓰지 않습니다.
- `node_modules`는 커밋하지 않습니다. 설치가 깨지면 `rm -rf node_modules && npm ci`로 다시 설치합니다.
- B안·C안: argon2·Postgres 드라이버의 arm64 휠 제공 여부는 확인 필요. 없으면 Xcode Command Line Tools가 필요할 수 있습니다.
- C안은 A안의 Node 네이티브 바이너리(SWC, Tailwind) 주의점과 B안의 Python 주의점을 모두 가집니다.

## 최종 선택

- 선택한 안: C안 (수정)
- 프론트엔드: Next.js TypeScript
- 백엔드: FastAPI
- DB: Supabase
- UI 도구: Tailwind
- 테스트 방식: 프론트엔드 Vitest, 백엔드 Pytest
- 시연·배포 환경: Vercel + Render

## 선택 이유 (팀 경험·기간·핵심 기능으로)
1. **팀 경험:** 프론트는 Next.js를 써 본 임소리·윤미수·박하린이 바로 화면을 만들 수 있고, 백엔드는 FastAPI를 써 본 이규민의 경험을 살릴 수 있다. 두 경험을 모두 쓰는 조합이다.
2. **핵심 기능:** 상태 전이·상태 기록, 소유 셀러 권한, LLM 3곳(초안 생성 US-01, 위험 표현 검수 US-03, 성과 요약 US-05), 금지어 이중 검사, ROAS 계산을 FastAPI 한 곳에 모은다. Next.js는 보여 주고 전달만 하므로 서버/클라이언트 경계 판단(윤미수가 어려웠다고 기록)에서 생기는 실수가 줄어든다.
3. **보안:** LLM 키·DB 접속 정보 같은 비밀값이 백엔드에만 있고 Next.js 쪽에는 없어, 키가 브라우저에 노출될 위험이 가장 작다.
4. **DB를 Supabase로 바꾼 이유 (원래 C안은 Neon):** Supabase Free도 Postgres라 FastAPI에서 그대로 쓸 수 있다. 무료 한도는 DB 500MB, 1주 동안 안 쓰면 일시정지된다. 나중에 로그인을 Supabase Auth로 바꿀 여지도 남는다(C안 로그인 후보 ②).
5. **기간:** 프론트 3명이 Next.js로 바로 작업하고, Next.js rewrites로 요청을 넘겨 CORS 설정이 필요 없다. 같은 백엔드를 쓰는 B안보다 설정할 것이 적다.

## 선택하지 않은 안과 이유
- **A안 (Next.js 풀스택 + Supabase):** 로그인이 기본 제공되고 배포가 단순해 20시간 기준으로는 가장 가볍다. 하지만 백엔드까지 TypeScript로 쓰면 이규민의 Python 백엔드 경험을 쓰지 못하고, 규칙이 Server Action·서버 컴포넌트·RLS에 나뉘어 서버/클라이언트 경계를 계속 신경 써야 한다.
- **B안 (React(Vite) + FastAPI + Neon):** 백엔드는 C안과 같지만, 프론트를 팀 다수가 써 본 Next.js 대신 Vite로 만들어야 하고(Vite 경험자 확인 필요), 브라우저가 FastAPI를 직접 불러 CORS와 크로스사이트 쿠키 설정이 추가로 필요하다. 같은 백엔드라면 C안이 프론트 경험을 더 잘 살린다.
- **C안을 고르며 감수하는 것:** 백엔드 일이 이규민 1명에게 몰리고, 로그인을 직접 구현해야 하며(Supabase Auth를 쓰지 않는 경우), 배포가 Vercel·Render·Supabase 3곳이고 Render 무료 서버는 15분 비활성 뒤 꺼진다. 대응은 "예상 어려움과 대응"에 있다.
- **재검토 결과 (2026-10-27):** 개발 기간이 8주, 팀 합계 20시간으로 확정된 뒤 다시 검토했고 C안을 유지한다. 원래 C안에서 바꾼 것은 DB 하나(Neon → Supabase)다. 유지 이유: 미정. 앞으로는 "예상 어려움과 대응" 표의 조건이 생길 때만 해당 부분을 바꾸고, 바꾼 내용은 이 문서에 기록한다.

## LLM 연결

- LLM이 맡는 일: 캡션·해시태그 초안 생성(US-01), 위험 표현 검수(US-03), 성과 요약·다음 광고 제안(US-05). 상태를 바꾸는 최종 결정(승인, 평가 완료)은 사장님이 버튼으로 하고, 서버의 상태 전이 규칙이 검사합니다. ROAS 같은 숫자는 시스템이 계산합니다.
- A안: Next.js Route Handler / Server Action에서만 호출(Vercel AI SDK로 제공사 교체 쉬움). 키는 로컬 `.env.local`, 배포는 Vercel 환경변수. **이름에 `NEXT_PUBLIC_`를 붙이지 않습니다**(붙이면 브라우저에 노출).
- B안: FastAPI의 `llm.py` 한 곳에서만 호출. 키는 로컬 `backend/.env`, 배포는 Render 환경변수. **프론트 `VITE_` 변수에 키를 넣지 않습니다**(브라우저에 노출).
- C안: FastAPI의 `llm.py` 한 곳에서만 호출. 키(`LLM_API_KEY`, `JWT_SECRET`, `DATABASE_URL`)는 로컬 `backend/.env`, 배포는 Render 환경변수. Next.js 쪽에는 `BACKEND_URL`만 두고 비밀값을 두지 않아 키 노출 위험이 가장 작습니다.
- 공통: 값을 비운 `.env.example`만 커밋합니다. 키를 실수로 커밋하면 즉시 폐기하고 재발급합니다.

## 예상 어려움과 대응
| 어려움 | 대응 |
| --- | --- |
| (A) 서버/클라이언트 경계 판단 | LLM 호출·DB 쓰기·상태 전이는 서버에만 둔다는 규칙을 먼저 합의 |
| (A) RLS 정책 실수로 다른 셀러 데이터 노출 또는 전부 막힘 | 서버 코드의 소유자 검사와 함께 이중으로 둠. 서버에서는 `getClaims()`로 검증 |
| (A) Supabase 기본 인증 메일 시간당 2통 | 데모용 테스트 계정을 미리 만들거나 이메일 확인 끄기(설정 가능 여부 확인 필요) |
| (A) Vercel Hobby는 팀 기능 없음 | 배포 계정 소유자 1명을 정하고 환경변수 관리 담당을 정함 |
| (B) 백엔드·로그인·배포가 이규민 1명에게 몰림 | API 계약을 먼저 정하고 프론트는 목업으로 병행 |
| (B) Render·Neon 비활성 뒤 첫 요청 지연 | 시연 전에 미리 접속해 깨워 둠 |
| (C) 백엔드가 이규민 1명에게 몰림 | 로그인·캠페인 생성 API 명세를 먼저 합의하고 프론트는 목업으로 병행 |
| (C) Supabase Free는 1주 비활성 시 일시정지 | 시연 전에 일시정지 여부를 확인하고, 멈췄으면 대시보드에서 다시 켬 |
| (C) 프록시를 거친 `Set-Cookie` 전달 | 첫 배포 때 로컬과 배포 환경에서 바로 시험 |
| (C) 콜드 스타트 + LLM 응답이 Vercel 프록시 120초 초과 | `/api/health`로 미리 깨우기, 넘으면 LLM 엔드포인트만 Route Handler·폴링으로 변경 |
| (C) 상태 이름·오류 형식이 Python과 TS에 따로 생김 | FastAPI를 기준으로 두고 TS 타입은 OpenAPI에서 생성하거나 한 파일에 모음 |
| (공통) 상태 변경과 상태 기록을 함께 저장 | 같은 트랜잭션으로 묶음 |
| (공통) 취소 뒤 늦게 도착한 LLM 결과(US-06) | 저장 직전에 현재 상태를 다시 확인 |
| (공통) 검수 결과를 JSON으로 안정적으로 받기 | LLM 제공사가 정해진 뒤 구조화 출력 방식을 맞춤 |
| (공통) Tailwind·shadcn/ui는 전원 신규 | shadcn 기본 컴포넌트만 쓰는 쪽으로 범위를 줄임 |

## 확인할 것
| 확인할 내용 | 담당 | 언제 |
| --- | --- | --- |
| 학교 LLM 키의 제공사, 직접 키인지 게이트웨이 키인지, 호출 한도·유효 기간, 외부 배포 서버에서 써도 되는지 | 미정 | 미정 |
| GitHub 저장소(TakeTheM 조직) public/private 여부 (private이면 Vercel Hobby 배포 불가) | 미정 | 미정 |
| 배포·DB 계정 명의와 비밀값 공유 방법 | 미정 | 미정 |
| 데모용 테스트 계정 준비 또는 회원가입 메일 확인 끄기 | 미정 | 미정 |
| Node 버전 관리 도구(nvm/fnm) 통일 | 미정 | 미정 |
| 박하린의 TypeScript 경험, Vite 경험자 | 미정 | 미정 |
| user-flows.md 상태 이름 정리 (상태 enum을 코드로 만들기 전) | 미정 | 미정 |
| (C안 선택 시) 백엔드를 이규민 외에 누가 함께 맡을지, API 명세 합의 시점 | 미정 | 미정 |
| (C안 선택 시) 로그인 방식 ①/② 선택, rewrites 프록시로 시작하는 방침 동의 | 미정 | 미정 |
| (C안 선택 시) Python ORM·마이그레이션 도구, Supabase 개발용/배포용 DB 분리 | 미정 | 미정 |
| (C안 선택 시) 시연 전 백엔드 깨우기 담당 | 미정 | 미정 |

## 의견이 갈렸다면
-

## 출처
- Supabase 가격: https://supabase.com/pricing
- Supabase Auth Next.js SSR: https://supabase.com/docs/guides/auth/server-side/nextjs
- Supabase Auth 요청 제한: https://supabase.com/docs/guides/auth/rate-limits
- Vercel Hobby 플랜: https://vercel.com/docs/plans/hobby
- Vercel Git 배포: https://vercel.com/docs/git
- Vercel 지원 Node 버전: https://vercel.com/docs/functions/runtimes/node-js/node-js-versions
- Render 무료 플랜: https://render.com/docs/free
- Render Python 버전: https://render.com/docs/python-version
- Neon 가격: https://neon.com/pricing
- Node.js 릴리스: https://nodejs.org/en/about/previous-releases
- Next.js 설치: https://nextjs.org/docs/app/getting-started/installation
- Next.js 환경변수: https://nextjs.org/docs/app/guides/environment-variables
- AI SDK 제공사 전환: https://ai-sdk.dev/docs/foundations/providers-and-models
- Vite 환경변수: https://vite.dev/guide/env-and-mode
- FastAPI: https://fastapi.tiangolo.com/
- FastAPI JWT 튜토리얼: https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/
- uv Python 버전: https://docs.astral.sh/uv/concepts/python-versions/
- Homebrew 설치: https://docs.brew.sh/Installation
- shadcn/ui Tailwind v4: https://ui.shadcn.com/docs/tailwind-v4
- Next.js rewrites: https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites
- Vercel 제한 (외부 프록시 120초): https://vercel.com/docs/limits
- Vercel CDN origin 타임아웃 변경: https://vercel.com/changelog/cdn-origin-timeout-increased-to-two-minutes
- Supabase JWT·JWKS: https://supabase.com/docs/guides/auth/jwts
- Auth.js credentials: https://authjs.dev/getting-started/authentication/credentials

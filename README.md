# MAMA

소상공인·이커머스 셀러를 위한 광고 문구 작성·검수 및 캠페인 관리 도구입니다. 상품 정보로 채널별 초안을 만들고 위험 표현·이유·근거·대체 문구를 보여 줍니다. 사용자가 승인한 광고의 게시·종료 기록과 성과를 한곳에서 관리합니다.

- 팀: M을 가져가 (TakeTheM), [팀원과 역할](docs/team/roles.md)
- 문서 최신 반영일: 2026-11-17
- 반영 근거: [중간 미팅 보고서](docs/interview/mid-meeting-report.md)

## 현재 흐름과 구현 범위

상품·목표·채널·예산 → 채널별 초안 → 위험 표현 확인·수정·재검수 → 사용자 승인 → 일정 설정 → 직접 게시·종료 기록 → 성과 입력·요약·평가 완료

위험 표현은 경고이며 수정 여부와 승인은 사용자가 결정합니다. 플랫폼 자동 게시·광고비 집행·성과 자동 수집은 하지 않습니다. 성과는 직접 입력하고 ROAS는 서버가 계산합니다. 최근 평가 완료 광고는 다음 초안의 참고로 사용합니다.

현재는 로그인 없는 공유 작업공간입니다. 화면의 기본 데이터 소스는 실제 FastAPI이며 목업은 테스트·명시적 데모용으로 남아 있습니다. 중간 미팅 보고서의 목업 시연 기록과 현재 코드의 차이, 실제 AI·DB·배포 통합 검증이 남은 항목은 [보고서 반영 기록](docs/interview/mid-meeting-report.md#보고서-당시-현황과-현재-코드)을 확인하세요.

## 저장소 구조

| 경로 | 역할 |
| --- | --- |
| `frontend/` | Next.js App Router·TypeScript 화면, API 어댑터, Vitest 테스트 |
| `backend/` | FastAPI, SQLAlchemy 모델·Alembic 마이그레이션, LLM 연동, Pytest 테스트 |
| `docs/` | PRD·백로그·사용자 흐름·MVP 범위·기술 결정·도메인 조사·미팅 기록 |
| `logs/daily/` | 팀원별 일일 회고 |
| `scripts/dev.sh` | 로컬 프론트·백엔드 동시 실행 |
| `.github/` | 이슈 템플릿 |

## 문서 지도

| 문서 | 기준으로 삼을 내용 |
| --- | --- |
| [PRD](docs/PRD.md) | 제품 개요와 문서 안내 |
| [백로그](docs/requirements/backlog.md) | F-01~F-05·US-01~US-07과 인수 조건 |
| [사용자 흐름](docs/requirements/user-flows.md) | 정상·반려·취소 경로 |
| [MVP 범위](docs/decisions/mvp-scope.md) | 포함·제외와 이유, 제안서와의 차이 |
| [상태·규칙·LLM](docs/domain/03-rules-states-llm.md) | 상태 이름·전이, LLM 입력·출력 경계 |
| [기술 스택](docs/STACK.md) | 현재 구성과 초기 후보 비교 기록 |
| [백엔드 README](backend/README.md) · [OpenAPI](backend/docs/openapi.json) | 실행·배포·환경변수·API 계약 |
| [중간 미팅 보고서](docs/interview/mid-meeting-report.md) | 보고서 당시 현황, 현재 코드와의 차이, 시연·확인 질문·후속 작업 |
| [첫 미팅](docs/interview/client-meeting-1.md) · [가설·질문](docs/interview/mvp-assumptions-questions.md) | 이전 고객 피드백·조사 가설 |
| [도메인 조사](docs/domain/README.md) · [근거 카드](docs/domain/cards/) | 용어·벤치마크·법령 등 조사 기록 |
| [제안서](docs/proposal/README.md) | 과거 제출 자료 |
| [작업 규칙](docs/team/working-agreement.md) · [초기화 기록](docs/SETUP_PLAN.md) | 팀 합의·초기 설치 당시 확인 기록 |

## 설치와 실행 (Mac)

Node 버전은 루트 `.nvmrc`(24), Python은 `backend/.python-version`(3.13)을 따릅니다. nvm·uv와 접속 가능한 PostgreSQL DB를 먼저 준비합니다.

```bash
nvm install && nvm use
(cd backend && uv python install && uv sync --locked)
(cd frontend && npm ci)
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

`backend/.env`의 `DATABASE_URL`을 채웁니다. 실제 AI 기능에는 `LLM_API_KEY`·`LLM_MODEL`이 필요하며 제공사에 따라 `LLM_BASE_URL`도 설정합니다. 비어 있으면 초안·검수·성과 요약은 503을 반환합니다. 상세 설정은 [백엔드 README](backend/README.md)를 따릅니다.

```bash
(cd backend && uv run alembic upgrade head)
./scripts/dev.sh
# 8000을 다른 프로그램이 쓰는 경우
BACKEND_PORT=8001 ./scripts/dev.sh
```

`dev.sh`는 기본 백엔드 8000·프론트 3000을 띄우고 `BACKEND_URL`을 전달합니다. 별도 실행할 때는 `frontend/.env.local`의 `BACKEND_URL`을 백엔드 주소로 설정합니다. 포트 5000은 Mac AirPlay 때문에 사용하지 않습니다.

| 확인 | 기대 결과 |
| --- | --- |
| `http://localhost:8000/api/health` | `{"status":"ok"}` |
| `http://localhost:8000/api/health/db` | DB 연결·스키마 조회 성공 시 `{"db":1}`, 실패 시 503 |
| `http://localhost:8000/docs` | FastAPI Swagger UI |
| `http://localhost:3000` | 캠페인 목록, 새 기획 진입 |
| `http://localhost:3000/api/health` | Next.js rewrites를 거친 백엔드 응답 |

포트를 바꿨다면 위 확인 주소도 바꿉니다. 실제 배포 절차는 [백엔드 README](backend/README.md#vercel-배포)를 따릅니다. 초기 Render 계획은 기술 스택 문서의 과거 기록입니다.

## 테스트

```bash
(cd frontend && npm test)
(cd frontend && npm run lint)
(cd backend && uv run pytest)
```

백엔드 DB 통합 테스트에는 개발 DB와 다른 전용 `TEST_DATABASE_URL`이 필요하며 DB 이름은 `_test`로 끝나야 합니다. 테스트는 해당 DB에 마이그레이션을 적용하고 업무 테이블을 비웁니다. URL이 없으면 DB 통합 테스트를 건너뛰므로 일부 테스트 통과만으로 전체 흐름 검증이 끝난 것은 아닙니다. 상세 조건은 [DB 통합 테스트](backend/README.md#db-통합-테스트)를 확인하세요.

## 작업 규칙

- main에 직접 커밋하지 않습니다. 작업 브랜치에서 PR을 올리고 작성자 외 팀원 1명 이상 승인 후 병합합니다.
- 표가 있는 도메인 단계 문서는 블록별 정리 담당자가 수정합니다. 다른 팀원은 근거 카드·PR 댓글을 이용합니다.
- 기능·스토리 번호는 백로그를 따르고 같은 기준을 여러 문서에 중복해서 쓰지 않습니다.
- 실제 비밀값은 커밋하지 않습니다. `.env.example`에는 키·DB 비밀번호를 비워 두고 `NEXT_PUBLIC_`로 노출하지 않습니다.

# MAMA 백엔드 — JWT 인증·F-04

기술 선택·구현 범위 기록: [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md)

API 명세: [OpenAPI 3.1 JSON](docs/openapi.json). 실행 중인 FastAPI 서버의 `/openapi.json` 응답을 수정 없이 저장한 파일입니다. 로컬 서버의 [Swagger UI](http://localhost:8000/docs)에서도 확인할 수 있습니다.

서버 실행 후 `backend/`에서 다음 명령으로 명세를 갱신합니다.

```bash
curl --fail --silent --show-error http://127.0.0.1:8000/openapi.json -o docs/openapi.json
```

현재 백엔드는 SQLAlchemy 동기 Session을 사용하며 **DB 접속 정보는 `DATABASE_URL` 하나로 전달**합니다. PostgreSQL/Supabase는 psycopg를 사용합니다. MySQL은 기존 환경 호환용으로만 지원하며, MySQL 설치나 `MYSQL_*` 환경변수는 필요하지 않습니다.

### 처음 실행

Python 3.13·uv와 접속 가능한 PostgreSQL DB가 필요합니다. `backend/`에서 환경변수를 전달한 뒤 실행합니다. `.env`는 선택 사항이며 프로세스 환경변수가 우선합니다.

```bash
export DATABASE_URL='postgresql://user:password@host:6543/postgres?sslmode=require'
export JWT_SECRET='replace-with-a-random-secret-at-least-32-bytes'
# HTTPS 배포 환경에서는 true로 지정
export COOKIE_SECURE=false

uv sync --locked
uv run alembic upgrade head
uv run fastapi dev main.py --port 8000
```

배포 플랫폼에서는 같은 변수를 환경변수 설정에 등록합니다. JWT 키는 `python3 -c 'import secrets; print(secrets.token_hex(48))'`로 생성할 수 있습니다. 환경변수 변경 후 서버를 재시작하세요. 기존 MySQL 데이터가 PostgreSQL로 자동 이전되지는 않습니다. 마이그레이션은 지정한 DB에 테이블을 생성합니다.

| 환경변수 | 용도 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 접속 URL. `postgresql://`, `postgres://`, `postgresql+psycopg://` 지원 |
| `JWT_SECRET` | 로그인 토큰 서명 키, 32바이트 이상 |
| `JWT_ISSUER`, `JWT_AUDIENCE` | 기본값 모두 `mama-api` |
| `COOKIE_SECURE` | 로컬 HTTP `false`, HTTPS 환경 `true` |
| `ALLOWED_ORIGINS` | 토큰 재발급에 허용할 Origin을 쉼표로 구분 |
| `TEST_DATABASE_URL` | 개발 DB와 다른 전용 테스트 DB. 이름은 `_test`로 끝나야 함 |
| `LLM_API_KEY`, `LLM_MODEL` | 비어 있으면 초안 생성·검수·성과 요약 요청은 `503` 반환 |
| `LLM_BASE_URL` | 기본 `https://api.openai.com/v1` |

Supabase Transaction pooler에는 `NullPool`과 `prepare_threshold=None`을 적용합니다. URL의 포트·사용자·`sslmode`는 공급자가 제공한 값을 사용하세요. 비밀번호의 URL 예약 문자는 percent encoding이 필요합니다. 기존 MySQL URL `mysql+pymysql://...`도 사용할 수 있습니다.

`GET /api/health`는 서버 상태를, `GET /api/health/db`는 실제 DB 연결을 확인합니다. 연결 성공 응답은 `{"db": 1}`이며 실패 시 접속 정보를 노출하지 않고 `503`을 반환합니다.

로컬 `.env`가 필요하면 `.env.example`을 복사해 채우거나 `python3 scripts/init_backend_env.py`로 JWT 키만 생성할 수 있습니다. 기존 파일은 덮어쓰지 않습니다.

### 인증 API

`http://localhost:8000/docs`에서 다음 순서로 진행합니다.

1. `POST /api/v1/auth/register`: `{ "email": "seller@example.com", "password": "example-password-123" }`로 가입합니다. 가입은 자동 로그인하지 않습니다.
2. `POST /api/v1/auth/login`: 같은 JSON으로 로그인합니다. `access_token`, `token_type: "bearer"`, `expires_in: 900`을 반환하고 HttpOnly Refresh 쿠키를 설정합니다.
3. Swagger의 **Authorize**에 Access Token 문자열만 입력합니다. 보호 API는 `Authorization: Bearer <token>`으로 호출합니다.
4. `GET /api/v1/auth/me`에서 인증을 확인합니다.
5. `POST /api/v1/auth/refresh`의 `X-CSRF-Protection` 필드에 `1`을 넣어 재발급합니다. 브라우저가 Refresh 쿠키를 보내며, 두 토큰이 교체됩니다. 새 Access Token은 Authorize에도 다시 입력합니다.
6. `POST /api/v1/auth/logout`으로 현재 로그인 세션을 폐기합니다. 그 세션의 기존 Access Token도 즉시 거절됩니다.

Access Token은 15분, Refresh 세션은 로그인부터 7일입니다. 재발급해도 세션 만료는 연장되지 않습니다. 이전 Refresh Token을 재사용하면 해당 로그인 세션 전체를 폐기합니다. 재발급은 클라이언트에서 한 번에 하나씩 요청해야 합니다. Refresh Token은 응답 JSON·브라우저 JavaScript에 노출하지 않습니다. 브라우저 Origin이 전달되면 `ALLOWED_ORIGINS`와 비교하며 CORS는 기본 비활성화입니다. 별도 `/verify` 대신 `/me`가 인증 검증 API입니다.

### 캠페인 API

컬렉션 URL은 **끝 슬래시 없는 `/api/v1/campaigns`**입니다. 모든 API는 인증을 요구하며 소유자만 접근할 수 있습니다. 다른 사용자의 캠페인도 존재하지 않는 ID와 동일하게 404입니다.

| 메서드·경로 (기본 경로 뒤에 연결) | 요청·동작 |
| --- | --- |
| `POST` 컬렉션 | `{ "content": "오늘 구운 빵 🍞", "initial_budget_amount": 100000, "initial_budget_days": 7 }`, 201 기획중 생성 |
| `GET` 컬렉션 | 자신의 목록. `limit=20`(1~100), `offset=0`. 생성 시각·ID 내림차순 |
| `GET /{id}` | 상세·허용 동작·현재 반려 사유 |
| `PATCH /{id}` | 변경할 기획 정보·문구·채널 초안·예산만 전송. 기획중·초안 생성됨·수정 요청에서 가능 |
| `POST /{id}/generate-draft` | 기획중 → 초안 생성됨. 같은 셀러의 최근 평가 완료 캠페인이 있으면 `reference_campaign_id` 반환 |
| `POST /{id}/request-review` | 본문 생략 또는 `{"drafts":{"instagram":{"caption":"오늘 구운 빵","hashtags":["#빵"]}}}`. 검수 통과 시 승인 가능, 위험 발견 시 수정 요청 |
| `POST /{id}/approve` | 본문 없음. 검수 대기에서 현재 문구가 검수를 통과한 경우에만 승인됨으로 전환 |
| `POST /{id}/schedule` | `{ "scheduled_at": "2030-01-01T09:00:00+09:00" }`, 승인됨 → 게시 예약됨 |
| `POST /{id}/publish` | 본문 생략 또는 `{ "published_at": "실제 게시 시각 ISO 8601" }`, 게시 예약됨 → 집행중 |
| `POST /{id}/end` | 본문 생략 또는 `{ "ended_at": "실제 종료 시각 ISO 8601" }`, 집행중 → 종료 |
| `POST /{id}/reject` | `{ "reason": "플랫폼에서 표현 수정을 요청했습니다" }`, 게시 예약됨 → 플랫폼 반려 |
| `POST /{id}/request-revision` | 본문 없음. 플랫폼 반려 → 수정 요청 |
| `POST /{id}/cancel` | 기획중·초안 생성됨·게시 예약됨 → 취소. 취소 후 변경 불가 |
| `PUT /{id}/performance` | 종료 상태에서 `impressions`, `clicks`, `conversions`, `ad_spend`, `revenue`를 모두 전달. 서버가 ROAS를 계산하고 요약 생성 |
| `GET /{id}/performance` | 저장한 성과 입력, ROAS, 요약·제안과 처리 상태 조회 |
| `POST /{id}/performance/complete` | 본문 없음. 현재 입력의 요약이 준비되면 성과 평가 완료로 전환 |
| `GET /{id}/history` | 변경 계정·기록 시각·이전/다음 상태·당시 일정과 예산·반려 사유를 시간·ID 오름차순으로 조회 |

정상 흐름은 `생성 → 초안 생성 → 검수 요청 → 승인 → 예약 → 게시 → 종료 → 성과 입력 → 평가 완료`입니다. 플랫폼 반려 후에는 `다시 고치기 → 수정 → 검수 요청 → 승인 → 재예약` 순서로 진행합니다. `publish`와 `end`에 본문을 생략하면 서버 현재 시각을 기록합니다. 예약 시간 예시가 실행 시점보다 과거라면 미래 날짜로 바꿉니다.

- 기존 문자열 전용 캠페인은 `content`로 기획중에서 바로 검수를 요청할 수 있습니다. 채널을 선택한 캠페인은 먼저 초안을 생성하고, `content`는 첫 채널의 캡션을 반영합니다. 이미 승인된 캠페인은 기존 상태에서 계속 진행할 수 있습니다.
- 상세 응답의 `review.status`는 `pending`, `failed`, `passed`, `changes_requested` 중 하나입니다. 원문 위치는 채널별로 캡션과 해시태그를 줄바꿈으로 연결한 문자열의 유니코드 코드 포인트 기준이며, 끝 인덱스는 포함하지 않습니다. 문자열 전용 캠페인의 채널 표시는 `legacy`입니다. 실패 또는 연결 중단 시 본문 없이 같은 경로를 재시도할 수 있습니다.
- 성과 입력은 0 이상 정수이며 광고비가 0이면 `roas`는 `null`입니다. 요약 오류 뒤에도 입력과 ROAS는 조회할 수 있고 같은 `PUT`으로 재시도합니다. 응답 상태가 `ready`일 때 평가를 완료할 수 있습니다.
- 예산은 양수 정수 원, 기간은 양수 정수 일수입니다.
- 예약의 `budget_amount`, `budget_days`는 생략하면 최초 예산·기간을 사용합니다. 과거 예약은 422이며, 현재부터 정확히 24시간을 포함한 24시간 이내는 `warnings`에 안내만 남기고 저장합니다.
- 입력 시각은 시간대가 있는 ISO 8601 문자열이며 응답은 UTC `Z`입니다. 미래 게시·종료와 게시보다 이른 종료는 422입니다. 실제 발생 시각과 사용자가 기록한 서버 시각은 구분합니다.
- 승인 후 광고 수정, 상태 순서 건너뛰기·중복 전이는 409입니다. `allowed_actions`는 서버가 판단합니다. 예약 시간이 지나거나 기간이 끝나도 자동으로 상태를 바꾸지 않습니다.
- 다시 고치기에서는 현재 예약 정보를 비웁니다. 기존 예약·반려 사유는 이력에 보존하고 수정 화면용 `rejection_reason`도 응답합니다. 재예약 기본 예산은 최초 입력값입니다.
- 상태 변경과 이력 저장은 같은 트랜잭션입니다. 동일 캠페인의 변경은 행 잠금으로 직렬화하며, 충돌 시 현재 상태를 기준으로 거절합니다.

### DB 통합 테스트

개발 DB와 다른 전용 PostgreSQL 테스트 DB를 준비하고 URL을 지정합니다. 테스트 계정에는 마이그레이션과 테이블 정리 권한이 필요합니다.

```bash
export TEST_DATABASE_URL='postgresql://user:password@host:5432/mama_test'
uv run pytest
uv run alembic check
```

`alembic check`는 `DATABASE_URL`의 스키마를 확인합니다. 테스트는 `TEST_DATABASE_URL`에 마이그레이션을 적용하고 각 테스트 전후 업무 테이블을 비웁니다. 이름이 `_test`로 끝나지 않거나 개발 DB와 동일한 접속 대상은 거절합니다. 테스트 URL이 없으면 DB 통합 테스트는 건너뜁니다. SQLite로 잠금을 대신하지 않습니다.

기존 MySQL 전용 테스트 환경도 사용할 수 있습니다. `compose.yaml`은 해당 로컬 DB를 선택적으로 띄우는 용도이며 서버 실행의 필수 단계가 아닙니다. 이 경우에만 Compose의 `MYSQL_ROOT_PASSWORD`, `MYSQL_PASSWORD`를 별도로 지정합니다.

의존성을 바꾸면 `uv.lock`과 백엔드 배포용 `requirements.txt`을 함께 갱신합니다.

```bash
uv export --frozen --format requirements-txt --no-hashes --no-emit-project --no-dev -o requirements.txt
```

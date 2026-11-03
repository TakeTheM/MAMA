# MAMA 백엔드 — JWT 인증·F-04

기술 선택·구현 범위 기록: [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md)

API 명세: [OpenAPI 3.1 JSON](docs/openapi.json). 실행 중인 FastAPI 서버의 `/openapi.json` 응답을 수정 없이 저장한 파일입니다. 로컬 서버의 [Swagger UI](http://localhost:8000/docs)에서도 확인할 수 있습니다.

서버 실행 후 `backend/`에서 다음 명령으로 명세를 갱신합니다.

```bash
curl --fail --silent --show-error http://127.0.0.1:8000/openapi.json -o docs/openapi.json
```

현재 백엔드는 SQLAlchemy 동기 Session + PyMySQL + MySQL 8.4, Alembic을 사용합니다. 프론트엔드는 health 화면 그대로이며, API는 Swagger에서 테스트합니다. **수동 승인은 AI 검수를 생략한 임시 진입 경로입니다.** 플랫폼 게시·집행은 사용자가 직접 하고 이 서비스에는 기록만 남깁니다.

### 처음 실행

Python 3.13·uv·Docker Desktop이 필요합니다. `backend/` 디렉터리에서 실행합니다.

```bash
uv sync --locked
python3 scripts/init_backend_env.py
docker compose --env-file .env up -d --wait mysql
uv run alembic upgrade head
uv run fastapi dev main.py --port 8000
```

설정 생성 명령은 무작위 JWT 키와 개발 DB 비밀번호를 `.env`에 기록하고, 기존 파일은 덮어쓰지 않습니다. `.env.example`을 복사해 빈 `.env`를 만들었다면 아래 표에 따라 직접 채웁니다. 실제 비밀값은 커밋하지 않습니다.

| 환경변수 | 용도 |
| --- | --- |
| `DATABASE_URL` | `mysql+pymysql://mama:<MYSQL_PASSWORD>@127.0.0.1:3307/mama` |
| `MYSQL_ROOT_PASSWORD`, `MYSQL_PASSWORD` | Compose 개발 DB 초기 비밀번호 |
| `JWT_SECRET` | 32바이트 이상 서명 키. 예: `python3 -c 'import secrets; print(secrets.token_hex(48))'` |
| `JWT_ISSUER`, `JWT_AUDIENCE` | 기본값 모두 `mama-api` |
| `COOKIE_SECURE` | 로컬 HTTP `false`, HTTPS 환경 `true` |
| `ALLOWED_ORIGINS` | 재발급에 허용할 Origin을 쉼표로 구분. 포트도 일치해야 함 |
| `MYSQL_PORT` | 개발 DB 호스트 포트. 기본 3307, 변경하면 `DATABASE_URL`도 변경 |
| `TEST_DATABASE_URL` | 개발 DB와 다른 전용 테스트 DB. 아래 테스트 절 참고 |

비밀번호에 URL 예약 문자가 있으면 접속 문자열에서는 percent encoding이 필요합니다. 기존 MySQL을 쓰는 경우 Compose를 띄우지 않고 별도 개발 DB를 만든 뒤 `DATABASE_URL`을 지정합니다. Compose 비밀번호는 볼륨 최초 생성에만 적용되므로 기존 볼륨을 둔 채 환경변수만 바꾸면 DB 계정 비밀번호가 바뀌지 않습니다.

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
| `PATCH /{id}` | 광고 문자열·최초 예산·기간 중 변경할 필드만 전송. 기획중·수정 요청에서만 가능 |
| `POST /{id}/approve` | 본문 없음. 기획중·수정 요청 → 승인됨 (임시 수동 승인) |
| `POST /{id}/schedule` | `{ "scheduled_at": "2030-01-01T09:00:00+09:00" }`, 승인됨 → 게시 예약됨 |
| `POST /{id}/publish` | 본문 생략 또는 `{ "published_at": "실제 게시 시각 ISO 8601" }`, 게시 예약됨 → 집행중 |
| `POST /{id}/end` | 본문 생략 또는 `{ "ended_at": "실제 종료 시각 ISO 8601" }`, 집행중 → 종료 |
| `POST /{id}/reject` | `{ "reason": "플랫폼에서 표현 수정을 요청했습니다" }`, 게시 예약됨 → 플랫폼 반려 |
| `POST /{id}/request-revision` | 본문 없음. 플랫폼 반려 → 수정 요청 |
| `GET /{id}/history` | 변경 계정·기록 시각·이전/다음 상태·당시 일정과 예산·반려 사유를 시간·ID 오름차순으로 조회 |

정상 흐름은 `생성 → 승인 → 예약 → 게시 → 종료`, 반려 흐름은 `예약 → 반려 → 다시 고치기 → PATCH 수정 → 재승인 → 재예약`입니다. `publish`와 `end`에 본문을 생략하면 서버 현재 시각을 기록합니다. 예약 시간 예시가 실행 시점보다 과거라면 미래 날짜로 바꿉니다.

- 광고 내용은 문자열 하나(공백만 불가, 최대 10,000자)이며 채널별로 나누지 않습니다. 예산은 양수 정수 원, 기간은 양수 정수 일수입니다.
- 예약의 `budget_amount`, `budget_days`는 생략하면 최초 예산·기간을 사용합니다. 과거 예약은 422이며, 현재부터 정확히 24시간을 포함한 24시간 이내는 `warnings`에 안내만 남기고 저장합니다.
- 입력 시각은 시간대가 있는 ISO 8601 문자열이며 응답은 UTC `Z`입니다. 미래 게시·종료와 게시보다 이른 종료는 422입니다. 실제 발생 시각과 사용자가 기록한 서버 시각은 구분합니다.
- 승인 후 광고 수정, 상태 순서 건너뛰기·중복 전이는 409입니다. `allowed_actions`는 서버가 판단합니다. 예약 시간이 지나거나 기간이 끝나도 자동으로 상태를 바꾸지 않습니다.
- 다시 고치기에서는 현재 예약 정보를 비웁니다. 기존 예약·반려 사유는 이력에 보존하고 수정 화면용 `rejection_reason`도 응답합니다. 재예약 기본 예산은 최초 입력값입니다.
- 상태 변경과 이력 저장은 같은 트랜잭션입니다. 동일 캠페인의 변경은 행 잠금으로 직렬화하며, 충돌 시 현재 상태를 기준으로 거절합니다.

### MySQL 통합 테스트

환경 생성 명령은 다음 전용 테스트 URL도 설정합니다. 직접 설정할 때는 개발 DB를 사용하지 않습니다.

```text
TEST_DATABASE_URL=mysql+pymysql://mama_test:local-test-only@127.0.0.1:3308/mama_test
```

`backend/` 디렉터리에서 실행합니다.

```bash
docker compose --env-file .env --profile test up -d --wait mysql-test
uv run pytest
uv run alembic check
```

테스트는 테스트 DB에 마이그레이션을 적용하고 각 테스트 전후 업무 테이블을 비웁니다. 이름이 `_test`로 끝나지 않거나 개발 DB와 동일한 접속 대상은 거절합니다. `TEST_DATABASE_URL`이 없으면 DB 테스트는 skip하고 health 테스트만 실행합니다. SQLite로 잠금을 대신하지 않습니다.

의존성을 바꾸면 `uv.lock`과 백엔드 배포용 `requirements.txt`을 함께 갱신합니다.

```bash
uv export --frozen --format requirements-txt --no-hashes --no-emit-project --no-dev -o requirements.txt
```

# MAMA 백엔드 — MVP F-01~F-05

FastAPI + SQLAlchemy 동기 Session + MySQL 8.4로 광고 기획·초안·검수·승인·게시 기록·성과 평가를 관리합니다. 프론트엔드와 외부 광고 플랫폼 연동은 포함하지 않습니다.

API 명세는 [OpenAPI JSON](docs/openapi.json)이며, 서버 실행 후 [Swagger UI](http://localhost:8000/docs)에서 호출할 수 있습니다. 기술 변경 기록은 [IMPLEMENTATION.md](docs/IMPLEMENTATION.md), 기능별 상세는 [F-01](docs/F01.md)·[F-02](docs/F02.md)·[F-03](docs/F03.md)·[F-05](docs/F05.md)를 참고합니다.

## 설치·실행

Python 3.13, uv, Docker Desktop을 준비하고 `backend/`에서 실행합니다.

```bash
uv sync --locked
python3 scripts/init_backend_env.py
docker compose --env-file .env --profile test up -d --wait mysql mysql-test
uv run alembic upgrade head
uv run fastapi dev main.py --port 8000
```

환경 생성 명령은 무작위 로컬 DB 비밀번호와 JWT 키를 `.env`에 만들며 기존 파일을 덮어쓰지 않습니다. 기존 설정에는 아래 LLM 변수를 직접 추가합니다. 실제 키는 커밋하지 않습니다.

```dotenv
LLM_API_KEY=
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=
LLM_TIMEOUT=60
```

`LLM_MODEL`은 학교 계정에서 사용 가능한 모델명으로 설정합니다. 운영용 가짜 응답이나 자동 대체 모델은 없습니다. 키·모델 설정 누락은 503, 외부 응답 오류는 502, 시간 초과는 504입니다. 시간 제한은 0초 초과 120초 이하입니다. 다른 OpenAI 호환 제공사를 쓰면 `LLM_BASE_URL`을 v1 기본 주소로 바꿉니다. JSON mode를 지원해야 합니다.

| 환경변수 | 용도 |
| --- | --- |
| `DATABASE_URL` | `mysql+pymysql://mama:<MYSQL_PASSWORD>@127.0.0.1:3307/mama` |
| `MYSQL_ROOT_PASSWORD`, `MYSQL_PASSWORD` | Compose 개발 DB 초기 비밀번호 |
| `MYSQL_PORT` | 개발 DB 호스트 포트, 기본 3307. 변경하면 접속 URL도 변경 |
| `JWT_SECRET` | 32바이트 이상 서명 키 |
| `JWT_ISSUER`, `JWT_AUDIENCE` | 기본값 모두 `mama-api` |
| `COOKIE_SECURE` | 로컬 HTTP false, HTTPS true |
| `ALLOWED_ORIGINS` | Refresh 재발급에 허용할 Origin을 쉼표로 구분 |
| `TEST_DATABASE_URL` | 개발 DB와 다른 전용 MySQL 테스트 DB, 이름은 `_test`로 끝나야 함 |

기존 MySQL도 개발용 DB를 만든 뒤 `DATABASE_URL`로 연결할 수 있습니다. URL의 비밀번호에 예약 문자가 있으면 percent encoding이 필요합니다. Compose 비밀번호는 볼륨 최초 생성에만 적용됩니다. 마이그레이션 0002~0005는 기존 캠페인에 상품 입력·초안·검수·성과 데이터를 추가하며 기존 광고·상태·예산을 보존합니다.

## 인증

| 메서드·경로 | 동작 |
| --- | --- |
| `POST /api/v1/auth/register` | `{ "email": "seller@example.com", "password": "example-password-123" }`로 가입 |
| `POST /api/v1/auth/login` | 같은 입력으로 Access JWT 반환 및 Refresh 쿠키 설정 |
| `GET /api/v1/auth/me` | 현재 사용자 조회·Access Token 검증 |
| `POST /api/v1/auth/refresh` | `X-CSRF-Protection: 1`과 Refresh 쿠키로 두 토큰 교체 |
| `POST /api/v1/auth/logout` | Bearer 인증으로 현재 세션 폐기·쿠키 삭제 |

가입은 자동 로그인하지 않습니다. 로그인 응답의 `access_token` 문자열을 Swagger의 Authorize에 넣습니다. 일반 호출 헤더는 `Authorization: Bearer <access_token>`입니다. Access Token은 15분, Refresh 세션은 로그인부터 7일입니다. 재발급 후 새 Access Token을 사용해야 하며 세션의 최종 만료는 연장되지 않습니다.

Refresh는 HttpOnly·SameSite=Lax·Path=/api/v1/auth·Domain 미지정 쿠키입니다. 재발급은 클라이언트에서 한 번에 하나씩 요청합니다. 이전 Refresh Token 재사용 시 해당 세션 전체를 폐기합니다. 브라우저 Origin이 있으면 허용 목록과 비교하고 CORS는 기본 비활성화입니다. 로그아웃한 세션의 기존 Access Token도 거절합니다.

## 캠페인 등록·초안·검수

컬렉션 경로는 끝 슬래시 없는 `/api/v1/campaigns`입니다. 모든 캠페인 API는 소유자만 접근하며 다른 셀러의 캠페인도 없는 ID와 동일하게 404입니다.

등록 예시:

```json
{
  "product_name": "동네 빵",
  "product_description": "매일 아침 굽는 빵",
  "product_category": "식품",
  "product_price": 3000,
  "goal": "매장 방문 늘리기",
  "target_audience": "동네 주민",
  "channels": ["instagram", "x"],
  "initial_budget_amount": 100000,
  "initial_budget_days": 7
}
```

| 메서드·하위 경로 | 동작 |
| --- | --- |
| `POST` 컬렉션 | 기획중 캠페인 생성. 기존 `content` 문자열 등록도 가능 |
| `GET` 컬렉션 | 자신의 목록. limit 기본 20·최대 100, offset 기본 0, 생성 시각·ID 내림차순 |
| `GET /{id}` | 상세·허용 동작·승인 가능 여부·검수 결과·참고 캠페인 ID |
| `PATCH /{id}` | 기획중·초안 생성됨·수정 요청에서 상품·예산·광고 수정 |
| `POST /{id}/generate-draft` | 저장된 상품·목표·채널·예산으로 채널별 캡션·해시태그 생성 |
| `POST /{id}/request-review` | 저장된 초안 검수 또는 `{ "drafts": {...} }`로 문구 수정 후 검수 |
| `GET /{id}/review` | 검수 결과 조회 |
| `GET /review-sources` | 공개 근거 허용 목록·팀 위험 표현 규칙·경고 정책 조회 |
| `POST /{id}/apply-suggestion` | `{ "finding_index": 0 }`으로 수정안 한 개 적용. 적용 후 재검수 필요 |
| `POST /{id}/request-revision` | 검수 후 사용자가 수정 선택 또는 플랫폼 반려 후 다시 고치기 |
| `POST /{id}/approve` | 현재 문구의 검수에 성공한 뒤 사용자 승인 |
| `POST /{id}/cancel` | 게시 전 취소, 취소 상태에서는 변경 불가 |
| `GET /{id}/history` | 이전·다음 상태·계정·시각·예약·검수 관련 이력을 시간·ID 오름차순으로 조회 |

`drafts`는 채널 이름을 키로 하는 객체이며 각 값은 `{ "caption": "광고 문자열", "hashtags": ["#광고"] }`입니다. 채널은 instagram·x·tiktok을 지원합니다. `content`는 첫 선택 채널의 캡션 문자열로 유지합니다. PATCH의 `content`는 모든 채널 캡션에 반영하며 `drafts`와 동시에 보낼 수 없습니다. 초안 생성 후 채널 변경은 막습니다.

**사용자 결정: 위험 표현은 경고만 표시하며 사용자가 승인할 수 있습니다.** 자동 승인·자동 수정은 없습니다. 사용자가 수정을 선택하거나 수정안을 적용하면 수정 요청으로 전환합니다. 현재 revision의 검수에 성공해야 `can_approve`가 켜지며, 실패·실행 중·수정 후 오래된 결과로는 승인할 수 없습니다. 기획중에서 바로 승인하는 임시 경로는 제거했습니다.

검수는 LLM 결과와 팀 위험 표현 규칙을 함께 확인합니다. 원문 위치가 틀린 결과는 실패 처리하고 허용 목록 밖 링크는 제거합니다. 검수 실패 시 문구를 보존하고 검수 대기에서 재시도합니다. 서버 중단 등으로 실행 중 상태가 남으면 180초 후 재시도할 수 있습니다.

## 게시·집행 기록 (F-04)

| 메서드·하위 경로 | 동작 |
| --- | --- |
| `POST /{id}/schedule` | 승인됨 → 게시 예약됨. scheduled_at 필수, budget_amount·budget_days 생략 시 최초 예산 사용 |
| `POST /{id}/publish` | 게시 예약됨 → 집행중. published_at 생략 시 서버 현재 시각 |
| `POST /{id}/end` | 집행중 → 종료. ended_at 생략 시 서버 현재 시각 |
| `POST /{id}/reject` | 게시 예약됨 → 플랫폼 반려. 공백 아닌 reason 필수 |

예산은 양수 정수 원, 기간은 양수 정수 일수이며 캠페인 공통입니다. 과거 예약은 거절하고 저장 시점부터 정확히 24시간을 포함한 24시간 이내는 경고만 반환합니다. 입력 시각은 시간대가 있는 ISO 8601 문자열, 응답은 UTC Z입니다. 미래 게시·종료와 게시보다 이른 종료는 거절합니다.

플랫폼 API를 호출하지 않으며 시간이 지나도 자동 게시·종료하지 않습니다. 반려 후 다시 고치기는 현재 예약을 비우고 이전 일정·예산·사유를 이력에 보존합니다. 재승인에는 실제 재검수가 필요합니다.

기존 F-04에서 문자열만 저장했던 캠페인은 반려 후 수정 요청 상태에서 PATCH로 `channels`를 처음 지정하면 기존 문구를 채널 초안으로 옮겨 실제 검수·재승인 흐름에 진입할 수 있습니다.

## 성과 평가·피드백 (F-05)

| 메서드·하위 경로 | 동작 |
| --- | --- |
| `PUT /{id}/performance` | 종료 캠페인의 impressions·clicks·conversions·ad_spend·revenue 저장, ROAS 계산 후 AI 요약 |
| `GET /{id}/performance` | 숫자·ROAS·요약·제안·오류·확정 시각 조회 |
| `POST /{id}/summarize-performance` | 저장된 숫자로 요약 재시도 |
| `POST /{id}/complete-evaluation` | 요약 확인 후 성과 평가 완료 확정 |

지표는 모두 0 이상의 정수입니다. ROAS는 서버가 매출 ÷ 광고비를 계산해 소수 6자리 Decimal 문자열로 반환합니다. 광고비가 0이면 null과 ‘계산할 수 없음’을 반환합니다. LLM 숫자로 시스템 지표를 덮어쓰지 않습니다.

요약 실패 응답이 나와도 숫자와 ROAS는 저장되어 GET으로 확인할 수 있습니다. 요약이 없으면 평가 완료할 수 없습니다. 요약만 생성하면 여전히 종료이며 사용자가 확인해야 평가 완료됩니다. 평가 완료 후에는 지표 변경·재요약을 막습니다.

같은 셀러의 가장 최근 평가 완료 캠페인 문구·성과·요약을 다음 초안에 참고하고 `reference_campaign_id`를 반환합니다. 다른 셀러나 아직 확정하지 않은 성과는 참고하지 않습니다. LLM 입력은 기능별 허용 필드로만 구성해 인증·고객 정보·원가를 제외합니다.

## 상태·오류·동시성

정상 경로는 `기획중 → 초안 생성됨 → 검수 대기 → 승인됨 → 게시 예약됨 → 집행중 → 종료 → 성과 평가 완료`입니다. 수정 요청·플랫폼 반려·취소 분기를 지원합니다. 일시정지·실제 이익·자동 집행·자동 지표 수집·이미지 제작은 제외합니다.

- 401: 인증 누락·토큰 오류·만료·폐기된 세션
- 403: 재발급 CSRF 헤더·Origin 오류
- 404: 리소스 없음 또는 다른 소유자
- 409: 상태·revision 충돌, 중복 진행, 승인 조건 불충족
- 422: 입력 형식·시간·금액·필수 데이터 오류
- 502·503·504: LLM 응답·설정·시간 초과 오류

상태 변경과 이력은 같은 트랜잭션으로 저장합니다. 외부 LLM 호출 중에는 DB 잠금을 잡지 않으며 결과 저장 시 상태·revision을 재확인합니다. 취소·수정·새 지표 저장 뒤 도착한 이전 결과는 버립니다.

## 테스트·명세 갱신

```bash
uv run pytest
uv run alembic check
curl --fail --silent --show-error http://127.0.0.1:8000/openapi.json -o docs/openapi.json
uv export --frozen --format requirements-txt --no-hashes --no-emit-project --no-dev -o requirements.txt
```

테스트 전용 URL 기본값은 `mysql+pymysql://mama_test:local-test-only@127.0.0.1:3308/mama_test`입니다. 테스트 DB는 `_test` 이름과 개발 DB 분리 여부를 검사하며 각 테스트 전후 테이블을 정리합니다. TEST_DATABASE_URL이 없으면 DB 테스트를 skip합니다. SQLite로 잠금을 대체하지 않습니다.

LLM 테스트는 결정 가능한 대역과 HTTP MockTransport를 사용하며 실제 계정의 API 키를 사용하지 않습니다. 실제 모델 연결 검증은 키·모델 설정 후 별도로 필요합니다.

## 기능별 브랜치

기능 의존성 때문에 아래 순서로 분기한 누적 브랜치입니다. 각 브랜치는 이전 기능을 기준으로 해당 기능의 커밋을 추가합니다. 개별 리뷰 시 기준 브랜치를 이전 행으로 설정하면 기능 변경만 확인할 수 있습니다.

| 기능 | 브랜치 | 기준 브랜치 |
| --- | --- | --- |
| F-01 | feat/f01-draft-backend | main |
| F-02 | feat/f02-review-backend | feat/f01-draft-backend |
| F-03 | feat/f03-workflow-backend | feat/f02-review-backend |
| F-05 | feat/f05-performance-backend | feat/f03-workflow-backend |
| F-04 통합·전체 검증 | feat/f04-mvp-integration-backend | feat/f05-performance-backend |

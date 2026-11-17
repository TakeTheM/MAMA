/*
 * FastAPI 호출 공통 처리.
 * - 주소는 항상 /api/... (Next.js rewrites가 BACKEND_URL로 넘긴다).
 * - MVP에는 로그인이 없어서 인증 헤더를 붙이지 않는다.
 */

export type HttpErrorKind = "unauthorized" | "forbidden" | "not_found" | "conflict" | "validation" | "llm" | "network";

export class HttpError extends Error {
  constructor(
    public status: number,
    public kind: HttpErrorKind,
    message: string,
    /** 422 응답에서 꺼낸 필드별 메시지 (백엔드 필드 이름 기준) */
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

function kindOf(status: number): HttpErrorKind {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 422 || status === 400) return "validation";
  if (status === 502 || status === 503 || status === 504) return "llm";
  return "network";
}

type ValidationItem = { loc?: (string | number)[]; msg?: string; type?: string; input?: unknown; ctx?: Record<string, unknown> };

const has = (value: unknown) => value !== undefined && value !== null && value !== "";
const big = (value: unknown) => Number(value) >= 1e12;
const num = (value: unknown) => (typeof value === "number" ? value.toLocaleString("ko-KR") : String(value));

/**
 * FastAPI(Pydantic)의 영어 검증 메시지를 사장님이 읽을 한국어로 바꾼다.
 * 문장 대신 오류 종류(type)와 기준값(ctx)을 보고 만든다. 백엔드가 직접 쓴 한국어 메시지(value_error)는 그대로 쓴다.
 */
export function koreanValidationMessage(item: ValidationItem): string {
  const ctx = item.ctx ?? {};
  const empty = item.input === null || item.input === undefined || item.input === "";
  switch (item.type) {
    case "missing": return "입력해 주세요";
    case "int_type": case "int_parsing": case "float_type": case "float_parsing": case "decimal_parsing": case "decimal_type":
      return empty ? "입력해 주세요" : "숫자만 입력해 주세요";
    case "int_from_float": return "소수점 없이 숫자만 입력해 주세요";
    case "string_type": return empty ? "입력해 주세요" : "글자로 입력해 주세요";
    case "string_too_short": return has(ctx.min_length) && Number(ctx.min_length) > 1 ? `${num(ctx.min_length)}자 이상 입력해 주세요` : "입력해 주세요";
    case "string_too_long": return has(ctx.max_length) ? `${num(ctx.max_length)}자 이하로 줄여 주세요` : "글자 수를 줄여 주세요";
    case "too_short": return has(ctx.min_length) && Number(ctx.min_length) > 1 ? `${num(ctx.min_length)}개 이상 골라 주세요` : "1개 이상 골라 주세요";
    case "too_long": return has(ctx.max_length) ? `${num(ctx.max_length)}개 이하로 골라 주세요` : "개수를 줄여 주세요";
    case "greater_than_equal": return has(ctx.ge) ? `${num(ctx.ge)} 이상으로 입력해 주세요` : "더 큰 숫자를 입력해 주세요";
    case "greater_than": return has(ctx.gt) ? `${num(ctx.gt)}보다 큰 숫자를 입력해 주세요` : "더 큰 숫자를 입력해 주세요";
    case "less_than_equal": return !has(ctx.le) || big(ctx.le) ? "숫자가 너무 커요" : `${num(ctx.le)} 이하로 입력해 주세요`;
    case "less_than": return !has(ctx.lt) || big(ctx.lt) ? "숫자가 너무 커요" : `${num(ctx.lt)}보다 작은 숫자를 입력해 주세요`;
    case "literal_error": case "enum": return "목록에서 골라 주세요";
    case "datetime_type": case "datetime_parsing": case "datetime_from_date_parsing": case "date_parsing": case "timezone_aware":
      return "날짜와 시각을 확인해 주세요";
    case "url_parsing": case "url_type": return "주소 형식을 확인해 주세요";
    case "extra_forbidden": return "보낼 수 없는 항목이에요";
  }
  const message = (item.msg ?? "").replace(/^Value error, /, "").trim();
  // 백엔드가 직접 쓴 한국어 안내는 그대로 보여 주고, 영어 문장은 내보내지 않는다.
  return /[가-힣]/.test(message) ? message : "값을 확인해 주세요";
}
async function toError(response: Response): Promise<HttpError> {
  let detail: unknown;
  try { detail = (await response.json())?.detail; } catch { /* 본문 없음 */ }
  const kind = kindOf(response.status);
  if (Array.isArray(detail)) {
    const fields: Record<string, string> = {};
    for (const item of detail as ValidationItem[]) {
      const field = item.loc?.filter((part) => part !== "body").map(String).at(0);
      if (field && !fields[field]) fields[field] = koreanValidationMessage(item);
    }
    return new HttpError(response.status, kind, "입력한 값을 확인해 주세요.", fields);
  }
  // 연결은 됐지만 서버가 오류를 낸 경우(500 등)는 '연결 못 함'과 구분해서 알려 준다.
  const fallback = response.status === 401
    ? "백엔드가 로그인을 요구해서 데이터를 불러오지 못했어요 (401)."
    : response.status >= 500 ? `서버에서 오류가 났어요 (${response.status}). 잠시 뒤 다시 시도하거나 관리자에게 알려 주세요.` : "요청을 처리하지 못했어요.";
  const message = typeof detail === "string" && detail && response.status !== 401 ? detail : fallback;
  return new HttpError(response.status, kind, message);
}

export async function apiFetch<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: init.method ?? "GET",
      headers: { Accept: "application/json", ...(init.body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new HttpError(0, "network", "서버에 연결하지 못했어요. 백엔드가 켜져 있는지 확인해 주세요.");
  }
  if (!response.ok) throw await toError(response);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

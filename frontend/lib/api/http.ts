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

type ValidationItem = { loc?: (string | number)[]; msg?: string };
async function toError(response: Response): Promise<HttpError> {
  let detail: unknown;
  try { detail = (await response.json())?.detail; } catch { /* 본문 없음 */ }
  const kind = kindOf(response.status);
  if (Array.isArray(detail)) {
    const fields: Record<string, string> = {};
    for (const item of detail as ValidationItem[]) {
      const field = item.loc?.filter((part) => part !== "body").map(String).at(0);
      if (field && !fields[field]) fields[field] = (item.msg ?? "값을 확인해 주세요").replace(/^Value error, /, "");
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

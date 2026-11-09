/*
 * FastAPI 호출 공통 처리.
 * - 주소는 항상 /api/... (Next.js rewrites가 BACKEND_URL로 넘긴다).
 * - Access Token은 메모리에만 둔다. Refresh Token은 백엔드가 HttpOnly 쿠키로 관리한다.
 * - 401이면 한 번만 재발급(/api/v1/auth/refresh)을 시도하고 다시 요청한다.
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

const AUTH = "/api/v1/auth";
let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
const listeners = new Set<() => void>();

export function setAccessToken(token: string | null) { accessToken = token; }
export function hasAccessToken() { return accessToken !== null; }
/** 로그인이 풀렸을 때(재발급 실패) 알림 받기 */
export function onUnauthenticated(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
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
  const fallback = response.status >= 500 ? `서버에서 오류가 났어요 (${response.status}). 잠시 뒤 다시 시도하거나 관리자에게 알려 주세요.` : "요청을 처리하지 못했어요.";
  const message = typeof detail === "string" && detail ? detail : fallback;
  return new HttpError(response.status, kind, message);
}

/** Refresh 쿠키로 Access Token을 다시 받는다. 동시에 여러 번 부르면 한 번만 보낸다. */
export function refreshAccessToken(): Promise<boolean> {
  refreshing ??= fetch(`${AUTH}/refresh`, { method: "POST", credentials: "same-origin", headers: { "X-CSRF-Protection": "1" } })
    .then(async (response) => {
      if (!response.ok) { accessToken = null; currentUser = null; return false; }
      accessToken = (await response.json()).access_token;
      return true;
    })
    .catch(() => false)
    .finally(() => { refreshing = null; });
  return refreshing;
}

export async function apiFetch<T>(path: string, init: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const send = () => {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (init.body !== undefined) headers["Content-Type"] = "application/json";
    if (init.auth !== false && accessToken) headers.Authorization = `Bearer ${accessToken}`;
    return fetch(path, {
      method: init.method ?? "GET", headers, credentials: "same-origin",
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  };
  let response: Response;
  try {
    response = await send();
    if (response.status === 401 && init.auth !== false) {
      if (await refreshAccessToken()) response = await send();
      if (response.status === 401) listeners.forEach((listener) => listener());
    }
  } catch {
    throw new HttpError(0, "network", "서버에 연결하지 못했어요. 백엔드가 켜져 있는지 확인해 주세요.");
  }
  if (!response.ok) throw await toError(response);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export type Me = { id: number; email: string; created_at: string };

let currentUser: Me | null = null;
/** 이미 확인한 로그인 계정 (화면을 옮길 때마다 /me를 다시 부르지 않도록) */
export function cachedUser() { return accessToken ? currentUser : null; }

export const auth = {
  async login(email: string, password: string) {
    const token = await apiFetch<{ access_token: string }>(`${AUTH}/login`, { method: "POST", body: { email, password }, auth: false });
    accessToken = token.access_token;
  },
  register: (email: string, password: string) => apiFetch<Me>(`${AUTH}/register`, { method: "POST", body: { email, password }, auth: false }),
  async me() {
    currentUser = await apiFetch<Me>(`${AUTH}/me`);
    return currentUser;
  },
  async logout() {
    try { await apiFetch<void>(`${AUTH}/logout`, { method: "POST" }); } finally { accessToken = null; currentUser = null; }
  },
};

/*
 * 로그인 화면 주소와 '로그인 뒤 돌아올 경로(next)' 처리.
 * 백엔드도 next를 다시 거르지만(같은 사이트 경로만), 화면에서도 같은 기준으로 걸러서 넘긴다.
 */

export const LOGIN_PATH = "/login";

/** 같은 사이트 경로만 남긴다. /login, /api/..., 외부 주소(//host, https://...)는 / 로 바꾼다. */
export function safeNext(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  const path = value.split(/[?#]/)[0];
  if (path === LOGIN_PATH || path.startsWith(`${LOGIN_PATH}/`) || path === "/api" || path.startsWith("/api/")) return "/";
  return value;
}

export function loginPath(next?: string | null): string {
  const target = safeNext(next);
  return target === "/" ? LOGIN_PATH : `${LOGIN_PATH}?next=${encodeURIComponent(target)}`;
}

/** Google 로그인은 fetch가 아니라 페이지 이동으로 연다(백엔드가 Google 화면으로 보낸다). */
export function googleLoginUrl(next?: string | null): string {
  return `/api/v1/auth/google/login?next=${encodeURIComponent(safeNext(next))}`;
}

/** 실제 페이지 이동. 테스트에서는 go를 바꿔 끼워 이동 대신 주소만 확인한다. */
export const navigation = {
  redirecting: false,
  go(url: string) { window.location.assign(url); },
};
/** 동시에 도착한 401을 한 번으로 묶는 시간. 이 시간이 지나도 페이지가 남아 있으면 이동이 취소된 것으로 본다. */
export const REDIRECT_DEDUPE_MS = 1000;

/**
 * 로그인이 풀렸을 때 지금 보던 경로를 기억하고 로그인 화면으로 보낸다.
 * 여러 요청이 동시에 401을 받아도 한 번만 이동한다. 단, 사장님이 '저장 안 한 내용' 경고에서 머무르기를 고르면
 * 이동이 취소되고 페이지가 그대로 남으므로, 잠시 뒤 다시 이동할 수 있게 풀어 둔다(다음 401에서 다시 묻는다).
 */
export function redirectToLogin(): void {
  if (typeof window === "undefined" || navigation.redirecting) return;
  const { pathname, search } = window.location;
  if (pathname === LOGIN_PATH) return;
  navigation.redirecting = true;
  setTimeout(() => { navigation.redirecting = false; }, REDIRECT_DEDUPE_MS);
  navigation.go(loginPath(pathname + search));
}

/** 3번: 로그인 버튼을 누를 때 돌아갈 경로를 기억해 둔다. 백엔드가 오류로 돌려보낼 때 next를 빠뜨려도 다시 시도하면 원래 화면으로 간다. */
const NEXT_KEY = "mama.loginNext";
export function rememberNext(next: string): void {
  try { window.sessionStorage.setItem(NEXT_KEY, safeNext(next)); } catch { /* 저장소를 못 쓰면 / 로 돌아간다 */ }
}
export function recalledNext(): string | null {
  try { return window.sessionStorage.getItem(NEXT_KEY); } catch { return null; }
}

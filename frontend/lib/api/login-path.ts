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

/** 로그인이 풀렸을 때 지금 보던 경로를 기억하고 로그인 화면으로 보낸다. 여러 요청이 동시에 401을 받아도 한 번만 이동한다. */
export function redirectToLogin(): void {
  if (typeof window === "undefined" || navigation.redirecting) return;
  const { pathname, search } = window.location;
  if (pathname === LOGIN_PATH) return;
  navigation.redirecting = true;
  navigation.go(loginPath(pathname + search));
}

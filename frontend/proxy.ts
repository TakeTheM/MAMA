/*
 * 처음 들어올 때 로그인 확인.
 * 세션 쿠키(mama_session)가 없으면 화면을 그리기 전에 로그인 화면으로 보낸다. 지금 보려던 경로는 next로 넘긴다.
 * 쿠키가 있는지만 보는 빠른 확인이다. 만료·폐기된 세션은 백엔드가 401로 답하고 lib/api/http.ts가 로그인 화면으로 보낸다.
 * 쿠키는 Google 콜백이 /api rewrites를 거쳐 이 사이트 주소로 발급되므로 여기서 읽을 수 있다(값은 httpOnly라 화면 JS는 못 읽는다).
 */
import { NextResponse, type NextRequest } from "next/server";
import { LOGIN_PATH, loginPath } from "@/lib/api/login-path";

/** 백엔드 app/auth.py의 SESSION_COOKIE와 같은 이름 */
export const SESSION_COOKIE = "mama_session";

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === LOGIN_PATH || pathname.startsWith(`${LOGIN_PATH}/`)) return NextResponse.next();
  if (request.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next();
  return NextResponse.redirect(new URL(loginPath(pathname + search), request.url));
}

export const config = {
  // API(백엔드로 넘기는 요청)·Next 내부 파일·public의 정적 파일(확장자가 있는 주소)은 확인하지 않는다.
  matcher: ["/((?!api/|api$|_next/static|_next/image|favicon\\.ico|.*\\.[^/]+$).*)"],
};

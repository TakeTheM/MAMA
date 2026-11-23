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
  // API(백엔드로 넘기는 요청)·Next 내부 파일·public의 정적 파일은 확인하지 않는다.
  // 정적 파일은 아래 확장자로만 한정한다. '점이 있으면 모두 제외'로 두면 /campaigns/spring.sale 같은 페이지 경로까지
  // 로그인 확인을 건너뛴다. public에 다른 종류의 파일을 넣으면 이 목록에 확장자를 추가한다.
  matcher: ["/((?!api/|api$|_next/static|_next/image|.*\\.(?:svg|png|jpe?g|gif|webp|avif|ico|txt|xml|webmanifest)$).*)"],
};

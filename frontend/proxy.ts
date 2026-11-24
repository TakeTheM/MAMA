/*
 * 처음 들어올 때 로그인 확인.
 * Supabase 세션 쿠키(sb-...)를 읽어 로그인됐는지 확인하고, 만료가 가까우면 갱신한 쿠키를 응답에 실어 보낸다.
 * 로그인이 안 됐으면 화면을 그리기 전에 로그인 화면으로 보내고, 지금 보려던 경로는 next로 넘긴다.
 * 여기서는 화면 이동만 막는다. API 권한은 FastAPI가 Authorization 헤더의 토큰을 검증해 판단한다.
 */
import { NextResponse, type NextRequest } from "next/server";
import { AUTH_CALLBACK_PATH, LOGIN_PATH, loginPath } from "@/lib/api/login-path";
import { serverSupabase } from "@/lib/supabase/server";

/** 로그인 없이 열리는 경로: 로그인 화면, Google 로그인 뒤 돌아오는 주소 */
const isPublic = (pathname: string) =>
  [LOGIN_PATH, AUTH_CALLBACK_PATH].some((path) => pathname === path || pathname.startsWith(`${path}/`));

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = serverSupabase({
    getAll: () => request.cookies.getAll(),
    setAll: (list, headers) => {
      // 갱신한 세션을 이번 렌더링(request)과 브라우저(response) 양쪽에 반영한다.
      list.forEach(({ name, value }) => request.cookies.set(name, value));
      response = NextResponse.next({ request });
      list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
    },
  });
  // Supabase 설정이 빠졌으면 로그인 화면에서 설정 오류를 보여 준다.
  if (!supabase) return NextResponse.redirect(new URL(loginPath(pathname + search, "config"), request.url));

  // getClaims는 토큰 서명을 확인한다(getSession처럼 쿠키 값을 그대로 믿지 않는다).
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) return response;

  const redirect = NextResponse.redirect(new URL(loginPath(pathname + search), request.url));
  // 만료된 세션 쿠키를 지우라는 응답 쿠키가 있으면 함께 보낸다.
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

export const config = {
  // API(백엔드로 넘기는 요청)·Next 내부 파일·public의 정적 파일은 확인하지 않는다.
  // 정적 파일은 아래 확장자로만 한정한다. '점이 있으면 모두 제외'로 두면 /campaigns/spring.sale 같은 페이지 경로까지
  // 로그인 확인을 건너뛴다. public에 다른 종류의 파일을 넣으면 이 목록에 확장자를 추가한다.
  matcher: ["/((?!api/|api$|_next/static|_next/image|.*\\.(?:svg|png|jpe?g|gif|webp|avif|ico|txt|xml|webmanifest)$).*)"],
};

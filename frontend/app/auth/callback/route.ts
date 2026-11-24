/*
 * Google 로그인 뒤 Supabase가 돌려보내는 주소: /auth/callback?code=...&next=...
 * code를 세션으로 바꿔 이 사이트 쿠키에 저장하고 원래 보던 화면(next)으로 보낸다.
 * 실패하면 /login?error=코드&next=... 로 보내 다시 시도해도 원래 화면으로 돌아가게 한다.
 */
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { loginPath, safeNext } from "@/lib/api/login-path";
import { serverSupabase } from "@/lib/supabase/server";

/** PKCE 확인값이 없거나(다른 브라우저·시간 초과) 이미 쓴 code일 때 Supabase가 주는 오류 코드 */
const STATE_ERRORS = new Set(["flow_state_not_found", "flow_state_expired", "bad_code_verifier", "bad_oauth_state"]);

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNext(searchParams.get("next"));
  const fail = (code: string) => NextResponse.redirect(new URL(loginPath(next, code), origin));

  // Google 화면에서 취소하면 Supabase가 error=access_denied 로 돌려보낸다.
  const oauthError = searchParams.get("error");
  if (oauthError) return fail(oauthError === "access_denied" ? "denied" : "google");
  const code = searchParams.get("code");
  if (!code) return fail("state");

  const store = await cookies();
  const supabase = serverSupabase({
    getAll: () => store.getAll(),
    setAll: (list) => list.forEach(({ name, value, options }) => store.set(name, value, options)),
  });
  if (!supabase) return fail("config");

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail(error.code && STATE_ERRORS.has(error.code) ? "state" : "google");
  return NextResponse.redirect(new URL(next, origin));
}

/*
 * 브라우저에서 쓰는 Supabase Auth.
 * 세션은 @supabase/ssr이 이 사이트 주소의 쿠키(sb-...)에 저장하고, 만료되면 getSession()이 알아서 갱신한다.
 * 화면은 access token을 FastAPI에 Authorization 헤더로만 넘긴다. 토큰 검증·셀러 계정 찾기는 백엔드가 한다.
 */
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authCallbackUrl } from "@/lib/api/login-path";
import { supabaseEnv } from "./env";

let client: SupabaseClient | null = null;

function browserSupabase(): SupabaseClient | null {
  const env = supabaseEnv();
  if (!env || typeof window === "undefined") return null;
  return (client ??= createBrowserClient(env.url, env.key));
}

/** 로그인 세션 다루기. 테스트에서는 이 객체의 함수를 바꿔 끼운다. */
export const authSession = {
  /** 지금 로그인한 사용자의 access token. 로그인 안 됐거나 Supabase 설정이 없으면 null */
  async accessToken(): Promise<string | null> {
    const supabase = browserSupabase();
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  },

  /** Google 동의 화면으로 이동한다. 이동하지 못하면 /login?error= 코드를 돌려준다. */
  async signInWithGoogle(next: string): Promise<{ error: string | null }> {
    const supabase = browserSupabase();
    if (!supabase) return { error: "config" };
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: authCallbackUrl(window.location.origin, next) },
    });
    return { error: error ? "google" : null };
  },

  /**
   * 이 브라우저의 세션을 지운다(scope: local). 세션을 먼저 지우고 서버 폐기 요청을 보내므로
   * 네트워크가 끊겨도 이 기기에서는 로그아웃된다.
   */
  async signOut(): Promise<void> {
    const supabase = browserSupabase();
    if (!supabase) return;
    await supabase.auth.signOut({ scope: "local" });
  },
};

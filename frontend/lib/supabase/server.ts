/*
 * 서버(proxy·Route Handler)에서 쓰는 Supabase Auth.
 * 요청마다 새로 만든다. 쿠키 읽기·쓰기는 호출하는 쪽이 넘긴다(proxy는 요청/응답 쿠키, Route Handler는 next/headers).
 */
import { type CookieMethodsServer, createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env";

export function serverSupabase(cookies: CookieMethodsServer): SupabaseClient | null {
  const env = supabaseEnv();
  return env ? createServerClient(env.url, env.key, { cookies }) : null;
}

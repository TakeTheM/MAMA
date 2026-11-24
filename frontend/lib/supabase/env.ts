/*
 * Supabase Auth 접속 정보.
 * 두 값은 브라우저에서 Google 로그인을 시작해야 하므로 NEXT_PUBLIC_ 으로 둔다.
 * publishable(anon) 키는 공개를 전제로 한 키다. service_role 키·DB 접속 정보는 절대 여기에 두지 않는다.
 * 빌드 때 값이 박히므로 process.env.NEXT_PUBLIC_... 를 그대로 적는다(동적 키로 읽지 않는다).
 */
export function supabaseEnv(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return url && key ? { url, key } : null;
}

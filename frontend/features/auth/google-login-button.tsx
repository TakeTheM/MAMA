"use client";

import { useState, useSyncExternalStore } from "react";
import ui from "@/components/ui/ui.module.css";
import { recalledNext, rememberNext } from "@/lib/api/login-path";
import { authSession } from "@/lib/supabase/browser";
import { LOGIN_ERRORS, loginErrorMessage } from "./login-errors";

const noSubscribe = () => () => undefined;

/**
 * Google 로그인 버튼. 누르면 Supabase Auth가 Google 동의 화면으로 이동시킨다.
 * Google 화면에서 취소하거나 콜백이 실패해 돌아왔을 때 next가 빠져 있으면, 누를 때 기억해 둔 경로로 다시 시도한다.
 */
export function GoogleLoginButton({ next, error }: { next?: string; error?: string }) {
  // 서버에서는 저장소를 읽을 수 없으므로 null, 브라우저에서만 읽는다.
  const recalled = useSyncExternalStore(noSubscribe, recalledNext, () => null);
  const target = next ?? (error ? recalled ?? undefined : undefined) ?? "/";
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  async function start() {
    rememberNext(target);
    setPending(true); setFailed(null);
    const result = await authSession.signInWithGoogle(target).catch(() => ({ error: "google" }));
    // 성공하면 페이지가 Google로 넘어가므로 버튼은 '이동 중'으로 둔다.
    if (result.error) { setFailed(loginErrorMessage(result.error) ?? LOGIN_ERRORS.google); setPending(false); }
  }

  return <>
    {failed && <p role="alert" className={ui.error}>{failed}</p>}
    <button type="button" className={ui.googleButton} disabled={pending} onClick={() => void start()}>
      <GoogleMark />{pending ? "Google로 이동 중…" : "Google로 로그인"}
    </button>
  </>;
}

function GoogleMark() {
  return <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>;
}

import ui from "@/components/ui/ui.module.css";
import { googleLoginUrl } from "@/lib/api/login-path";

/** 백엔드가 /login?error= 로 돌려보낼 때의 이유 (백엔드 PR #52 요청서 기준) */
export const LOGIN_ERRORS: Record<string, string> = {
  denied: "로그인을 취소했어요. 계속하려면 다시 로그인해 주세요.",
  state: "로그인 시간이 지났거나 요청이 올바르지 않아요. 다시 시도해 주세요.",
  google: "Google과 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.",
  token: "Google 로그인 정보를 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.",
  email: "이메일 인증이 끝난 Google 계정으로 로그인해 주세요.",
  link: "같은 이메일로 만든 기존 계정이 있어요. 운영자에게 계정 연결을 요청해 주세요.",
  account: "이 이메일은 이미 다른 Google 계정과 연결돼 있어요. 처음 쓰던 Google 계정으로 로그인해 주세요.",
};
const UNKNOWN_ERROR = "로그인하지 못했어요. 다시 시도해 주세요.";

/** 로그인 화면. 버튼은 fetch가 아니라 페이지 이동이다(백엔드가 Google 화면으로 보낸다). */
export function LoginScreen({ next, error }: { next?: string; error?: string }) {
  const message = error ? LOGIN_ERRORS[error] ?? UNKNOWN_ERROR : "";
  return <section className={ui.login} data-bare-page aria-labelledby="login-title">
    <h1 id="login-title">MAMA에 로그인</h1>
    <p>광고 기획부터 성과 확인까지, 내 가게 캠페인만 모아 볼 수 있어요.</p>
    {message && <p role="alert" className={ui.error}>{message}</p>}
    <a className={ui.googleButton} href={googleLoginUrl(next)}><GoogleMark />Google로 로그인</a>
  </section>;
}

function GoogleMark() {
  return <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>;
}

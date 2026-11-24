import ui from "@/components/ui/ui.module.css";
import { GoogleLoginButton } from "./google-login-button";
import { loginErrorMessage } from "./login-errors";

export { LOGIN_ERRORS } from "./login-errors";

const UNKNOWN_ERROR = "로그인하지 못했어요. 다시 시도해 주세요.";

/** 로그인 화면. 버튼을 누르면 Supabase Auth가 Google 동의 화면으로 보낸다. */
export function LoginScreen({ next, error }: { next?: string; error?: string }) {
  const message = !error ? "" : loginErrorMessage(error) ?? UNKNOWN_ERROR;
  return <section className={ui.login} data-bare-page aria-labelledby="login-title">
    <h1 id="login-title">MAMA에 로그인</h1>
    <p>광고 기획부터 성과 확인까지, 내 가게 캠페인만 모아 볼 수 있어요.</p>
    {message && <p role="alert" className={ui.error}>{message}</p>}
    <GoogleLoginButton next={next} error={error} />
  </section>;
}


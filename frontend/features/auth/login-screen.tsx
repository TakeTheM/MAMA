import ui from "@/components/ui/ui.module.css";
import { GoogleLoginButton } from "./google-login-button";

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
  // 등록된 코드만 문구를 찾는다. ?error=__proto__ 처럼 Object.prototype의 이름이 오면 객체가 렌더링되며 화면이 깨진다.
  const message = !error ? "" : Object.hasOwn(LOGIN_ERRORS, error) ? LOGIN_ERRORS[error] : UNKNOWN_ERROR;
  return <section className={ui.login} data-bare-page aria-labelledby="login-title">
    <h1 id="login-title">MAMA에 로그인</h1>
    <p>광고 기획부터 성과 확인까지, 내 가게 캠페인만 모아 볼 수 있어요.</p>
    {message && <p role="alert" className={ui.error}>{message}</p>}
    <GoogleLoginButton next={next} error={error} />
  </section>;
}


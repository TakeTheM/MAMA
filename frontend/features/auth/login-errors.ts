/** /login?error= 의 이유. /auth/callback·로그인 버튼·proxy가 이 코드로 보낸다. */
export const LOGIN_ERRORS: Record<string, string> = {
  denied: "로그인을 취소했어요. 계속하려면 다시 로그인해 주세요.",
  state: "로그인 시간이 지났거나 요청이 올바르지 않아요. 다시 시도해 주세요.",
  google: "Google과 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.",
  config: "로그인 설정이 아직 준비되지 않았어요. 관리자에게 알려 주세요.",
};

/** 등록된 코드만 문구를 찾는다. ?error=__proto__ 처럼 Object.prototype의 이름이 오면 객체가 렌더링되며 화면이 깨진다. */
export const loginErrorMessage = (code: string): string | undefined => (Object.hasOwn(LOGIN_ERRORS, code) ? LOGIN_ERRORS[code] : undefined);

"use client";

import { loginPath } from "@/lib/api/login-path";

/**
 * 세션이 만료돼 로그인 화면으로 보내려 했는데 사장님이 '머무르기'를 골라 이동이 취소된 경우를 위해
 * 오류 문구 옆에 지금 경로로 돌아오는 로그인 링크를 둔다.
 */
export function LoginAgainLink({ className }: { className?: string }) {
  const here = typeof window === "undefined" ? "/" : window.location.pathname + window.location.search;
  return <a className={className} href={loginPath(here)}>로그인하러 가기</a>;
}

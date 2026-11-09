"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import ui from "@/components/ui/ui.module.css";
import { HttpError, auth } from "@/lib/api/http";
import styles from "./login.module.css";

/** 셀러 로그인·가입 (백엔드 /api/v1/auth) */
export function LoginScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<HttpError | null>(null);

  async function submit() {
    if (pending) return;
    setPending(true); setError(null);
    try {
      if (mode === "register") await auth.register(email, password);
      await auth.login(email, password);
      await auth.me();
      const next = new URLSearchParams(window.location.search).get("next");
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
    } catch (failure) {
      setError(failure instanceof HttpError ? failure : new HttpError(0, "network", "요청을 처리하지 못했어요."));
      setPending(false);
    }
  }
  const message = error?.kind === "unauthorized" ? "이메일 또는 비밀번호가 맞지 않아요." : error?.message;

  return <div className={`${ui.shell} ${styles.page}`}>
    <main className={styles.card}>
      <Link href="/" className={ui.brand}><span>M</span>MAMA</Link>
      <div className={styles.head}>
        <h1>{mode === "login" ? "로그인" : "셀러 가입"}</h1>
        <p className={ui.lead}>광고 기획부터 성과 확인까지 한 곳에서 이어서 관리해요.</p>
      </div>
      <form noValidate className={ui.stack} onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <div><label htmlFor="email">이메일</label><input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} aria-invalid={error?.fields.email ? true : undefined} aria-describedby={error?.fields.email ? "email-error" : undefined} />
          {error?.fields.email && <p id="email-error" className={ui.fieldError}><Icon name="alert" size={16} />올바른 이메일 주소를 입력해 주세요</p>}</div>
        <div><label htmlFor="password">비밀번호</label><input id="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} aria-invalid={error?.fields.password ? true : undefined} aria-describedby={error?.fields.password ? "password-error" : "password-help"} />
          {error?.fields.password ? <p id="password-error" className={ui.fieldError}><Icon name="alert" size={16} />비밀번호는 8자 이상으로 입력해 주세요</p> : mode === "register" && <p id="password-help" className={ui.help}>8자 이상으로 정해 주세요.</p>}</div>
        {message && !Object.keys(error?.fields ?? {}).length && <p role="alert" className={ui.error}>{message}</p>}
        <button type="submit" className={`${ui.primary} ${ui.block}`} disabled={pending}>{pending ? "확인 중…" : mode === "login" ? "로그인" : "가입하고 시작하기"}</button>
      </form>
      <p className={styles.switch}>{mode === "login" ? "처음 오셨나요?" : "이미 계정이 있나요?"} <button type="button" className={ui.textLink} onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(null); }}>{mode === "login" ? "셀러 가입" : "로그인"}</button></p>
    </main>
  </div>;
}

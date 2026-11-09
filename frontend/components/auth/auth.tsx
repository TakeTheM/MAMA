"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { type Me, auth, cachedUser, hasAccessToken, onUnauthenticated, refreshAccessToken } from "@/lib/api/http";
import ui from "@/components/ui/ui.module.css";

// 실제 백엔드를 쓸 때만 로그인이 필요하다. 테스트처럼 mock을 넣은 화면은 false로 감싼다.
const RequiredContext = createContext(true);
export function AuthRequirement({ required, children }: { required: boolean; children: ReactNode }) {
  return <RequiredContext.Provider value={required}>{children}</RequiredContext.Provider>;
}

const UserContext = createContext<Me | null>(null);
export function useCurrentUser() { return useContext(UserContext); }

export function loginPath(next: string) {
  return `/login?next=${encodeURIComponent(next)}`;
}

/** 로그인한 셀러만 화면을 보게 한다. 새로고침 뒤에는 Refresh 쿠키로 로그인을 이어 간다. */
export function AuthGate({ children }: { children: ReactNode }) {
  return useContext(RequiredContext) ? <RequiredGate>{children}</RequiredGate> : children;
}
function RequiredGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<Me | null>(() => cachedUser());

  useEffect(() => {
    let active = true;
    const leave = () => { if (active) router.replace(loginPath(window.location.pathname)); };
    if (!cachedUser()) {
      (async () => {
        if (!hasAccessToken() && !(await refreshAccessToken())) return leave();
        try { const me = await auth.me(); if (active) setUser(me); } catch { leave(); }
      })();
    }
    const stop = onUnauthenticated(leave);
    return () => { active = false; stop(); };
  }, [router]);

  if (!user) return <div className={ui.shell}><main className={ui.main}><section className={ui.empty} role="status"><h1>로그인 정보를 확인하고 있어요</h1><p>잠시만 기다려 주세요.</p></section></main></div>;
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}

/** 상단바 오른쪽: 로그인한 계정과 로그아웃 */
export function AccountMenu() {
  const user = useCurrentUser();
  if (!user) return <div className={ui.seller}><span>우리 가게</span><b aria-label="셀러 계정">셀</b></div>;
  return <SignedIn user={user} />;
}
function SignedIn({ user }: { user: Me }) {
  const router = useRouter();
  return <div className={ui.seller}>
    <span>{user.email}</span>
    <button type="button" className={ui.ghost} onClick={async () => { await auth.logout().catch(() => undefined); router.replace("/login"); }}>로그아웃</button>
  </div>;
}

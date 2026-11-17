"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { type Me, displayName, getMe, logout } from "@/lib/api/auth";
import { LOGIN_PATH, navigation } from "@/lib/api/login-path";
import ui from "./ui.module.css";

/**
 * 상단바 오른쪽: 로그인한 셀러 이름(없으면 이메일)과 로그아웃.
 * 로그인 화면에서는 보이지 않는다. 로그인이 안 됐으면 /auth/me가 401이라 공통 처리가 로그인 화면으로 보낸다.
 */
export function AccountMenu() {
  const pathname = usePathname();
  if (pathname === LOGIN_PATH) return null;
  return <Account />;
}

function Account() {
  const [me, setMe] = useState<Me | null>(null);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    let active = true;
    getMe().then((data) => { if (active) setMe(data); }).catch(() => { /* 401이면 이미 로그인 화면으로 이동 중 */ });
    return () => { active = false; };
  }, []);

  async function signOut() {
    setLeaving(true);
    try { await logout(); } catch { /* 이미 풀린 세션이어도 로그인 화면으로 보낸다 */ }
    // 화면에 남은 셀러 데이터를 모두 비우도록 새로 불러온다.
    navigation.go(LOGIN_PATH);
  }

  if (!me) return <div className={ui.seller} aria-hidden="true"><b /></div>;
  const name = displayName(me);
  return <div className={ui.seller}>
    <span className={ui.sellerName} title={me.email}>{name}</span>
    <b aria-hidden="true">{name.slice(0, 1).toUpperCase()}</b>
    <button type="button" className={ui.ghost} disabled={leaving} onClick={() => void signOut()}>{leaving ? "로그아웃 중…" : "로그아웃"}</button>
  </div>;
}

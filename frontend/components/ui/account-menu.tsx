"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { type Me, displayName, getMe } from "@/lib/api/auth";
import { LOGIN_PATH, navigation } from "@/lib/api/login-path";
import { authSession } from "@/lib/supabase/browser";
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
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    getMe().then((data) => { if (active) setMe(data); }).catch(() => { /* 401이면 이미 로그인 화면으로 이동 중 */ });
    return () => { active = false; };
  }, []);

  /**
   * 이 브라우저의 Supabase 세션을 지운 뒤 로그인 화면으로 보낸다. 세션을 지우지 못하면(예외) 로그아웃된 것처럼
   * 이동하지 않고 이 자리에서 알린 뒤 다시 누를 수 있게 한다.
   */
  async function signOut() {
    setLeaving(true); setFailed(false);
    try {
      await authSession.signOut();
      // 화면에 남은 셀러 데이터를 모두 비우도록 새로 불러온다.
      navigation.go(LOGIN_PATH);
    } catch {
      setFailed(true); setLeaving(false);
    }
  }

  if (!me) return <div className={ui.seller} aria-hidden="true"><b /></div>;
  const name = displayName(me);
  return <div className={ui.seller}>
    <span className={ui.sellerName} title={me.email}>{name}</span>
    <b aria-hidden="true">{name.slice(0, 1).toUpperCase()}</b>
    <button type="button" className={ui.ghost} disabled={leaving} aria-describedby={failed ? "logout-error" : undefined} onClick={() => void signOut()}>{leaving ? "로그아웃 중…" : failed ? "다시 로그아웃" : "로그아웃"}</button>
    {failed && <p id="logout-error" role="alert" className={ui.sellerError}>로그아웃하지 못했어요. 아직 로그인된 상태예요. 다시 눌러 주세요.</p>}
  </div>;
}

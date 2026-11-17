"use client";

import Link from "next/link";
import { loginPath } from "@/lib/api/login-path";
import type { ReactNode } from "react";
import ui from "./ui.module.css";

type LoadError = { code: string; message: string };

/** 캠페인을 불러오는 중·오류 화면. 데이터가 준비되면 children을 그린다. (01~07 화면 공통) */
export function LoadGate<T>({ data, loadError, reload, children }: {
  data: T | null; loadError: LoadError | null; reload: () => void; children: (data: T) => ReactNode;
}) {
  if (loadError) {
    // 다른 셀러의 캠페인은 백엔드가 404로 준다(있는지조차 알리지 않음).
    if (loadError.code === "unauthorized") {
      return <section className={ui.empty} role="status"><h1>로그인이 필요해요</h1><p>로그인 화면으로 이동하고 있어요.</p>
        <a className={ui.secondary} href={loginPath(typeof window === "undefined" ? "/" : window.location.pathname + window.location.search)}>로그인하러 가기</a>
      </section>;
    }
    const title = loadError.code === "not_found" ? "캠페인이 없습니다" : loadError.code === "forbidden" ? "접근 권한이 없습니다" : "잠시 연결이 어려워요";
    return <section className={ui.empty} role="alert"><h1>{title}</h1><p>{loadError.message}</p>
      {loadError.code === "network" ? <button className={ui.primary} onClick={reload}>다시 시도</button> : <Link className={ui.secondary} href="/">캠페인 목록으로</Link>}
    </section>;
  }
  if (data === null) return <section className={ui.empty} role="status"><h1>캠페인을 불러오는 중입니다</h1><p>잠시만 기다려 주세요.</p></section>;
  return children(data);
}

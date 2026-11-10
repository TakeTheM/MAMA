"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { Icon } from "./icon";
import ui from "./ui.module.css";

export type NavKey = "campaigns" | "new" | "performance";

const NAV: { key: NavKey; href: string; label: string; icon: "campaign" | "plus" | "chart" }[] = [
  { key: "campaigns", href: "/", label: "캠페인", icon: "campaign" },
  { key: "new", href: "/campaigns/new", label: "새 캠페인", icon: "plus" },
  { key: "performance", href: "/performance", label: "성과 기록", icon: "chart" },
];

/** 주소로 지금 메뉴를 고른다. 캠페인 상세 중 성과 화면은 '성과 기록'으로 본다. */
function activeNav(pathname: string): NavKey {
  if (pathname === "/campaigns/new") return "new";
  if (pathname === "/performance" || pathname.endsWith("/performance")) return "performance";
  return "campaigns";
}

function Nav({ active }: { active: NavKey | null }) {
  return <nav className={ui.sidebar} aria-label="주 메뉴">
    {NAV.map((item) => <Link key={item.key} href={item.href} aria-current={item.key === active ? "page" : undefined}><Icon name={item.icon} />{item.label}</Link>)}
  </nav>;
}
function CurrentNav() {
  return <Nav active={activeNav(usePathname())} />;
}

/**
 * 상단바·사이드바 틀. 루트 layout에서 한 번만 그려서 화면을 옮겨도 다시 그려지지 않는다(깜빡임 방지).
 */
export function AppFrame({ children }: { children: ReactNode }) {
  return <div className={ui.shell}>
    <a className={ui.skip} href="#main">본문으로 건너뛰기</a>
    <header className={ui.topbar}>
      <Link href="/" className={ui.brand}><span>M</span>MAMA</Link>
      <div className={ui.seller}><span>우리 가게</span><b aria-label="셀러 계정">셀</b></div>
    </header>
    <div className={ui.workspace}>
      <Suspense fallback={<Nav active={null} />}><CurrentNav /></Suspense>
      <main id="main" className={ui.main} tabIndex={-1}>
        <div className={ui.content}>{children}</div>
      </main>
    </div>
  </div>;
}

/** 각 화면의 본문. 틀(AppFrame)은 layout에 있으므로 안내 띠와 내용만 그린다. */
export function AppShell({ children, notice }: { children: ReactNode; notice?: ReactNode }) {
  return <>{notice}{children}</>;
}

export function DemoNotice({ children }: { children?: ReactNode }) {
  return <div className={ui.demoBar}>
    <p><strong>데모</strong> 예시 데이터로 움직이는 화면이에요. 새로고침하면 기록이 초기화됩니다.</p>
    {children}
  </div>;
}

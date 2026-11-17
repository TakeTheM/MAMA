"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ConfirmBox } from "./confirm-box";
import ui from "./ui.module.css";

/**
 * 저장하지 않은 수정이 있을 때 화면을 떠나기 전에 한 번 더 묻는다.
 * - 새로고침·탭 닫기: 브라우저 기본 경고(beforeunload)
 * - 사이드바·경로 등 앱 안의 링크: 확인 상자를 띄우고, '나가기'를 누르면 그 주소로 이동한다
 * 브라우저 뒤로 가기는 Next.js가 막을 방법을 주지 않아서 다루지 않는다.
 */
export function UnsavedGuard({ when, message }: { when: boolean; message: string }) {
  const router = useRouter();
  const [target, setTarget] = useState<string | null>(null);
  const active = useRef(when);
  useEffect(() => { active.current = when; }, [when]);

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!active.current) return;
      event.preventDefault();
      event.returnValue = "";
    }
    // Next.js Link보다 먼저 받도록 document의 캡처 단계에서 링크 클릭을 가로챈다.
    function onClick(event: MouseEvent) {
      if (!active.current || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement) || (link.target && link.target !== "_self") || link.hasAttribute("download")) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      event.preventDefault();
      event.stopPropagation();
      setTarget(url.pathname + url.search + url.hash);
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  if (!target) return null;
  return <div className={ui.overlay}>
    <div className={ui.overlayPanel} aria-modal="true">
      <ConfirmBox id="leave" title="고친 내용이 저장되지 않았어요" confirmLabel="저장하지 않고 나가기" onCancel={() => setTarget(null)}
        onConfirm={() => { active.current = false; setTarget(null); router.push(target); }}>
        {message}
      </ConfirmBox>
    </div>
  </div>;
}

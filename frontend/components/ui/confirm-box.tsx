"use client";

import { useEffect, useRef, type ReactNode } from "react";
import ui from "./ui.module.css";

/**
 * 되돌릴 수 없는 행동 직전에 한 번 더 묻는 상자 (캠페인 취소·승인·게시함·종료·반려·평가 완료·초안 다시 만들기·저장 안 하고 나가기).
 * 열리면 '돌아가기'에 초점을 둬서 Enter를 연달아 눌러도 바로 확정되지 않게 한다. Esc로 닫는다.
 */
export function ConfirmBox({ id, title, children, confirmLabel, pendingLabel, pending = false, modal = false, onCancel, onConfirm }: {
  id: string; title: string; children: ReactNode; confirmLabel: string; pendingLabel?: string; pending?: boolean;
  /** 화면 가운데에 띄울 때. Tab 키가 상자 밖(뒤 화면)으로 나가지 않게 한다. */
  modal?: boolean;
  onCancel: () => void; onConfirm: () => void;
}) {
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => { back.current?.focus(); }, []);
  return <div className={ui.confirm} role="alertdialog" aria-modal={modal || undefined} aria-labelledby={`${id}-title`} aria-describedby={`${id}-desc`}
    onKeyDown={(event) => {
      if (event.key === "Escape" && !pending) onCancel();
      if (event.key !== "Tab" || !modal) return;
      const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
      if (!buttons.length) return;
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }}>
    <div><strong id={`${id}-title`}>{title}</strong><p id={`${id}-desc`}>{children}</p></div>
    <div>
      <button ref={back} type="button" className={ui.ghost} disabled={pending} onClick={onCancel}>돌아가기</button>
      <button type="button" className={`${ui.primary} ${ui.small}`} disabled={pending} onClick={onConfirm}>{pending && pendingLabel ? pendingLabel : confirmLabel}</button>
    </div>
  </div>;
}

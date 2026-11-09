"use client";

import Link from "next/link";
import { useState } from "react";
import { type CampaignStatus, STEPS, activeStep } from "@/lib/campaign-status";
import { StatusBadge } from "./status-badge";
import ui from "./ui.module.css";

/**
 * 캠페인 화면 위쪽(경로·이름·상태·취소·진행 단계).
 * 취소 버튼은 백엔드 응답이 취소를 허용할 때(onCancel 전달)만 보인다 (US-06).
 */
export function CampaignHeading({ name, status, detail, canceledFrom, onCancel, pending = false }: {
  name: string; status: CampaignStatus; detail?: string; canceledFrom?: CampaignStatus;
  onCancel?: () => Promise<boolean> | void; pending?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const step = activeStep(status, canceledFrom);
  return <section className={ui.campaignHeading} aria-label="캠페인 개요">
    <p className={ui.breadcrumb}><Link href="/">캠페인</Link><span aria-hidden="true">›</span><span>{name}</span></p>
    <div className={ui.headRow}>
      <div className={ui.titleRow}><h1>{name}</h1><StatusBadge status={status} /></div>
      {onCancel && !confirming && <button type="button" className={ui.ghost} disabled={pending} onClick={() => setConfirming(true)}>캠페인 취소</button>}
    </div>
    {detail && <p className={ui.product}>{detail}</p>}
    {onCancel && confirming && <div className={ui.confirm} role="alertdialog" aria-labelledby="cancel-title" aria-describedby="cancel-desc">
      <div><strong id="cancel-title">이 캠페인을 취소할까요?</strong><p id="cancel-desc">취소하면 되돌릴 수 없어요. 문구 수정·검수·게시 기록을 더 할 수 없고 저장된 기록만 남아요.</p></div>
      <div>
        <button type="button" className={`${ui.ghost}`} disabled={pending} onClick={() => setConfirming(false)}>돌아가기</button>
        <button type="button" className={`${ui.primary} ${ui.small}`} disabled={pending} onClick={async () => { const done = await onCancel(); if (done !== false) setConfirming(false); }}>{pending ? "취소 중…" : "취소하기"}</button>
      </div>
    </div>}
    <div className={ui.stepScroll} tabIndex={0} role="region" aria-label="캠페인 진행 단계">
      <ol className={ui.steps} aria-label="진행 단계">{STEPS.map((label, index) => <li key={label} data-complete={index <= step} aria-current={index === step ? "step" : undefined}><span /><span>{String(index + 1).padStart(2, "0")} {label}</span></li>)}</ol>
    </div>
  </section>;
}

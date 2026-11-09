"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { CampaignHeading } from "@/components/ui/campaign-heading";
import ui from "@/components/ui/ui.module.css";
import { type Campaign, ApiError } from "./model";

/** 불러오는 중·오류 화면. 캠페인이 준비되면 children을 그린다. */
export function LoadGate({ campaign, loadError, reload, children }: {
  campaign: Campaign | null; loadError: ApiError | null; reload: () => void; children: (campaign: Campaign) => ReactNode;
}) {
  if (loadError) {
    const title = loadError.code === "not_found" ? "캠페인이 없습니다" : loadError.code === "forbidden" ? "접근 권한이 없습니다" : "잠시 연결이 어려워요";
    return <section className={ui.empty} role="alert"><h1>{title}</h1><p>{loadError.message}</p>
      {loadError.code === "network" ? <button className={ui.primary} onClick={reload}>다시 시도</button> : <Link className={ui.secondary} href="/">캠페인 목록으로</Link>}
    </section>;
  }
  if (!campaign) return <section className={ui.empty} role="status"><h1>캠페인을 불러오는 중입니다</h1><p>잠시만 기다려 주세요.</p></section>;
  return children(campaign);
}

/** 상태 헤더 + 취소. 취소 가능 여부는 백엔드 응답(allowedActions)을 따른다. */
export function Heading({ campaign, pending, onCancel }: { campaign: Campaign; pending: boolean; onCancel: () => Promise<unknown> }) {
  const canceledFrom = campaign.status === "취소" ? [...campaign.history].reverse().find((entry) => entry.to === "취소")?.from : undefined;
  return <CampaignHeading
    name={campaign.name} status={campaign.status} pending={pending} canceledFrom={canceledFrom}
    detail={`${campaign.plan.productName} · ${campaign.plan.channels.join(", ")}`}
    onCancel={campaign.allowedActions.includes("cancel") ? async () => Boolean(await onCancel()) : undefined}
  />;
}

export function Feedback({ pending, error, notice, id = "action-error" }: { pending: boolean; error: ApiError | null; notice: string; id?: string }) {
  return <div className={ui.feedback}>
    {pending && <p role="status">요청을 처리하고 있습니다…</p>}
    {error && <p id={id} role="alert" className={ui.error}>{error.message}</p>}
    <p role="status" aria-live="polite" className={ui.success}>{notice}</p>
  </div>;
}

/** 지금 상태에서 이 화면의 작업을 할 수 없을 때 보여 줄 안내 */
export function WrongStage({ campaign, children }: { campaign: Campaign; children?: ReactNode }) {
  return <div className={ui.dashed} role="note"><p>{campaign.status === "취소" ? "취소된 캠페인입니다. 저장된 기록만 확인할 수 있습니다." : children ?? "현재 상태에서는 이 화면의 작업을 할 수 없어요."}</p></div>;
}

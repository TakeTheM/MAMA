"use client";

import type { ReactNode } from "react";
import { CampaignHeading } from "@/components/ui/campaign-heading";
import { LoadGate as CommonLoadGate } from "@/components/ui/load-gate";
import { canceledFrom } from "@/lib/campaign-status";
import ui from "@/components/ui/ui.module.css";
import { type Campaign, ApiError } from "./model";

/** 캠페인 화면용 불러오기 게이트 (공통 LoadGate에 캠페인 타입을 정해 둠) */
export function LoadGate({ campaign, loadError, reload, children }: {
  campaign: Campaign | null; loadError: ApiError | null; reload: () => void; children: (campaign: Campaign) => ReactNode;
}) {
  return <CommonLoadGate data={campaign} loadError={loadError} reload={reload}>{children}</CommonLoadGate>;
}

/** 상태 헤더 + 취소. 취소 가능 여부는 백엔드 응답(allowedActions)을 따른다. */
export function Heading({ campaign, pending, onCancel }: { campaign: Campaign; pending: boolean; onCancel: () => Promise<unknown> }) {
  return <CampaignHeading
    name={campaign.name} status={campaign.status} pending={pending} canceledFrom={canceledFrom(campaign.status, campaign.history)}
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

import { Suspense, type ReactNode } from "react";

type Params = Promise<{ campaignId: string }>;

/** 동적 경로의 campaignId를 꺼내 화면에 넘긴다 (params는 Promise라 Suspense 안에서 기다린다). */
export function CampaignRoute({ params, render }: { params: Params; render: (campaignId: string) => ReactNode }) {
  return <Suspense fallback={<p role="status" style={{ padding: 32 }}>캠페인을 준비하고 있습니다…</p>}><Resolve params={params} render={render} /></Suspense>;
}
async function Resolve({ params, render }: { params: Params; render: (campaignId: string) => ReactNode }) {
  const { campaignId } = await params;
  return render(decodeURIComponent(campaignId));
}

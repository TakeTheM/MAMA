import { Suspense, type ReactNode } from "react";

type Params = Promise<{ campaignId: string }>;

/** 동적 경로의 campaignId를 꺼내 화면에 넘긴다 (params는 Promise라 Suspense 안에서 기다린다). Next.js가 이미 디코딩해 준 값을 그대로 쓴다. */
export function CampaignRoute({ params, render }: { params: Params; render: (campaignId: string) => ReactNode }) {
  return <Suspense fallback={null}><Resolve params={params} render={render} /></Suspense>;
}
async function Resolve({ params, render }: { params: Params; render: (campaignId: string) => ReactNode }) {
  const { campaignId } = await params;
  return render(campaignId);
}

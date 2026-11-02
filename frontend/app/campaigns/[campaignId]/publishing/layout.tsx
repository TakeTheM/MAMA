import { Suspense, type ReactNode } from "react";
import { Noto_Sans_KR } from "next/font/google";
import { PublishingProvider } from "@/features/publishing/publishing-session";
import { PublishingShell } from "@/features/publishing/publishing-screen";

const noto = Noto_Sans_KR({ subsets: ["latin"], display: "swap", variable: "--font-publishing", fallback: ["system-ui", "sans-serif"] });

export default function PublishingLayout({ children, params }: { children: ReactNode; params: Promise<{ campaignId: string }> }) {
  return <div className={noto.variable}><Suspense fallback={<p role="status" className="p-8">캠페인을 준비하고 있습니다…</p>}><SessionLayout params={params}>{children}</SessionLayout></Suspense></div>;
}
async function SessionLayout({ children, params }: { children: ReactNode; params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  return <PublishingProvider campaignId={campaignId}><PublishingShell>{children}</PublishingShell></PublishingProvider>;
}

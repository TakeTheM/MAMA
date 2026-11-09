import type { ReactNode } from "react";
import { CampaignRoute } from "@/components/campaign-route";
import { PublishingShell } from "@/features/publishing/publishing-screen";
import { PublishingProvider } from "@/features/publishing/publishing-session";

export default function PublishingLayout({ children, params }: { children: ReactNode; params: Promise<{ campaignId: string }> }) {
  return <CampaignRoute params={params} render={(campaignId) => <PublishingProvider campaignId={campaignId}><PublishingShell>{children}</PublishingShell></PublishingProvider>} />;
}

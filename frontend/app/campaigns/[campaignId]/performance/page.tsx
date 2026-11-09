import { CampaignRoute } from "@/components/campaign-route";
import { PerformanceScreen } from "@/features/campaigns/performance/performance-screen";

export const metadata = { title: "성과 요약 | MAMA" };
export default function PerformancePage({ params }: PageProps<"/campaigns/[campaignId]/performance">) {
  return <CampaignRoute params={params} render={(campaignId) => <PerformanceScreen campaignId={campaignId} />} />;
}

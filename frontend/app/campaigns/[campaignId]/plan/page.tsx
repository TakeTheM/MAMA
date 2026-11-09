import { CampaignRoute } from "@/components/campaign-route";
import { PlanScreen } from "@/features/campaigns/plan/plan-screen";

export const metadata = { title: "캠페인 기획 | MAMA" };
export default function PlanPage({ params }: PageProps<"/campaigns/[campaignId]/plan">) {
  return <CampaignRoute params={params} render={(campaignId) => <PlanScreen campaignId={campaignId} />} />;
}

import { CampaignRoute } from "@/components/campaign-route";
import { DraftScreen } from "@/features/campaigns/draft/draft-screen";

export const metadata = { title: "초안 확인 | MAMA" };
export default function DraftPage({ params }: PageProps<"/campaigns/[campaignId]/draft">) {
  return <CampaignRoute params={params} render={(campaignId) => <DraftScreen campaignId={campaignId} />} />;
}

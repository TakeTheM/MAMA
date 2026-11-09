import { CampaignRoute } from "@/components/campaign-route";
import { ReviewScreen } from "@/features/campaigns/review/review-screen";

export const metadata = { title: "검수 결과 | MAMA" };
export default function ReviewPage({ params }: PageProps<"/campaigns/[campaignId]/review">) {
  return <CampaignRoute params={params} render={(campaignId) => <ReviewScreen campaignId={campaignId} />} />;
}

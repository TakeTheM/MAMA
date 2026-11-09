import { getDemoApi } from "@/features/campaigns/api-context";
import type { Campaign as StoredCampaign } from "@/features/campaigns/model";
import { createMockAdapter } from "./mock-adapter";
import type { Campaign, PublishingAdapter } from "./model";

// 데모 전용: 목록·검수 화면과 같은 저장소의 캠페인을 게시 화면 mock에 이어 준다.
// 백엔드가 생기면 두 화면 모두 같은 FastAPI를 부르므로 이 파일은 지운다.
function toPublishing(record: StoredCampaign): Campaign {
  const copies = record.plan.channels.flatMap((channel) => {
    const copy = record.drafts[channel];
    return copy ? [{ channel, caption: copy.caption, hashtags: copy.hashtags }] : [];
  });
  return {
    id: record.id, ownerId: record.ownerId, name: record.name, product: record.plan.productName, channels: record.plan.channels,
    caption: copies[0]?.caption ?? "", hashtags: copies[0]?.hashtags ?? [], copies, status: record.status,
    initialBudget: { amount: Number(record.plan.budgetAmount), days: Number(record.plan.budgetDays) },
    schedule: record.schedule, publishedAt: record.publishedAt, endedAt: record.endedAt, rejectionReason: record.rejectionReason,
    history: structuredClone(record.history), allowedActions: [],
  };
}

export function demoStoreAdapter(campaignId: string): PublishingAdapter | null {
  const store = getDemoApi();
  const record = store.peek(campaignId);
  if (!record) return null;
  return createMockAdapter({
    initial: toPublishing(record),
    onChange: (campaign) => {
      const current = store.peek(campaignId);
      if (!current) return;
      store.replace({
        ...current, status: campaign.status, schedule: campaign.schedule, publishedAt: campaign.publishedAt, endedAt: campaign.endedAt,
        rejectionReason: campaign.rejectionReason, history: campaign.history, updatedAt: new Date().toISOString(),
      });
    },
  });
}

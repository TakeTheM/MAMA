import { getDemoApi } from "@/features/campaigns/api-context";
import type { Campaign as StoredCampaign } from "@/features/campaigns/model";
import { createMockAdapter } from "./mock-adapter";
import { type Campaign, type PublishingAdapter, PublishingError } from "./model";

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

/**
 * 요청마다 공용 저장소의 지금 캠페인으로 게시 규칙(mock)을 돌린다.
 * 다른 화면에서 바뀐 상태·기록을 놓치지 않고, 저장할 때는 새로 생긴 기록만 덧붙인다.
 */
export function demoStoreAdapter(campaignId: string, options: { delay?: number } = {}): PublishingAdapter | null {
  const store = getDemoApi();
  if (!store.peek(campaignId)) return null;
  const current = () => {
    const record = store.peek(campaignId);
    if (!record) throw new PublishingError("not_found", "캠페인을 찾을 수 없습니다.");
    return record;
  };
  const adapterFor = (record: StoredCampaign) => createMockAdapter({ initial: toPublishing(record), delay: options.delay });
  return {
    getCampaign: (id) => adapterFor(current()).getCampaign(id),
    async mutate(id, command) {
      const before = current();
      const result = await adapterFor(before).mutate(id, command);
      const added = result.campaign.history.slice(before.history.length);
      const latest = current();
      const next = result.campaign;
      store.replace({
        ...latest, status: next.status, schedule: next.schedule, publishedAt: next.publishedAt, endedAt: next.endedAt,
        rejectionReason: next.rejectionReason, history: [...latest.history, ...added], updatedAt: new Date().toISOString(),
      });
      return result;
    },
  };
}

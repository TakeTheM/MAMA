import type { CampaignStatus } from "@/lib/campaign-status";

export type { CampaignStatus };
export { formatTime } from "@/lib/campaign-status";
export type Action = "schedule" | "publish" | "end" | "reject" | "revise" | "cancel";
export type Schedule = { scheduledAt: string; amount: number; days: number };
export type HistoryEntry = {
  from: CampaignStatus; to: CampaignStatus; at: string; actor: string; reason?: string;
};
export type Campaign = {
  id: string; ownerId: string; name: string; product: string; channels: string[];
  caption: string; hashtags: string[]; status: CampaignStatus;
  initialBudget: { amount: number; days: number }; schedule?: Schedule;
  publishedAt?: string; endedAt?: string; rejectionReason?: string;
  history: HistoryEntry[]; allowedActions: Action[];
  /** 채널별 승인 문구 (있으면 채널마다 보여 준다) */
  copies?: { channel: string; caption: string; hashtags: string[] }[];
};
export type Mutation =
  | { action: "schedule"; schedule: Schedule }
  | { action: "reject"; reason: string }
  | { action: "publish" | "end" | "revise" | "cancel" };
export type MutationResult = { campaign: Campaign; warning?: string };
export interface PublishingAdapter {
  getCampaign(id: string): Promise<Campaign>;
  mutate(id: string, command: Mutation): Promise<MutationResult>;
}
export class PublishingError extends Error {
  constructor(public code: "not_found" | "forbidden" | "network" | "validation" | "conflict", message: string,
    public field?: "scheduledAt" | "amount" | "days" | "reason") {
    super(message);
  }
}

export const REVIEW_WARNING = "플랫폼 심사에 24시간 여유가 없습니다";

// datetime-local has no timezone. Always interpret its wall time as Seoul time.
export function toSeoulInput(value: string) {
  return new Date(new Date(value).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

export function fromSeoulInput(value: string) {
  return value ? new Date(`${value}:00+09:00`).toISOString() : "";
}

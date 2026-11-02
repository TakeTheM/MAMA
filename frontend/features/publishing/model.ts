export type CampaignStatus =
  | "기획중" | "초안 생성됨" | "검수 대기" | "수정 요청" | "승인됨"
  | "게시 예약됨" | "플랫폼 반려" | "집행중" | "일시정지" | "종료" | "성과 평가 완료" | "취소";
export type Action = "schedule" | "publish" | "end" | "reject" | "revise";
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
};
export type Mutation =
  | { action: "schedule"; schedule: Schedule }
  | { action: "reject"; reason: string }
  | { action: "publish" | "end" | "revise" };
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

export function formatTime(value?: string) {
  if (!value) return "아직 기록되지 않음";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short",
  }).format(new Date(value));
}

// datetime-local has no timezone. Always interpret its wall time as Seoul time.
export function toSeoulInput(value: string) {
  return new Date(new Date(value).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

export function fromSeoulInput(value: string) {
  return value ? new Date(`${value}:00+09:00`).toISOString() : "";
}

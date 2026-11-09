import type { CampaignStatus, Channel } from "@/lib/campaign-status";

export type Goal = "구매 늘리기" | "상품 알리기" | "팔로워 늘리기";
export const GOALS: Goal[] = ["구매 늘리기", "상품 알리기", "팔로워 늘리기"];
export type Category = "식품" | "화장품" | "생활용품" | "패션";
export const CATEGORIES: Category[] = ["식품", "화장품", "생활용품", "패션"];

/** 화면 입력값 그대로(문자열) 보낸다. 숫자 변환·검사는 백엔드가 한다. */
export type PlanInput = {
  productName: string; productDescription: string; price: string; category: Category;
  goal: Goal; channels: Channel[]; budgetAmount: string; budgetDays: string;
};
export type PlanField = keyof PlanInput;

export type ChannelCopy = { caption: string; hashtags: string[] };
export type RiskRule = "R1" | "R3" | "R4" | "R5";
export type RiskFinding = {
  id: string; channel: Channel; rule: RiskRule; ruleLabel: string;
  /** 문구 안의 위험 표현. 표시가 빠진 경우(R1)는 null */
  quote: string | null;
  title: string; reason: string;
  /** 팀이 확인한 근거 자료. 목록에 없는 링크면 비어 있다 */
  source?: { title: string; url: string };
  /** 고쳐 쓴 표현 (위험 표현 자리에 넣을 말) */
  suggestion: string;
  /** 위험 표현 자리에 넣을 말. 적용하면 이 표현만 바꾼다. 없으면(R1 표시 누락) #광고를 붙인다 */
  replacement?: string;
  applied: boolean;
};
export type HistoryEntry = { from: CampaignStatus; to: CampaignStatus; at: string; actor: string; reason?: string };
export type PerformanceInput = { impressions: string; clicks: string; conversions: string; cost: string; revenue: string };
export type PerformanceField = keyof PerformanceInput;
export type Performance = {
  impressions: number; clicks: number; conversions: number; cost: number; revenue: number;
  /** 시스템이 계산한 ROAS(%). 광고비가 0이면 null */
  roas: number | null;
  summary?: string; suggestions?: string[]; summaryError?: string;
};

export type CampaignAction =
  | "save-plan" | "generate-draft" | "save-draft" | "regenerate" | "request-review"
  | "approve" | "submit-performance" | "complete-evaluation" | "cancel";

export type Campaign = {
  id: string; ownerId: string; name: string; status: CampaignStatus; updatedAt: string;
  plan: PlanInput;
  drafts: Partial<Record<Channel, ChannelCopy>>;
  /** 초안을 만들 때 참고한 지난 캠페인 (US-01 피드백 루프) */
  reference?: { id: string; name: string; roas: number | null };
  findings: RiskFinding[];
  /**
   * 백엔드가 알려 주는 승인 버튼 활성 여부. 화면에서 다시 계산하지 않는다.
   * 위험 표현은 경고일 뿐이라 검수를 마쳤으면 승인할 수 있다. 검수 실패·미완료(고친 뒤 재검수 전)면 false.
   */
  canApprove: boolean;
  reviewError?: string;
  /** 검수(L2)가 아직 끝나지 않음 */
  reviewPending?: boolean;
  schedule?: { scheduledAt: string; amount: number; days: number };
  publishedAt?: string; endedAt?: string; rejectionReason?: string;
  performance?: Performance;
  history: HistoryEntry[];
  allowedActions: CampaignAction[];
};
export type CampaignSummary = Pick<Campaign, "id" | "name" | "status" | "updatedAt"> & {
  channels: Channel[]; findingCount: number; roas: number | null;
};

export type ApiErrorCode = "not_found" | "forbidden" | "network" | "validation" | "conflict" | "llm";
export class ApiError extends Error {
  /** 저장은 됐지만 다음 단계에서 실패했을 때, 이미 만들어진 캠페인 id */
  campaignId?: string;
  constructor(public code: ApiErrorCode, message: string, public fields: Record<string, string> = {}) {
    super(message);
  }
}

/** 화면이 쓰는 API. 실제 화면은 http-api.ts(FastAPI)를, 테스트는 mock-api.ts를 쓴다. */
export interface CampaignApi {
  listCampaigns(): Promise<CampaignSummary[]>;
  getCampaign(id: string): Promise<Campaign>;
  /** 최근 성과 평가 완료 캠페인 (새 캠페인 화면 안내용) */
  getLatestEvaluated(): Promise<CampaignSummary | null>;
  savePlan(id: string | null, plan: PlanInput): Promise<Campaign>;
  generateDraft(id: string | null, plan: PlanInput): Promise<Campaign>;
  saveDraft(id: string, channel: Channel, copy: ChannelCopy): Promise<Campaign>;
  regenerateChannel(id: string, channel: Channel): Promise<Campaign>;
  requestReview(id: string, drafts?: Partial<Record<Channel, ChannelCopy>>): Promise<Campaign>;
  approve(id: string): Promise<Campaign>;
  submitPerformance(id: string, input: PerformanceInput): Promise<Campaign>;
  completeEvaluation(id: string): Promise<Campaign>;
  cancel(id: string): Promise<Campaign>;
}

export const CHANNEL_LIMITS: Record<Channel, number> = { 인스타그램: 2200, X: 280, 틱톡: 2200 };

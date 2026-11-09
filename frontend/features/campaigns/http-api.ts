import { type CampaignStatus, type Channel } from "@/lib/campaign-status";
import { HttpError, apiFetch } from "@/lib/api/http";
import {
  type Campaign, type CampaignAction, type CampaignApi, type CampaignSummary, type Category, type ChannelCopy, type Goal,
  type HistoryEntry, type Performance, type PerformanceInput, type PlanInput, type RiskFinding, type RiskRule, ApiError, CATEGORIES, GOALS,
} from "./model";

/*
 * FastAPI(/api/v1/campaigns) 구현. 응답(CampaignOut)을 화면 모델로 옮기기만 한다.
 * 상태 전이·검사·ROAS 계산은 백엔드가 하고, 화면은 allowed_actions를 그대로 따른다.
 * 명세: backend/docs/openapi.json
 */

type ApiChannel = "instagram" | "x" | "tiktok";
const TO_UI: Record<ApiChannel, Channel> = { instagram: "인스타그램", x: "X", tiktok: "틱톡" };
const TO_API: Record<Channel, ApiChannel> = { 인스타그램: "instagram", X: "x", 틱톡: "tiktok" };

type ApiDraft = { caption: string; hashtags: string[] };
type ApiFinding = { channel: ApiChannel | "legacy"; start: number; end: number; quote: string; rule: RiskRule; reason: string; evidence_url: string | null; suggestion: string };
export type CampaignOut = {
  id: number; owner_id: number; content: string;
  product_name: string | null; product_description: string | null; product_category: string | null; product_price: number | null;
  goal: string | null; target_audience: string | null; channels: ApiChannel[]; drafts: Partial<Record<ApiChannel, ApiDraft>>;
  reference_campaign_id: number | null; revision: number; status: CampaignStatus;
  initial_budget_amount: number; initial_budget_days: number;
  scheduled_at: string | null; budget_amount: number | null; budget_days: number | null;
  published_at: string | null; ended_at: string | null; created_at: string; updated_at: string;
  allowed_actions: string[]; warnings: string[]; rejection_reason: string | null;
  review: { status: "pending" | "failed" | "passed" | "changes_requested"; findings: ApiFinding[] } | null;
};
type HistoryOut = { id: number; previous_status: CampaignStatus | null; next_status: CampaignStatus; changed_by: number; recorded_at: string; snapshot: { rejection_reason?: string | null } };
type PerformanceOut = {
  impressions: number; clicks: number; conversions: number; ad_spend: number; revenue: number;
  roas: number | null; status: "pending" | "failed" | "ready" | "completed"; summary: string | null; suggestion: string | null;
};

const BASE = "/api/v1/campaigns";
const RULE_LABEL: Record<RiskRule, string> = { R1: "협찬 미표시", R3: "거짓·과장", R4: "효능 표방", R5: "비하·혐오" };
const SOURCE_TITLE: Record<RiskRule, string> = {
  R1: "추천·보증 등에 관한 표시·광고 심사지침", R3: "표시·광고의 공정화에 관한 법률", R4: "식품 등의 표시·광고에 관한 법률 / 화장품법", R5: "근거 자료",
};
/** 백엔드 필드 이름 → 화면 입력칸 이름 */
const FIELD: Record<string, string> = {
  product_name: "productName", product_description: "productDescription", product_price: "price", product_category: "category",
  goal: "goal", channels: "channels", initial_budget_amount: "budgetAmount", initial_budget_days: "budgetDays", content: "productDescription",
  impressions: "impressions", clicks: "clicks", conversions: "conversions", ad_spend: "cost", revenue: "revenue", drafts: "caption",
};

function toApiError(error: unknown, campaignId?: string): ApiError {
  if (error instanceof ApiError) return error;
  if (!(error instanceof HttpError)) return new ApiError("network", "요청을 처리하지 못했어요. 다시 시도해 주세요.");
  const fields: Record<string, string> = {};
  for (const [key, message] of Object.entries(error.fields)) fields[FIELD[key] ?? key] = message;
  // 초안 생성 422는 "초안 생성에 필요한 입력: product_name, ..." 형식의 문자열로 온다.
  const missing = /필요한 입력: (.+)$/.exec(error.message)?.[1];
  if (missing) for (const key of missing.split(/,\s*/)) fields[FIELD[key] ?? key] = "입력해 주세요";
  const code = error.kind === "unauthorized" ? "forbidden" : error.kind;
  const result = new ApiError(code, error.message, fields);
  result.campaignId = campaignId;
  return result;
}
async function call<T>(request: () => Promise<T>, campaignId?: string): Promise<T> {
  try { return await request(); } catch (error) { throw toApiError(error, campaignId); }
}

const toNumber = (value: string) => {
  const trimmed = value.replace(/,/g, "").trim();
  if (!trimmed) return null;
  const number = Number(trimmed);
  // 숫자가 아니면 그대로 보내서 백엔드가 어느 칸이 틀렸는지 알려 주게 한다.
  return Number.isFinite(number) ? number : trimmed;
};
const nonBlank = (value: string) => (value.trim() ? value : undefined);

function planBody(plan: PlanInput, creating: boolean) {
  const body: Record<string, unknown> = {
    product_name: nonBlank(plan.productName), product_description: nonBlank(plan.productDescription),
    product_category: plan.category, product_price: toNumber(plan.price) ?? undefined, goal: plan.goal,
    channels: plan.channels.map((channel) => TO_API[channel]),
    initial_budget_amount: toNumber(plan.budgetAmount) ?? (creating ? null : undefined),
    initial_budget_days: toNumber(plan.budgetDays) ?? (creating ? null : undefined),
  };
  // content는 채널 없는 예전 방식용 필수값이라 상품 설명(없으면 상품명)으로 채운다.
  const content = nonBlank(plan.productDescription) ?? nonBlank(plan.productName);
  if (content) body.content = content;
  for (const key of Object.keys(body)) if (body[key] === undefined) delete body[key];
  return body;
}
function apiDrafts(drafts: Partial<Record<Channel, ChannelCopy>>) {
  return Object.fromEntries(Object.entries(drafts).map(([channel, copy]) => [TO_API[channel as Channel], { caption: copy.caption, hashtags: copy.hashtags }]));
}

function actions(out: CampaignOut): CampaignAction[] {
  const result = new Set<CampaignAction>();
  for (const action of out.allowed_actions) {
    if (action === "edit") result.add(out.status === "기획중" ? "save-plan" : "save-draft");
    if (action === "request-review") result.add("request-review");
    if (action === "approve") result.add("approve");
    if (action === "cancel") result.add("cancel");
    if (action === "performance") result.add("submit-performance");
    if (action === "complete-performance") result.add("complete-evaluation");
  }
  // 초안 생성 엔드포인트는 기획중에서만 받는다.
  if (out.status === "기획중") result.add("generate-draft");
  return [...result];
}

function findings(out: CampaignOut): RiskFinding[] {
  const first = out.channels[0];
  return (out.review?.findings ?? []).flatMap((item) => {
    const channel = item.channel === "legacy" ? first : item.channel;
    if (!channel) return [];
    return [{
      id: `${channel}-${item.start}-${item.end}-${item.rule}`, channel: TO_UI[channel], rule: item.rule, ruleLabel: RULE_LABEL[item.rule],
      quote: item.quote, title: `“${item.quote}”`, reason: item.reason,
      source: item.evidence_url ? { title: SOURCE_TITLE[item.rule], url: item.evidence_url } : undefined,
      suggestion: item.suggestion, replacement: item.suggestion, applied: false,
    }];
  });
}

function performance(out: PerformanceOut | null): Performance | undefined {
  if (!out) return undefined;
  return {
    impressions: out.impressions, clicks: out.clicks, conversions: out.conversions, cost: out.ad_spend, revenue: out.revenue,
    roas: out.roas === null ? null : Math.round(out.roas * 100),
    summary: out.summary ?? undefined,
    suggestions: out.suggestion ? out.suggestion.split(/\n+/).map((line) => line.replace(/^\s*(\d+[.)]|[-•])\s*/, "").trim()).filter(Boolean) : undefined,
    summaryError: out.status === "failed" ? "AI 요약을 만들지 못했어요. 숫자는 저장했어요. 다시 ‘요약 만들기’를 눌러 주세요." : undefined,
  };
}

export function campaignName(out: Pick<CampaignOut, "id" | "product_name" | "content">) {
  if (out.product_name) return `${out.product_name} 광고`;
  const text = out.content.trim();
  return text ? (text.length > 24 ? `${text.slice(0, 24)}…` : text) : `캠페인 #${out.id}`;
}

export function historyEntries(history: HistoryOut[], meId?: number): HistoryEntry[] {
  return history.filter((item) => item.previous_status !== null).map((item) => ({
    from: item.previous_status as CampaignStatus, to: item.next_status, at: item.recorded_at,
    actor: item.changed_by === meId ? "사장님" : `계정 #${item.changed_by}`,
    ...(item.next_status === "플랫폼 반려" && item.snapshot?.rejection_reason ? { reason: item.snapshot.rejection_reason } : {}),
  }));
}

export function toCampaign(out: CampaignOut, extra: { history?: HistoryOut[]; performance?: PerformanceOut | null; referenceName?: string } = {}): Campaign {
  const reviewState = out.review?.status;
  return {
    id: String(out.id), ownerId: String(out.owner_id), name: campaignName(out), status: out.status, updatedAt: out.updated_at,
    plan: {
      productName: out.product_name ?? "", productDescription: out.product_description ?? "",
      price: out.product_price === null ? "" : String(out.product_price),
      category: (CATEGORIES as string[]).includes(out.product_category ?? "") ? out.product_category as Category : "식품",
      goal: (GOALS as string[]).includes(out.goal ?? "") ? out.goal as Goal : "구매 늘리기",
      channels: out.channels.map((channel) => TO_UI[channel]),
      budgetAmount: String(out.initial_budget_amount), budgetDays: String(out.initial_budget_days),
    },
    drafts: Object.fromEntries(Object.entries(out.drafts).map(([channel, draft]) => [TO_UI[channel as ApiChannel], { caption: draft.caption, hashtags: draft.hashtags }])),
    reference: out.reference_campaign_id ? { id: String(out.reference_campaign_id), name: extra.referenceName ?? `캠페인 #${out.reference_campaign_id}`, roas: null } : undefined,
    findings: findings(out),
    canApprove: out.allowed_actions.includes("approve"),
    reviewError: reviewState === "failed" ? "검수 결과를 받지 못했어요. 잠시 뒤 다시 검수를 요청해 주세요." : undefined,
    reviewPending: reviewState === "pending",
    schedule: out.scheduled_at ? { scheduledAt: out.scheduled_at, amount: out.budget_amount ?? out.initial_budget_amount, days: out.budget_days ?? out.initial_budget_days } : undefined,
    publishedAt: out.published_at ?? undefined, endedAt: out.ended_at ?? undefined, rejectionReason: out.rejection_reason ?? undefined,
    performance: performance(extra.performance ?? null),
    history: extra.history ? historyEntries(extra.history, out.owner_id) : [],
    allowedActions: actions(out),
  };
}

async function getPerformance(id: string | number): Promise<PerformanceOut | null> {
  try { return await apiFetch<PerformanceOut>(`${BASE}/${id}/performance`); } catch (error) {
    if (error instanceof HttpError && error.kind === "not_found") return null;
    throw error;
  }
}
const hasPerformance = (status: CampaignStatus) => status === "종료" || status === "성과 평가 완료";

export function createHttpCampaignApi(): CampaignApi {
  async function load(id: string): Promise<Campaign> {
    const out = await apiFetch<CampaignOut>(`${BASE}/${encodeURIComponent(id)}`);
    const [history, perf, reference] = await Promise.all([
      apiFetch<HistoryOut[]>(`${BASE}/${out.id}/history`),
      hasPerformance(out.status) ? getPerformance(out.id) : Promise.resolve(null),
      out.reference_campaign_id ? apiFetch<CampaignOut>(`${BASE}/${out.reference_campaign_id}`).catch(() => null) : Promise.resolve(null),
    ]);
    return toCampaign(out, { history, performance: perf, referenceName: reference ? campaignName(reference) : undefined });
  }
  const get = (id: string) => call(() => load(id));
  const post = async (id: string, path: string, body?: unknown) => {
    await call(() => apiFetch<unknown>(`${BASE}/${encodeURIComponent(id)}/${path}`, { method: "POST", body }), id);
    return get(id);
  };
  async function summaries(): Promise<CampaignSummary[]> {
    const list = await apiFetch<{ items: CampaignOut[] }>(`${BASE}?limit=100`);
    const perf = await Promise.all(list.items.map((item) => (hasPerformance(item.status) ? getPerformance(item.id).catch(() => null) : Promise.resolve(null))));
    return list.items.map((item, index) => ({
      id: String(item.id), name: campaignName(item), status: item.status, updatedAt: item.updated_at,
      channels: item.channels.map((channel) => TO_UI[channel]),
      findingCount: item.status === "검수 대기" ? item.review?.findings.length ?? 0 : 0,
      roas: perf[index]?.roas == null ? null : Math.round((perf[index]?.roas as number) * 100),
    })).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }
  async function savePlan(id: string | null, plan: PlanInput): Promise<string> {
    if (id === null) return String((await apiFetch<CampaignOut>(BASE, { method: "POST", body: planBody(plan, true) })).id);
    await apiFetch<CampaignOut>(`${BASE}/${encodeURIComponent(id)}`, { method: "PATCH", body: planBody(plan, false) });
    return id;
  }

  return {
    listCampaigns: () => call(summaries),
    getCampaign: get,
    async getLatestEvaluated() {
      const items = await call(summaries);
      return items.find((item) => item.status === "성과 평가 완료") ?? null;
    },
    async savePlan(id, plan) {
      const saved = await call(() => savePlan(id, plan), id ?? undefined);
      return get(saved);
    },
    async generateDraft(id, plan) {
      const saved = await call(() => savePlan(id, plan), id ?? undefined);
      // 저장은 됐으니 초안 생성이 실패해도 같은 캠페인으로 다시 시도하게 id를 함께 돌려준다.
      await call(() => apiFetch<CampaignOut>(`${BASE}/${saved}/generate-draft`, { method: "POST" }), saved);
      return get(saved);
    },
    async saveDraft(id, channel, copy) {
      const current = await get(id);
      await call(() => apiFetch<CampaignOut>(`${BASE}/${encodeURIComponent(id)}`, { method: "PATCH", body: { drafts: apiDrafts({ ...current.drafts, [channel]: copy }) } }), id);
      return get(id);
    },
    async regenerateChannel() {
      throw new ApiError("conflict", "채널별 다시 만들기는 아직 백엔드에서 지원하지 않아요.");
    },
    requestReview: (id, drafts) => post(id, "request-review", drafts ? { drafts: apiDrafts(drafts) } : undefined),
    approve: (id) => post(id, "approve"),
    async submitPerformance(id, input: PerformanceInput) {
      const body = {
        impressions: toNumber(input.impressions), clicks: toNumber(input.clicks), conversions: toNumber(input.conversions),
        ad_spend: toNumber(input.cost), revenue: toNumber(input.revenue),
      };
      try {
        await call(() => apiFetch<PerformanceOut>(`${BASE}/${encodeURIComponent(id)}/performance`, { method: "PUT", body }), id);
      } catch (error) {
        // 요약(L3)만 실패하면 숫자와 ROAS는 저장돼 있으니 화면에서 보여 준다.
        if (error instanceof ApiError && error.code === "llm") return get(id);
        throw error;
      }
      return get(id);
    },
    completeEvaluation: (id) => post(id, "performance/complete"),
    cancel: (id) => post(id, "cancel"),
  };
}

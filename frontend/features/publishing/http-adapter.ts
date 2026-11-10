import { type CampaignOut, campaignName, historyEntries } from "@/features/campaigns/http-api";
import { HttpError, apiFetch } from "@/lib/api/http";
import { type Action, type Campaign, type Mutation, type PublishingAdapter, PublishingError } from "./model";

/* F-04 게시 화면용 FastAPI 연결. 허용 동작·검사·경고는 백엔드 응답을 그대로 쓴다. */

const BASE = "/api/v1/campaigns";
const CHANNEL: Record<string, string> = { instagram: "인스타그램", x: "X", tiktok: "틱톡" };
const ACTION: Record<string, Action> = { schedule: "schedule", publish: "publish", end: "end", reject: "reject", "request-revision": "revise", cancel: "cancel" };
const FIELD: Record<string, PublishingError["field"]> = { scheduled_at: "scheduledAt", budget_amount: "amount", budget_days: "days", reason: "reason" };
type HistoryOut = Parameters<typeof historyEntries>[0];

function toPublishingError(error: unknown): PublishingError {
  if (error instanceof PublishingError) return error;
  if (!(error instanceof HttpError)) return new PublishingError("network", "요청을 처리하지 못했습니다. 다시 시도해 주세요.");
  const [key, message] = Object.entries(error.fields)[0] ?? [];
  const field = key ? FIELD[key] : undefined;
  if (error.kind === "validation") {
    const text = message ?? error.message;
    // 게시 예정 시각 오류는 백엔드가 문자열로만 알려 주므로 칸을 직접 이어 준다.
    return new PublishingError("validation", text, field ?? (/게시 예정 시각/.test(text) ? "scheduledAt" : undefined));
  }
  const code = error.kind === "not_found" ? "not_found" : error.kind === "forbidden" || error.kind === "unauthorized" ? "forbidden" : error.kind === "conflict" ? "conflict" : "network";
  return new PublishingError(code, error.message);
}

function toPublishing(out: CampaignOut, history: HistoryOut): Campaign {
  const channels = out.channels.map((channel) => CHANNEL[channel]);
  const copies = out.channels.flatMap((channel) => {
    const draft = out.drafts[channel];
    return draft ? [{ channel: CHANNEL[channel], caption: draft.caption, hashtags: draft.hashtags }] : [];
  });
  return {
    id: String(out.id), ownerId: String(out.owner_id), name: campaignName(out), product: out.product_name ?? "", channels,
    caption: copies[0]?.caption ?? out.content, hashtags: copies[0]?.hashtags ?? [], copies, status: out.status,
    initialBudget: { amount: out.initial_budget_amount, days: out.initial_budget_days },
    schedule: out.scheduled_at ? { scheduledAt: out.scheduled_at, amount: out.budget_amount ?? out.initial_budget_amount, days: out.budget_days ?? out.initial_budget_days } : undefined,
    publishedAt: out.published_at ?? undefined, endedAt: out.ended_at ?? undefined, rejectionReason: out.rejection_reason ?? undefined,
    history: historyEntries(history, out.owner_id),
    allowedActions: out.allowed_actions.flatMap((action) => (ACTION[action] ? [ACTION[action]] : [])),
  };
}

function body(command: Mutation) {
  switch (command.action) {
    case "schedule": {
      const { scheduledAt, amount, days } = command.schedule;
      // 빈 칸·잘못된 값도 그대로 보내 백엔드가 어느 칸이 틀렸는지 알려 주게 한다.
      return { scheduled_at: scheduledAt || null, budget_amount: Number.isFinite(amount) ? amount : null, budget_days: Number.isFinite(days) ? days : null };
    }
    case "reject": return { reason: command.reason };
    default: return undefined;
  }
}
const PATH: Record<Mutation["action"], string> = { schedule: "schedule", publish: "publish", end: "end", reject: "reject", revise: "request-revision", cancel: "cancel" };

export function createHttpPublishingAdapter(): PublishingAdapter {
  async function load(id: string, out?: CampaignOut) {
    const [campaign, history] = await Promise.all([
      out ? Promise.resolve(out) : apiFetch<CampaignOut>(`${BASE}/${encodeURIComponent(id)}`),
      apiFetch<HistoryOut>(`${BASE}/${encodeURIComponent(id)}/history`),
    ]);
    return toPublishing(campaign, history);
  }
  return {
    async getCampaign(id) {
      try { return await load(id); } catch (error) { throw toPublishingError(error); }
    },
    async mutate(id, command) {
      try {
        const out = await apiFetch<CampaignOut>(`${BASE}/${encodeURIComponent(id)}/${PATH[command.action]}`, { method: "POST", body: body(command) });
        return { campaign: await load(id, out), warning: out.warnings[0] };
      } catch (error) { throw toPublishingError(error); }
    },
  };
}

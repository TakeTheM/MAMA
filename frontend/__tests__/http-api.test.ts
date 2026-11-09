import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { type CampaignOut, createHttpCampaignApi, toCampaign } from "../features/campaigns/http-api";
import { createHttpPublishingAdapter } from "../features/publishing/http-adapter";
import { apiFetch, auth, setAccessToken } from "../lib/api/http";

// backend/app/schemas.py CampaignOut 모양
function campaignOut(overrides: Partial<CampaignOut> = {}): CampaignOut {
  return {
    id: 7, owner_id: 1, content: "국산 귀리로 구운 그래놀라",
    product_name: "수제 그래놀라", product_description: "국산 귀리로 구운 그래놀라", product_category: "식품", product_price: 12900,
    goal: "구매 늘리기", target_audience: null, channels: ["instagram", "x"],
    drafts: { instagram: { caption: "100% 효과 그래놀라", hashtags: ["#그래놀라"] }, x: { caption: "[광고] 그래놀라", hashtags: ["#광고"] } },
    reference_campaign_id: null, revision: 3, status: "검수 대기",
    initial_budget_amount: 70000, initial_budget_days: 7, scheduled_at: null, budget_amount: null, budget_days: null,
    published_at: null, ended_at: null, created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-02T00:00:00Z",
    allowed_actions: ["approve", "request-review"], warnings: [], rejection_reason: null,
    review: { status: "passed", findings: [{ channel: "instagram", start: 0, end: 6, quote: "100% 효과", rule: "R3", reason: "효과를 단정하는 표현입니다.", evidence_url: "https://www.law.go.kr/법령/표시ㆍ광고의공정화에관한법률/제3조", suggestion: "꼼꼼하게 만든" }] },
    ...overrides,
  };
}
const json = (status: number, body: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;
let calls: { url: string; init: RequestInit }[] = [];
function stub(handler: Handler) {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => { calls.push({ url, init }); return handler(url, init); }));
}
beforeEach(() => setAccessToken("old-token"));
afterEach(() => { vi.unstubAllGlobals(); setAccessToken(null); });

test("401이면 CSRF 헤더로 재발급하고 새 토큰으로 다시 요청한다", async () => {
  stub((url, init) => {
    if (url === "/api/v1/auth/refresh") return json(200, { access_token: "new-token", token_type: "bearer", expires_in: 900 });
    const token = (init.headers as Record<string, string>).Authorization;
    return token === "Bearer new-token" ? json(200, { ok: true }) : json(401, { detail: "인증 정보가 올바르지 않거나 만료되었습니다" });
  });
  await expect(apiFetch("/api/v1/campaigns")).resolves.toEqual({ ok: true });
  const refresh = calls.find((call) => call.url === "/api/v1/auth/refresh");
  expect((refresh?.init.headers as Record<string, string>)["X-CSRF-Protection"]).toBe("1");
  expect(calls).toHaveLength(3);
});

test("로그인은 토큰을 메모리에 두고 이후 요청에 Bearer로 붙인다", async () => {
  setAccessToken(null);
  stub((url) => url.endsWith("/login") ? json(200, { access_token: "abc", token_type: "bearer", expires_in: 900 }) : json(200, { id: 1, email: "a@b.com", created_at: "2026-11-01T00:00:00Z" }));
  await auth.login("a@b.com", "password-123");
  await auth.me();
  expect((calls[1].init.headers as Record<string, string>).Authorization).toBe("Bearer abc");
  expect(calls[0].init.body).toBe(JSON.stringify({ email: "a@b.com", password: "password-123" }));
});

test("응답을 화면 모델로 옮긴다: 채널 이름, 경고, 승인 가능, 기록", () => {
  const campaign = toCampaign(campaignOut(), {
    history: [
      { id: 1, previous_status: null, next_status: "기획중", changed_by: 1, recorded_at: "2026-11-01T00:00:00Z", snapshot: {} },
      { id: 2, previous_status: "기획중", next_status: "초안 생성됨", changed_by: 1, recorded_at: "2026-11-01T01:00:00Z", snapshot: {} },
    ],
  });
  expect(campaign.plan.channels).toEqual(["인스타그램", "X"]);
  expect(campaign.drafts.인스타그램?.caption).toBe("100% 효과 그래놀라");
  expect(campaign.findings[0]).toMatchObject({ channel: "인스타그램", rule: "R3", ruleLabel: "거짓·과장", quote: "100% 효과", replacement: "꼼꼼하게 만든" });
  expect(campaign.canApprove).toBe(true);
  expect(campaign.allowedActions).toEqual(expect.arrayContaining(["approve", "request-review"]));
  expect(campaign.history).toEqual([{ from: "기획중", to: "초안 생성됨", at: "2026-11-01T01:00:00Z", actor: "사장님" }]);
  expect(toCampaign(campaignOut({ review: { status: "failed", findings: [] }, allowed_actions: ["request-review"] })).reviewError).toBeDefined();
});

test("새 캠페인 초안: 만든 뒤 초안을 요청하고, 초안이 실패하면 만든 id를 알려 준다", async () => {
  stub((url, init) => {
    if (url === "/api/v1/campaigns" && init.method === "POST") return json(201, campaignOut({ status: "기획중", allowed_actions: ["edit", "cancel"], review: null }));
    if (url.endsWith("/generate-draft")) return json(503, { detail: "LLM_API_KEY, LLM_BASE_URL, LLM_MODEL을 설정해 주세요" });
    return json(404, { detail: "없음" });
  });
  const api = createHttpCampaignApi();
  const plan = { productName: "수제 그래놀라", productDescription: "국산 귀리", price: "12,900", category: "식품" as const, goal: "구매 늘리기" as const, channels: ["인스타그램" as const], budgetAmount: "70000", budgetDays: "7" };
  await expect(api.generateDraft(null, plan)).rejects.toMatchObject({ code: "llm", campaignId: "7" });
  expect(JSON.parse(calls[0].init.body as string)).toMatchObject({ product_name: "수제 그래놀라", product_price: 12900, channels: ["instagram"], initial_budget_amount: 70000, initial_budget_days: 7, content: "국산 귀리" });
});

test("422 검사 오류를 입력칸 이름으로 바꾼다", async () => {
  stub(() => json(422, { detail: [{ loc: ["body", "initial_budget_days"], msg: "Input should be greater than 0", type: "greater_than" }] }));
  const api = createHttpCampaignApi();
  const plan = { productName: "a", productDescription: "b", price: "1", category: "식품" as const, goal: "구매 늘리기" as const, channels: [], budgetAmount: "1", budgetDays: "0" };
  await expect(api.savePlan(null, plan)).rejects.toMatchObject({ code: "validation", fields: { budgetDays: "Input should be greater than 0" } });
});

test("게시 화면: 예약 요청 본문과 24시간 경고, 반려 후 다시 고치기 연결", async () => {
  const scheduled = campaignOut({ status: "게시 예약됨", allowed_actions: ["publish", "reject", "cancel"], scheduled_at: "2026-11-10T01:00:00Z", budget_amount: 50000, budget_days: 5, warnings: ["플랫폼 심사에 24시간 여유가 없습니다"], review: null });
  stub((url) => {
    if (url.endsWith("/schedule")) return json(200, scheduled);
    if (url.endsWith("/history")) return json(200, []);
    if (url.endsWith("/request-revision")) return json(409, { detail: "현재 상태에서는 요청한 작업을 할 수 없습니다" });
    return json(200, scheduled);
  });
  const adapter = createHttpPublishingAdapter();
  const result = await adapter.mutate("7", { action: "schedule", schedule: { scheduledAt: "2026-11-10T01:00:00.000Z", amount: 50000, days: 5 } });
  expect(JSON.parse(calls[0].init.body as string)).toEqual({ scheduled_at: "2026-11-10T01:00:00.000Z", budget_amount: 50000, budget_days: 5 });
  expect(result.warning).toBe("플랫폼 심사에 24시간 여유가 없습니다");
  expect(result.campaign.allowedActions).toEqual(["publish", "reject", "cancel"]);
  await expect(adapter.mutate("7", { action: "revise" })).rejects.toMatchObject({ code: "conflict" });
  expect(calls.at(-1)?.url).toBe("/api/v1/campaigns/7/request-revision");
});

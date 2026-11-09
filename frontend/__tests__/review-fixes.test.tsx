import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { CampaignRoute } from "../components/campaign-route";
import { CampaignApiProvider, getDemoApi } from "../features/campaigns/api-context";
import { createMockCampaignApi } from "../features/campaigns/mock-api";
import { NewCampaignScreen } from "../features/campaigns/plan/plan-screen";
import { demoStoreAdapter } from "../features/publishing/demo-bridge";

const { push, replace } = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

test("게시 화면 브리지는 매번 공용 저장소를 읽고 새 기록만 덧붙인다", async () => {
  const store = getDemoApi();
  const adapter = demoStoreAdapter("b", { delay: 0 });
  if (!adapter) throw new Error("bridge missing");
  await adapter.getCampaign("b");
  await adapter.mutate("b", { action: "revise" });
  expect(store.peek("b")?.status).toBe("수정 요청");
  // 검수 화면에서 재검수·승인
  await store.requestReview("b");
  await store.approve("b");
  expect((await adapter.getCampaign("b")).status).toBe("승인됨");
  const length = store.peek("b")?.history.length ?? 0;
  await adapter.mutate("b", { action: "schedule", schedule: { scheduledAt: new Date(Date.now() + 72 * 3600000).toISOString(), amount: 10000, days: 3 } });
  const history = store.peek("b")?.history ?? [];
  expect(history).toHaveLength(length + 1);
  expect(history.map((entry) => entry.to)).toEqual(expect.arrayContaining(["수정 요청", "검수 대기", "승인됨", "게시 예약됨"]));
});

test("임시 저장 직후 다시 저장하거나 초안을 만들어도 캠페인이 하나만 생긴다", async () => {
  const api = createMockCampaignApi({ delay: 0 });
  const savePlan = vi.spyOn(api, "savePlan");
  render(<CampaignApiProvider api={api}><NewCampaignScreen /></CampaignApiProvider>);
  fireEvent.change(screen.getByLabelText("상품명"), { target: { value: "보리 쿠키" } });
  fireEvent.click(screen.getByRole("button", { name: "임시 저장" }));
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/campaigns/new-1/plan"));
  const save = screen.getByRole("button", { name: "저장 중…" }) as HTMLButtonElement;
  expect(save.disabled).toBe(true);
  expect((screen.getByRole("button", { name: "초안 만들기" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(save);
  fireEvent.click(screen.getByRole("button", { name: "초안 만들기" }));
  expect(savePlan).toHaveBeenCalledOnce();
  expect((await api.listCampaigns()).filter((item) => item.id.startsWith("new-"))).toHaveLength(1);
});

test("% 가 들어간 id도 화면이 깨지지 않고 그대로 넘긴다", async () => {
  const seen = vi.fn();
  const element = await CampaignRoute({ params: Promise.resolve({ campaignId: "100%할인" }), render: (id) => { seen(id); return id; } });
  render(element);
  await waitFor(() => expect(seen).toHaveBeenCalledWith("100%할인"));
});

test("요약이 없으면 백엔드가 평가 완료를 허용하지 않는다", async () => {
  const api = createMockCampaignApi({ delay: 0 });
  expect((await api.getCampaign("f")).allowedActions).not.toContain("complete-evaluation");
  const done = await api.submitPerformance("f", { impressions: "1", clicks: "1", conversions: "1", cost: "1", revenue: "1" });
  expect(done.allowedActions).toContain("complete-evaluation");
});

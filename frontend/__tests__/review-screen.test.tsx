import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { CampaignApiProvider } from "../features/campaigns/api-context";
import { createMockCampaignApi } from "../features/campaigns/mock-api";
import { ReviewScreen } from "../features/campaigns/review/review-screen";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const approveButton = () => screen.getByRole("button", { name: "승인" }) as HTMLButtonElement;

test("위험 표현마다 규칙·이유·근거·고쳐 쓴 문장을 보여 주고 승인은 꺼져 있다", async () => {
  render(<CampaignApiProvider api={createMockCampaignApi({ delay: 0 })}><ReviewScreen campaignId="a" /></CampaignApiProvider>);
  expect(await screen.findByText("위험 표현 2개를 찾았어요")).toBeDefined();
  expect(screen.getByText("R3 거짓·과장")).toBeDefined();
  expect(screen.getByText("R1 협찬 미표시")).toBeDefined();
  expect(screen.getByText("100% 천연 재료", { selector: "mark span" })).toBeDefined();
  expect(screen.getAllByRole("link", { name: /근거 자료/ })[0].getAttribute("target")).toBe("_blank");
  expect(approveButton().disabled).toBe(true);
  expect(screen.getByRole("tab", { name: /X/ })).toBeDefined();
});

test("제안을 적용하고 다시 검수하면 승인할 수 있고, 승인하면 게시 예약으로 간다", async () => {
  const api = createMockCampaignApi({ delay: 0 });
  render(<CampaignApiProvider api={api}><ReviewScreen campaignId="a" /></CampaignApiProvider>);
  await screen.findByText("위험 표현 2개를 찾았어요");
  for (let i = 0; i < 2; i += 1) {
    fireEvent.click(screen.getAllByRole("button", { name: "적용" })[0]);
    await screen.findByText("고쳐 쓴 문장을 적용했어요. 다시 검수를 요청해 주세요.");
  }
  expect(screen.getAllByRole("button", { name: "적용됨" })).toHaveLength(2);
  expect(approveButton().disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "다시 검수 요청" }));
  expect(await screen.findByText("위험 표현이 없어요")).toBeDefined();
  expect(approveButton().disabled).toBe(false);
  fireEvent.click(approveButton());
  await waitFor(() => expect(push).toHaveBeenCalledWith("/campaigns/a/publishing/schedule"));
  const saved = await api.getCampaign("a");
  expect(saved.status).toBe("승인됨");
  expect(saved.history.at(-1)).toMatchObject({ from: "검수 대기", to: "승인됨", actor: "seller-demo" });
});

test("직접 고친 문구도 금지어 규칙으로 다시 거른다", async () => {
  render(<CampaignApiProvider api={createMockCampaignApi({ delay: 0 })}><ReviewScreen campaignId="a" /></CampaignApiProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "직접 고치기" }));
  fireEvent.change(screen.getByLabelText("캡션"), { target: { value: "업계 최고 그래놀라" } });
  fireEvent.change(screen.getByLabelText(/해시태그/), { target: { value: "#광고 #그래놀라" } });
  fireEvent.click(screen.getByRole("button", { name: "다시 검수 요청" }));
  expect(await screen.findByText("위험 표현 1개를 찾았어요")).toBeDefined();
  expect(screen.getByText("업계 최고", { selector: "mark span" })).toBeDefined();
  expect(approveButton().disabled).toBe(true);
});

test("검수 실패면 오류를 보여 주고 승인은 꺼진 채로 다시 요청할 수 있다", async () => {
  const failing = createMockCampaignApi({ delay: 0, failNext: "llm" });
  await failing.requestReview("c");
  render(<CampaignApiProvider api={failing}><ReviewScreen campaignId="c" /></CampaignApiProvider>);
  expect(await screen.findByText("검수를 마치지 못했어요")).toBeDefined();
  expect(approveButton().disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "다시 검수 요청" }));
  expect(await screen.findByText(/위험 표현 \d+개를 찾았어요/)).toBeDefined();
});

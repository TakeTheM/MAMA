import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { CampaignApiProvider } from "../features/campaigns/api-context";
import { createMockCampaignApi } from "../features/campaigns/mock-api";
import { PerformanceScreen } from "../features/campaigns/performance/performance-screen";

afterEach(cleanup);
const fill = (values: Record<string, string>) => { for (const [label, value] of Object.entries(values)) fireEvent.change(screen.getByLabelText(label), { target: { value } }); };
const complete = () => screen.getByRole("button", { name: "평가 완료" }) as HTMLButtonElement;

test("빈 칸이나 음수면 거절하고 요약 전에는 평가 완료를 막는다", async () => {
  render(<CampaignApiProvider api={createMockCampaignApi({ delay: 0 })}><PerformanceScreen campaignId="f" /></CampaignApiProvider>);
  await screen.findByLabelText("노출");
  expect(complete().disabled).toBe(true);
  fill({ 노출: "1000", 클릭: "-1" });
  fireEvent.click(screen.getByRole("button", { name: "요약 만들기" }));
  expect(await screen.findByText("0 이상의 숫자로 입력해 주세요")).toBeDefined();
  expect(screen.getByLabelText("클릭").getAttribute("aria-invalid")).toBe("true");
  expect(screen.getAllByText("값을 입력해 주세요").length).toBe(3);
});

test("시스템이 ROAS를 계산하고 요약 확인 후 평가를 완료한다", async () => {
  const api = createMockCampaignApi({ delay: 0 });
  render(<CampaignApiProvider api={api}><PerformanceScreen campaignId="f" /></CampaignApiProvider>);
  await screen.findByLabelText("노출");
  fill({ 노출: "12000", 클릭: "480", 전환: "36", 광고비: "50000", 매출: "144000" });
  fireEvent.click(screen.getByRole("button", { name: "요약 만들기" }));
  expect(await screen.findByText("288%")).toBeDefined();
  expect(screen.getByText(/2\.9배/)).toBeDefined();
  expect(screen.getAllByRole("listitem").length).toBeGreaterThanOrEqual(3);
  fireEvent.click(complete());
  expect(await screen.findByText(/평가를 마친 캠페인이에요/)).toBeDefined();
  expect((await api.getCampaign("f")).status).toBe("성과 평가 완료");
});

test("광고비가 0이면 ROAS는 계산할 수 없음으로 보여 준다", async () => {
  render(<CampaignApiProvider api={createMockCampaignApi({ delay: 0 })}><PerformanceScreen campaignId="f" /></CampaignApiProvider>);
  await screen.findByLabelText("노출");
  fill({ 노출: "100", 클릭: "0", 전환: "0", 광고비: "0", 매출: "0" });
  fireEvent.click(screen.getByRole("button", { name: "요약 만들기" }));
  expect(await screen.findByText("계산할 수 없음")).toBeDefined();
});

test("AI 요약이 실패해도 숫자는 저장하고 평가 완료는 막는다", async () => {
  render(<CampaignApiProvider api={createMockCampaignApi({ delay: 0, failNext: "llm" })}><PerformanceScreen campaignId="f" /></CampaignApiProvider>);
  await screen.findByLabelText("노출");
  fill({ 노출: "1000", 클릭: "50", 전환: "5", 광고비: "10000", 매출: "30000" });
  fireEvent.click(screen.getByRole("button", { name: "요약 만들기" }));
  expect(await screen.findByText(/AI 요약을 만들지 못했어요/)).toBeDefined();
  expect(screen.getByText("300%")).toBeDefined();
  expect(complete().disabled).toBe(true);
});

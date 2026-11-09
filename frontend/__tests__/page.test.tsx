import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { CampaignApiProvider } from "../features/campaigns/api-context";
import { CampaignListScreen, PerformanceListScreen } from "../features/campaigns/list/campaign-list";
import { createMockCampaignApi } from "../features/campaigns/mock-api";

afterEach(cleanup);

test("캠페인 목록은 상태 요약과 다음 할 일을 보여 주고 상태로 거른다", async () => {
  render(<CampaignApiProvider api={createMockCampaignApi({ delay: 0 })}><CampaignListScreen /></CampaignApiProvider>);
  expect(screen.getByRole("heading", { name: "캠페인" })).toBeDefined();
  const table = await screen.findByRole("table");
  expect(within(table).getAllByRole("row")).toHaveLength(9);
  expect(screen.getByText("위험 표현 2개 고치기")).toBeDefined();
  expect(screen.getByRole("link", { name: "제철 사과 선물세트" }).getAttribute("href")).toBe("/campaigns/d/publishing/schedule");
  expect(screen.getByRole("link", { name: "수제 쿠키 박스" }).getAttribute("href")).toBe("/campaigns/f/performance");
  fireEvent.click(screen.getByRole("button", { name: "조치 필요 2" }));
  expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(3);
  expect(screen.getByRole("button", { name: "조치 필요 2" }).getAttribute("aria-pressed")).toBe("true");
});

test("목록을 못 불러오면 다시 시도할 수 있다", async () => {
  render(<CampaignApiProvider api={createMockCampaignApi({ delay: 0, failNext: "load" })}><CampaignListScreen /></CampaignApiProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "다시 시도" }));
  expect(await screen.findByRole("table")).toBeDefined();
});

test("성과 기록은 끝난 광고만 ROAS와 함께 보여 준다", async () => {
  render(<CampaignApiProvider api={createMockCampaignApi({ delay: 0 })}><PerformanceListScreen /></CampaignApiProvider>);
  const table = await screen.findByRole("table");
  expect(within(table).getAllByRole("row")).toHaveLength(3);
  expect(screen.getByText("312%")).toBeDefined();
  expect(screen.getByText("성과 숫자 입력")).toBeDefined();
});

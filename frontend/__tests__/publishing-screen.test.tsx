import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { PublishingShell, RecordsScreen, ScheduleScreen } from "../features/publishing/publishing-screen";
import { PublishingProvider } from "../features/publishing/publishing-session";
import { createMockAdapter } from "../features/publishing/mock-adapter";
import { type PublishingAdapter, REVIEW_WARNING, toSeoulInput } from "../features/publishing/model";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function Harness({ mode = "schedule", adapter }: { mode?: "schedule" | "records"; adapter?: PublishingAdapter }) {
  return <PublishingProvider campaignId="demo" adapter={adapter}><PublishingShell>{mode === "schedule" ? <ScheduleScreen /> : <RecordsScreen />}</PublishingShell></PublishingProvider>;
}
function fillPlan(hours = 48) {
  const value = toSeoulInput(new Date(Date.now() + hours * 3600000).toISOString());
  fireEvent.change(screen.getByLabelText("게시 예정일"), { target: { value: value.slice(0, 10) } });
  fireEvent.change(screen.getByLabelText("시각"), { target: { value: value.slice(11) } });
}

test("예약 성공 후 기록 경로로 이동하고 두 화면 사이 데이터와 이력을 유지한다", async () => {
  const adapter = createMockAdapter({ delay: 0 });
  const getCampaign = vi.spyOn(adapter, "getCampaign");
  const view = render(<Harness adapter={adapter} />);
  expect(screen.getByRole("status").textContent).toContain("불러오는 중");
  const amount = await screen.findByLabelText("금액 (원)") as HTMLInputElement;
  expect(amount.value).toBe("70000");
  expect((screen.getByLabelText("기간 (일)") as HTMLInputElement).value).toBe("7");
  fillPlan();
  fireEvent.change(amount, { target: { value: "50000" } });
  fireEvent.click(screen.getByRole("button", { name: "게시 예약" }));
  await waitFor(() => expect(push).toHaveBeenCalledWith("/campaigns/demo/publishing"));
  view.rerender(<Harness mode="records" adapter={adapter} />);
  fireEvent.click(await screen.findByRole("button", { name: "게시함" }));
  fireEvent.click(await screen.findByRole("button", { name: "종료 기록" }));
  expect(await screen.findByText(/광고 집행 기록을 마쳤습니다/)).toBeDefined();
  expect(screen.getByText("4건")).toBeDefined();
  view.rerender(<Harness mode="schedule" adapter={adapter} />);
  expect(screen.getByRole("heading", { name: "저장된 게시 계획" })).toBeDefined();
  expect(screen.getByText("50,000원")).toBeDefined();
  expect(screen.queryByRole("button", { name: "게시 예약" })).toBeNull();
  view.rerender(<Harness mode="records" adapter={adapter} />);
  expect(screen.getByText("4건")).toBeDefined();
  expect(getCampaign).toHaveBeenCalledTimes(1);
});

test("저장 실패 시 입력 보존·재시도·중복 제출 방지", async () => {
  const adapter = createMockAdapter({ delay: 20, scenario: "save-error" });
  const mutate = vi.spyOn(adapter, "mutate");
  render(<Harness adapter={adapter} />);
  const amount = await screen.findByLabelText("금액 (원)") as HTMLInputElement;
  fillPlan();
  fireEvent.change(amount, { target: { value: "50000" } });
  const save = screen.getByRole("button", { name: "게시 예약" });
  fireEvent.click(save); fireEvent.click(save);
  expect((save as HTMLButtonElement).disabled).toBe(true);
  expect(await screen.findByRole("alert")).toBeDefined();
  expect(amount.value).toBe("50000");
  expect((screen.getByLabelText("게시 예정일") as HTMLInputElement).value).not.toBe("");
  expect(mutate).toHaveBeenCalledTimes(1);
  expect(push).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "게시 예약" }));
  await waitFor(() => expect(push).toHaveBeenCalledOnce());
});

test("날짜와 시각을 모두 요구하고 오류를 입력에 연결한다", async () => {
  render(<Harness adapter={createMockAdapter({ delay: 0 })} />);
  await screen.findByLabelText("금액 (원)");
  fireEvent.click(screen.getByRole("button", { name: "게시 예약" }));
  expect(await screen.findByRole("alert")).toBeDefined();
  for (const label of ["게시 예정일", "시각"]) {
    expect(screen.getByLabelText(label).getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByLabelText(label).getAttribute("aria-describedby")).toContain("action-error");
  }
  expect(push).not.toHaveBeenCalled();
});

test("입력 중 24시간 미만 경고를 표시하며 저장은 허용한다", async () => {
  render(<Harness adapter={createMockAdapter({ delay: 0 })} />);
  await screen.findByLabelText("금액 (원)");
  fillPlan(2);
  expect(screen.getByText(REVIEW_WARNING)).toBeDefined();
  fillPlan(25);
  expect(screen.queryByText(REVIEW_WARNING)).toBeNull();
  fillPlan(2);
  fireEvent.click(screen.getByRole("button", { name: "게시 예약" }));
  await waitFor(() => expect(push).toHaveBeenCalledOnce());
});

test("반려 입력은 항상 펼쳐지며 수정 요청에도 사유가 유지된다", async () => {
  render(<Harness mode="records" adapter={createMockAdapter({ scenario: "scheduled", delay: 0 })} />);
  const reason = await screen.findByLabelText(/반려 사유/);
  expect(reason.closest("details")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "반려 기록" }));
  expect((await screen.findByRole("alert")).textContent).toBe("반려 사유를 입력해 주세요.");
  expect(reason.getAttribute("aria-invalid")).toBe("true");
  fireEvent.change(reason, { target: { value: "상품 페이지 확인 필요" } });
  fireEvent.click(screen.getByRole("button", { name: "반려 기록" }));
  fireEvent.click(await screen.findByRole("button", { name: "다시 고치기" }));
  expect(await screen.findByText(/수정 화면은 F-03/)).toBeDefined();
  expect(screen.getAllByText("상품 페이지 확인 필요")).toHaveLength(2);
});

test("조회 실패에서 재시도한다", async () => {
  render(<Harness adapter={createMockAdapter({ scenario: "load-error", delay: 0 })} />);
  fireEvent.click(await screen.findByRole("button", { name: "다시 시도" }));
  expect(await screen.findByLabelText("게시 예정일")).toBeDefined();
});

test.each([["missing", "캠페인이 없습니다"], ["forbidden", "접근 권한이 없습니다"]] as const)("%s 오류에서 작업을 노출하지 않는다", async (scenario, title) => {
  render(<Harness adapter={createMockAdapter({ scenario, delay: 0 })} />);
  expect(await screen.findByRole("heading", { name: title })).toBeDefined();
  expect(screen.queryByRole("button", { name: "게시 예약" })).toBeNull();
});

test("승인됨에서 기록 경로로 직접 접근하면 예약 링크를 제공한다", async () => {
  render(<Harness mode="records" adapter={createMockAdapter({ delay: 0 })} />);
  expect((await screen.findByRole("link", { name: "게시 시각·예산 정하기" })).getAttribute("href")).toBe("/campaigns/demo/publishing/schedule");
  expect(screen.queryByRole("button", { name: "게시함" })).toBeNull();
});

test("시나리오 변경과 Provider 재생성은 세션을 초기화한다", async () => {
  const view = render(<Harness />);
  await screen.findByLabelText("금액 (원)");
  fireEvent.click(screen.getByText("데모 도구"));
  fireEvent.change(screen.getByLabelText("테스트 시나리오"), { target: { value: "running" } });
  await screen.findByRole("heading", { name: "저장된 게시 계획" });
  view.rerender(<Harness mode="records" />);
  expect(await screen.findByRole("button", { name: "종료 기록" })).toBeDefined();
  expect(screen.getByText("3건")).toBeDefined();
  fireEvent.change(screen.getByLabelText("테스트 시나리오"), { target: { value: "approved" } });
  expect(await screen.findByRole("link", { name: "게시 시각·예산 정하기" })).toBeDefined();
  expect(screen.getByText("1건")).toBeDefined();
  view.unmount();
  render(<Harness mode="records" />);
  expect(await screen.findByRole("link", { name: "게시 시각·예산 정하기" })).toBeDefined();
  expect(screen.getByText("1건")).toBeDefined();
});

test("현재 단계와 실제 승인 정보를 표시하며 범위 밖 취소 기능은 추가하지 않는다", async () => {
  render(<Harness adapter={createMockAdapter({ delay: 0 })} />);
  await screen.findByLabelText("게시 예정일");
  expect(screen.getByRole("list", { name: "진행 단계" }).querySelector('[aria-current="step"]')?.textContent).toBe("04 게시 예약");
  expect(screen.getByRole("heading", { name: "승인된 문구" })).toBeDefined();
  expect(screen.getByText(/오후에 따뜻한 한 잔/)).toBeDefined();
  expect(screen.queryByRole("button", { name: "캠페인 취소" })).toBeNull();
});

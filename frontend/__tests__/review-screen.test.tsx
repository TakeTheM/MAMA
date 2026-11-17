import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { CampaignApiProvider } from "../features/campaigns/api-context";
import { createMockCampaignApi } from "../features/campaigns/mock-api";
import type { RiskFinding } from "../features/campaigns/model";
import { REVIEW_POLL_MS, ReviewScreen, applyFinding, canApply } from "../features/campaigns/review/review-screen";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const approveButton = () => screen.getByRole("button", { name: "승인" }) as HTMLButtonElement;

test("위험 표현은 경고로 보여 주고, 검수를 마쳤으면 승인 버튼이 켜진다", async () => {
  render(<CampaignApiProvider api={createMockCampaignApi({ delay: 0 })}><ReviewScreen campaignId="a" /></CampaignApiProvider>);
  expect(await screen.findByText("위험 표현 2개를 찾았어요")).toBeDefined();
  expect(screen.getByText("R3 거짓·과장")).toBeDefined();
  expect(screen.getByText("R1 협찬 미표시")).toBeDefined();
  expect(screen.getByText("100% 천연 재료", { selector: "mark span" })).toBeDefined();
  expect(screen.getAllByRole("link", { name: /근거 자료/ })[0].getAttribute("target")).toBe("_blank");
  expect(approveButton().disabled).toBe(false);
  expect(screen.getByText("경고 2개를 확인했다면 그대로 승인할 수 있어요")).toBeDefined();
});

test("경고가 남아 있으면 한 번 더 확인받고 승인한다", async () => {
  const api = createMockCampaignApi({ delay: 0 });
  render(<CampaignApiProvider api={api}><ReviewScreen campaignId="a" /></CampaignApiProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "승인" }));
  expect(screen.getByRole("alertdialog", { name: "경고 2개가 남아 있어요. 이대로 승인할까요?" })).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "돌아가기" }));
  expect(screen.queryByRole("alertdialog")).toBeNull();
  fireEvent.click(approveButton());
  fireEvent.click(screen.getByRole("button", { name: "그대로 승인" }));
  await waitFor(() => expect(push).toHaveBeenCalledWith("/campaigns/a/publishing/schedule"));
  const saved = await api.getCampaign("a");
  expect(saved.status).toBe("승인됨");
  expect(saved.history.at(-1)).toMatchObject({ from: "검수 대기", to: "승인됨", actor: "seller-demo" });
});

test("제안을 모두 적용하고 다시 검수하면 경고 없이 바로 승인한다", async () => {
  render(<CampaignApiProvider api={createMockCampaignApi({ delay: 0 })}><ReviewScreen campaignId="a" /></CampaignApiProvider>);
  await screen.findByText("위험 표현 2개를 찾았어요");
  fireEvent.click(screen.getByRole("button", { name: "적용" }));
  fireEvent.click(screen.getByRole("button", { name: "#광고 붙이기" }));
  expect(screen.getAllByRole("button", { name: "적용됨" })).toHaveLength(2);
  expect(screen.getByText("고친 문구로 다시 검수를 요청해 주세요")).toBeDefined();
  expect(approveButton().disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "다시 검수 요청" }));
  expect(await screen.findByText("위험 표현이 없어요")).toBeDefined();
  await waitFor(() => expect(approveButton().disabled).toBe(false));
  fireEvent.click(approveButton());
  expect(screen.queryByRole("alertdialog")).toBeNull();
  await waitFor(() => expect(push).toHaveBeenCalledWith("/campaigns/a/publishing/schedule"));
});

test("제안을 적용해도 위쪽 안내 띠는 그대로 두고, 바뀐 자리만 표시한다", async () => {
  render(<CampaignApiProvider api={createMockCampaignApi({ delay: 0 })}><ReviewScreen campaignId="a" /></CampaignApiProvider>);
  const banner = await screen.findByText("위험 표현 2개를 찾았어요");
  fireEvent.click(screen.getAllByRole("button", { name: "적용" })[0]);
  expect(screen.getByText("위험 표현 2개를 찾았어요")).toBe(banner);
  expect([...document.querySelectorAll("ins")].filter((node) => node.querySelector("sup"))).toHaveLength(1);
  expect(screen.getByText("고친 문구로 다시 검수를 요청해 주세요")).toBeDefined();
});

test("검수 뒤 직접 고치면 다시 검수할 때까지 승인을 막고, 고친 문구를 보내 다시 거른다", async () => {
  render(<CampaignApiProvider api={createMockCampaignApi({ delay: 0 })}><ReviewScreen campaignId="a" /></CampaignApiProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "직접 고치기" }));
  fireEvent.change(screen.getByLabelText("캡션"), { target: { value: "업계 최고 그래놀라" } });
  fireEvent.change(screen.getByLabelText(/해시태그/), { target: { value: "#광고 #그래놀라" } });
  fireEvent.click(screen.getByRole("button", { name: "고치기 마침" }));
  expect(screen.getByText("고친 문구로 다시 검수를 요청해 주세요")).toBeDefined();
  expect(approveButton().disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "다시 검수 요청" }));
  expect(await screen.findByText("위험 표현 1개를 찾았어요")).toBeDefined();
  expect(screen.getByText("업계 최고", { selector: "mark span" })).toBeDefined();
  expect(approveButton().disabled).toBe(false);
});

test("검수 실패면 오류를 보여 주고 승인은 꺼진 채로 다시 요청할 수 있다", async () => {
  const failing = createMockCampaignApi({ delay: 0, failNext: "llm" });
  await failing.requestReview("c");
  render(<CampaignApiProvider api={failing}><ReviewScreen campaignId="c" /></CampaignApiProvider>);
  expect(await screen.findByText("검수를 마치지 못했어요")).toBeDefined();
  expect(approveButton().disabled).toBe(true);
  await expect(failing.approve("c")).rejects.toMatchObject({ code: "conflict" });
  fireEvent.click(screen.getByRole("button", { name: "다시 검수 요청" }));
  expect(await screen.findByText(/위험 표현 \d+개를 찾았어요/)).toBeDefined();
  expect(approveButton().disabled).toBe(false);
});

test("제안을 차례로 적용해도 앞서 고친 표현이 되돌아오지 않는다", () => {
  const finding = (id: string, quote: string, replacement: string): RiskFinding => ({
    id, channel: "인스타그램", rule: "R3", ruleLabel: "거짓·과장", quote, title: quote, reason: "", suggestion: replacement, replacement, applied: false,
  });
  const first = applyFinding({ caption: "업계 최고 상품! 무조건 만족해요.", hashtags: ["#광고"] }, finding("1", "업계 최고", "꼼꼼하게 만든"));
  const second = first && applyFinding(first, finding("2", "무조건", "대부분"));
  expect(second?.caption).toBe("꼼꼼하게 만든 상품! 대부분 만족해요.");
  expect(second && applyFinding(second, finding("1", "업계 최고", "꼼꼼하게 만든"))).toBeNull();
  const tag = applyFinding({ caption: "가을 신상", hashtags: ["#최고급"] }, finding("3", "최고급", "고급"));
  expect(tag?.hashtags).toEqual(["#고급"]);
});

test("바꿀 문구가 없는 경고는 적용 버튼 대신 직접 고치라고 안내하고, 광고 표시 누락은 #광고를 붙인다", () => {
  const base = { channel: "인스타그램" as const, title: "", reason: "", applied: false };
  const advice: RiskFinding = { ...base, id: "1", rule: "R3", ruleLabel: "거짓·과장", quote: "업계 1위", suggestion: "객관적 근거를 밝히거나 빼 주세요" };
  expect(canApply(advice)).toBe(false);
  expect(applyFinding({ caption: "업계 1위 빵", hashtags: [] }, advice)).toBeNull();
  const adMark: RiskFinding = { ...base, id: "2", rule: "R1", ruleLabel: "협찬 미표시", quote: "추천해요", suggestion: "광고임을 알려 주세요" };
  expect(canApply(adMark)).toBe(true);
  expect(applyFinding({ caption: "추천해요", hashtags: ["#빵"] }, adMark)?.hashtags).toEqual(["#광고", "#빵"]);
  const removal: RiskFinding = { ...advice, id: "3", replacement: "" };
  expect(applyFinding({ caption: "업계 1위 빵", hashtags: [] }, removal)?.caption).toBe(" 빵");
});

test("직접 고치기에서 해시태그 뒤에 띄어쓰기를 치고 새 태그를 이어 쓸 수 있다", async () => {
  render(<CampaignApiProvider api={createMockCampaignApi({ delay: 0 })}><ReviewScreen campaignId="a" /></CampaignApiProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "직접 고치기" }));
  const input = screen.getByLabelText(/해시태그/) as HTMLInputElement;
  fireEvent.change(input, { target: { value: "#광고 " } });
  expect(input.value).toBe("#광고 ");
  fireEvent.change(input, { target: { value: "#광고 그래놀라" } });
  fireEvent.click(screen.getByRole("button", { name: "고치기 마침" }));
  expect(screen.getByText(/#광고 #그래놀라/)).toBeDefined();
});


test("제안을 적용한 뒤 다른 화면으로 가려 하면 다시 검수 전이라고 묻는다", async () => {
  window.history.replaceState(null, "", "/campaigns/a/review");
  render(<CampaignApiProvider api={createMockCampaignApi({ delay: 0 })}><ReviewScreen campaignId="a" /></CampaignApiProvider>);
  await screen.findByText("위험 표현 2개를 찾았어요");
  fireEvent.click(screen.getByRole("button", { name: "적용" }));
  fireEvent.click(screen.getByRole("link", { name: "캠페인" }));
  expect(screen.getByRole("alertdialog", { name: "고친 내용이 저장되지 않았어요" })).toBeDefined();
  expect(push).not.toHaveBeenCalled();
});

test("다른 곳에서 요청한 검수가 진행 중이면 새로고침하지 않아도 끝나는 대로 결과를 보여 준다", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    const api = createMockCampaignApi({ delay: 0 });
    const base = await api.getCampaign("a");
    let calls = 0;
    const polling = { ...api, getCampaign: async (id: string) => (++calls === 1 ? { ...base, reviewPending: true, canApprove: false } : api.getCampaign(id)) };
    render(<CampaignApiProvider api={polling}><ReviewScreen campaignId="a" /></CampaignApiProvider>);
    expect(await screen.findByText("검수하고 있어요")).toBeDefined();
    await vi.advanceTimersByTimeAsync(REVIEW_POLL_MS);
    expect(await screen.findByText("위험 표현 2개를 찾았어요")).toBeDefined();
  } finally {
    vi.useRealTimers();
  }
});

test("문구 속 경고 번호를 누르면 그 경고 카드로 옮겨 간다", async () => {
  render(<CampaignApiProvider api={createMockCampaignApi({ delay: 0 })}><ReviewScreen campaignId="a" /></CampaignApiProvider>);
  await screen.findByText("위험 표현 2개를 찾았어요");
  fireEvent.click(screen.getByRole("button", { name: "경고 1 설명 보기" }));
  const card = document.activeElement as HTMLElement;
  expect(card.tagName).toBe("ARTICLE");
  expect(card.textContent).toContain("이렇게 바꿔 보세요");
});

test("저장 안 하고 나가기 상자에서는 Tab 키가 상자 안에서만 돈다", async () => {
  window.history.replaceState(null, "", "/campaigns/a/review");
  render(<CampaignApiProvider api={createMockCampaignApi({ delay: 0 })}><ReviewScreen campaignId="a" /></CampaignApiProvider>);
  await screen.findByText("위험 표현 2개를 찾았어요");
  fireEvent.click(screen.getByRole("button", { name: "적용" }));
  fireEvent.click(screen.getByRole("link", { name: "캠페인" }));
  const dialog = screen.getByRole("alertdialog", { name: "고친 내용이 저장되지 않았어요" });
  expect(dialog.getAttribute("aria-modal")).toBe("true");
  const back = screen.getByRole("button", { name: "돌아가기" });
  const leave = screen.getByRole("button", { name: "저장하지 않고 나가기" });
  expect(document.activeElement).toBe(back);
  leave.focus();
  fireEvent.keyDown(leave, { key: "Tab" });
  expect(document.activeElement).toBe(back);
  fireEvent.keyDown(back, { key: "Tab", shiftKey: true });
  expect(document.activeElement).toBe(leave);
  fireEvent.keyDown(leave, { key: "Escape" });
  expect(screen.queryByRole("alertdialog")).toBeNull();
});


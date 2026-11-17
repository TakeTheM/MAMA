import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { CampaignApiProvider } from "../features/campaigns/api-context";
import { DraftScreen } from "../features/campaigns/draft/draft-screen";
import { createMockCampaignApi } from "../features/campaigns/mock-api";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

test("채널별로 캡션과 해시태그를 고치고 저장한다", async () => {
  const api = createMockCampaignApi({ delay: 0 });
  render(<CampaignApiProvider api={api}><DraftScreen campaignId="c" /></CampaignApiProvider>);
  expect(await screen.findByText(/참고한 캠페인: 가을 밤 라떼/)).toBeDefined();
  fireEvent.click(screen.getByRole("tab", { name: "X" }));
  expect(screen.getByRole("tab", { name: "X" }).getAttribute("aria-selected")).toBe("true");
  fireEvent.change(screen.getByLabelText("캡션"), { target: { value: "[광고] 유자 향 핸드크림 나왔어요" } });
  fireEvent.change(screen.getByLabelText("해시태그 추가"), { target: { value: "핸드크림" } });
  fireEvent.keyDown(screen.getByLabelText("해시태그 추가"), { key: "Enter" });
  fireEvent.click(screen.getByRole("button", { name: "#소상공인 삭제" }));
  expect(screen.getByText("X 미리보기")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "저장" }));
  expect(await screen.findByText("저장했어요.")).toBeDefined();
  const saved = await api.getCampaign("c");
  expect(saved.drafts.X?.caption).toBe("[광고] 유자 향 핸드크림 나왔어요");
  expect(saved.drafts.X?.hashtags).toContain("#핸드크림");
  expect(saved.drafts.X?.hashtags).not.toContain("#소상공인");
  expect(saved.status).toBe("초안 생성됨");
});

test("캡션이 빈 채널이 있으면 검수 요청을 거절한다", async () => {
  render(<CampaignApiProvider api={createMockCampaignApi({ delay: 0 })}><DraftScreen campaignId="c" /></CampaignApiProvider>);
  fireEvent.change(await screen.findByLabelText("캡션"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "검수 요청" }));
  expect((await screen.findByRole("alert")).textContent).toContain("인스타그램 캡션이 비어 있어요");
  expect(push).not.toHaveBeenCalled();
});

test("검수 요청하면 검수 결과 화면으로 이동한다", async () => {
  const api = createMockCampaignApi({ delay: 0 });
  render(<CampaignApiProvider api={api}><DraftScreen campaignId="c" /></CampaignApiProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "검수 요청" }));
  await waitFor(() => expect(push).toHaveBeenCalledWith("/campaigns/c/review"));
  expect((await api.getCampaign("c")).status).toBe("검수 대기");
});

test("초안 단계가 아니면 편집을 막고 지금 단계로 안내한다", async () => {
  render(<CampaignApiProvider api={createMockCampaignApi({ delay: 0 })}><DraftScreen campaignId="d" /></CampaignApiProvider>);
  expect((await screen.findByRole("link", { name: "지금 단계 화면으로 가기" })).getAttribute("href")).toBe("/campaigns/d/publishing/schedule");
  expect(screen.queryByLabelText("캡션")).toBeNull();
});

test("캠페인을 확인 후 취소한다", async () => {
  render(<CampaignApiProvider api={createMockCampaignApi({ delay: 0 })}><DraftScreen campaignId="c" /></CampaignApiProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "캠페인 취소" }));
  fireEvent.click(screen.getByRole("button", { name: "취소하기" }));
  expect(await screen.findByText(/취소된 캠페인입니다/)).toBeDefined();
  expect(screen.queryByRole("button", { name: "캠페인 취소" })).toBeNull();
});

test("저장해도 보던 채널 탭이 유지되고 다시 만들기는 그 채널만 바꾼다", async () => {
  const api = createMockCampaignApi({ delay: 0 });
  render(<CampaignApiProvider api={api}><DraftScreen campaignId="c" /></CampaignApiProvider>);
  fireEvent.change(await screen.findByLabelText("캡션"), { target: { value: "인스타 문구 고침" } });
  fireEvent.click(screen.getByRole("tab", { name: /^X/ }));
  fireEvent.click(screen.getByRole("button", { name: "이 채널 다시 만들기" }));
  expect(await screen.findByText("X 초안을 다시 만들었어요.")).toBeDefined();
  expect(screen.getByRole("tab", { name: /^X/ }).getAttribute("aria-selected")).toBe("true");
  expect((screen.getByLabelText("캡션") as HTMLTextAreaElement).value).toContain("다시 만든 초안");
  fireEvent.click(screen.getByRole("tab", { name: /인스타그램/ }));
  expect((screen.getByLabelText("캡션") as HTMLTextAreaElement).value).toBe("인스타 문구 고침");
});

test("고친 채널을 다시 만들 때만 한 번 더 묻고, 돌아가면 고친 내용을 지킨다", async () => {
  const api = createMockCampaignApi({ delay: 0 });
  render(<CampaignApiProvider api={api}><DraftScreen campaignId="c" /></CampaignApiProvider>);
  const caption = await screen.findByLabelText("캡션") as HTMLTextAreaElement;
  fireEvent.change(caption, { target: { value: "인스타 문구 고침" } });
  fireEvent.click(screen.getByRole("button", { name: "이 채널 다시 만들기" }));
  expect(screen.getByRole("alertdialog", { name: "인스타그램 초안을 다시 만들까요?" })).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "돌아가기" }));
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(caption.value).toBe("인스타 문구 고침");
  fireEvent.click(screen.getByRole("button", { name: "이 채널 다시 만들기" }));
  fireEvent.click(screen.getByRole("button", { name: "다시 만들기" }));
  expect(await screen.findByText("인스타그램 초안을 다시 만들었어요.")).toBeDefined();
  expect((screen.getByLabelText("캡션") as HTMLTextAreaElement).value).toContain("다시 만든 초안");
});

test("고친 내용이 있으면 다른 화면으로 가기 전에 묻고, 저장하면 묻지 않는다", async () => {
  window.history.replaceState(null, "", "/campaigns/c/draft");
  const api = createMockCampaignApi({ delay: 0 });
  render(<CampaignApiProvider api={api}><DraftScreen campaignId="c" /></CampaignApiProvider>);
  const caption = await screen.findByLabelText("캡션") as HTMLTextAreaElement;
  const home = () => screen.getByRole("link", { name: "캠페인" });

  // 고친 게 없으면 그냥 이동한다(확인 상자 없음).
  fireEvent.click(home());
  expect(screen.queryByRole("alertdialog")).toBeNull();

  fireEvent.change(caption, { target: { value: "인스타 문구 고침" } });
  const unload = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);

  fireEvent.click(home());
  expect(screen.getByRole("alertdialog", { name: "고친 내용이 저장되지 않았어요" })).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "돌아가기" }));
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(caption.value).toBe("인스타 문구 고침");
  expect(push).not.toHaveBeenCalled();

  fireEvent.click(home());
  fireEvent.click(screen.getByRole("button", { name: "저장하지 않고 나가기" }));
  expect(push).toHaveBeenCalledWith("/");

  fireEvent.click(screen.getByRole("button", { name: "저장" }));
  expect(await screen.findByText("저장했어요.")).toBeDefined();
  fireEvent.click(home());
  expect(screen.queryByRole("alertdialog")).toBeNull();
});

test("글자 수 제한을 넘긴 채널이 있으면 검수 요청을 막고 이유를 알려 준다", async () => {
  render(<CampaignApiProvider api={createMockCampaignApi({ delay: 0 })}><DraftScreen campaignId="c" /></CampaignApiProvider>);
  fireEvent.click(await screen.findByRole("tab", { name: "X" }));
  fireEvent.change(screen.getByLabelText("캡션"), { target: { value: "가".repeat(281) } });
  expect((screen.getByRole("button", { name: "검수 요청" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText(/X 캡션이 글자 수 제한을 넘었어요/)).toBeDefined();
  fireEvent.change(screen.getByLabelText("캡션"), { target: { value: "가".repeat(280) } });
  expect((screen.getByRole("button", { name: "검수 요청" }) as HTMLButtonElement).disabled).toBe(false);
});


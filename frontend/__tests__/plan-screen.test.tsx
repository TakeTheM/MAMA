import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { CampaignApiProvider } from "../features/campaigns/api-context";
import { createMockCampaignApi } from "../features/campaigns/mock-api";
import { NewCampaignScreen } from "../features/campaigns/plan/plan-screen";

const { push, replace } = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function fill() {
  fireEvent.change(screen.getByLabelText("상품명"), { target: { value: "보리 쿠키" } });
  fireEvent.change(screen.getByLabelText("상품 특징"), { target: { value: "국산 보리로 구운 담백한 쿠키" } });
  fireEvent.change(screen.getByLabelText("가격"), { target: { value: "8000" } });
  fireEvent.click(screen.getByLabelText("인스타그램"));
  fireEvent.change(screen.getByLabelText("금액"), { target: { value: "30000" } });
}

test("빈 항목이 있으면 초안을 만들지 않고 칸마다 오류를 보여 준다", async () => {
  const api = createMockCampaignApi({ delay: 0 });
  const generate = vi.spyOn(api, "generateDraft");
  render(<CampaignApiProvider api={api}><NewCampaignScreen /></CampaignApiProvider>);
  fill();
  fireEvent.click(screen.getByRole("button", { name: "초안 만들기" }));
  expect(await screen.findByText("기간을 1일 이상으로 입력해 주세요")).toBeDefined();
  expect(screen.getByLabelText("기간").getAttribute("aria-invalid")).toBe("true");
  expect((screen.getByLabelText("상품명") as HTMLInputElement).value).toBe("보리 쿠키");
  expect(generate).toHaveBeenCalledOnce();
  expect(push).not.toHaveBeenCalled();
});

test("모두 채우면 초안을 만들고 초안 화면으로 이동한다", async () => {
  const api = createMockCampaignApi({ delay: 0 });
  render(<CampaignApiProvider api={api}><NewCampaignScreen /></CampaignApiProvider>);
  expect(await screen.findByText("가을 밤 라떼")).toBeDefined();
  fill();
  fireEvent.change(screen.getByLabelText("기간"), { target: { value: "5" } });
  fireEvent.click(screen.getByRole("button", { name: "초안 만들기" }));
  await waitFor(() => expect(push).toHaveBeenCalledWith("/campaigns/new-1/draft"));
  const saved = await api.getCampaign("new-1");
  expect(saved.status).toBe("초안 생성됨");
  expect(saved.drafts["인스타그램"]?.caption).toContain("보리 쿠키");
  expect(saved.reference?.name).toBe("가을 밤 라떼");
});

test("AI 호출이 실패하면 입력을 지우지 않고 오류를 보여 준다", async () => {
  render(<CampaignApiProvider api={createMockCampaignApi({ delay: 0, failNext: "llm" })}><NewCampaignScreen /></CampaignApiProvider>);
  fill();
  fireEvent.change(screen.getByLabelText("기간"), { target: { value: "5" } });
  fireEvent.click(screen.getByRole("button", { name: "초안 만들기" }));
  expect((await screen.findByRole("alert")).textContent).toContain("AI 응답을 받지 못했어요");
  expect((screen.getByLabelText("상품 특징") as HTMLTextAreaElement).value).toContain("보리");
  expect(push).not.toHaveBeenCalled();
});

test("임시 저장하면 기획중 캠페인 주소로 바꾼다", async () => {
  render(<CampaignApiProvider api={createMockCampaignApi({ delay: 0 })}><NewCampaignScreen /></CampaignApiProvider>);
  fireEvent.change(screen.getByLabelText("상품명"), { target: { value: "보리 쿠키" } });
  fireEvent.click(screen.getByRole("button", { name: "임시 저장" }));
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/campaigns/new-1/plan"));
});

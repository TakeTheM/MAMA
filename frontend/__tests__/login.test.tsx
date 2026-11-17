import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { AccountMenu } from "../components/ui/account-menu";
import { LOGIN_ERRORS, LoginScreen } from "../features/auth/login-screen";
import { ApiError } from "../features/campaigns/model";
import { Feedback } from "../features/campaigns/shared";
import { apiFetch } from "../lib/api/http";
import { REDIRECT_DEDUPE_MS, googleLoginUrl, loginPath, navigation, safeNext } from "../lib/api/login-path";

const { pathname } = vi.hoisted(() => ({ pathname: { current: "/" } }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); pathname.current = "/"; navigation.redirecting = false; window.sessionStorage.clear(); window.history.replaceState(null, "", "/"); });

test("돌아갈 경로는 같은 사이트 경로만 남기고 로그인·API·외부 주소는 / 로 바꾼다", () => {
  expect(safeNext("/campaigns/3/review?tab=x")).toBe("/campaigns/3/review?tab=x");
  for (const bad of [null, "", "campaigns", "//evil.com", "/\\evil.com", "https://evil.com", "/login", "/login?next=/", "/api/v1/campaigns", "/api"]) {
    expect(safeNext(bad)).toBe("/");
  }
  expect(loginPath("/campaigns/3")).toBe("/login?next=%2Fcampaigns%2F3");
  expect(loginPath("/")).toBe("/login");
  expect(googleLoginUrl("/performance")).toBe("/api/v1/auth/google/login?next=%2Fperformance");
  expect(googleLoginUrl("//evil.com")).toBe("/api/v1/auth/google/login?next=%2F");
});

test("Google 로그인 버튼은 fetch가 아니라 돌아갈 경로를 담은 페이지 이동 링크다", () => {
  render(<LoginScreen next="/campaigns/3/review" />);
  const link = screen.getByRole("link", { name: "Google로 로그인" });
  expect(link.getAttribute("href")).toBe("/api/v1/auth/google/login?next=%2Fcampaigns%2F3%2Freview");
  expect(screen.queryByRole("alert")).toBeNull();
});

test("?error= 값마다 안내 문구를 보여 주고, 모르는 값은 일반 안내를 보여 준다", () => {
  for (const [code, message] of Object.entries(LOGIN_ERRORS)) {
    const view = render(<LoginScreen error={code} />);
    expect(screen.getByRole("alert").textContent).toBe(message);
    view.unmount();
  }
  expect(Object.keys(LOGIN_ERRORS).sort()).toEqual(["account", "denied", "email", "google", "link", "state", "token"]);
  render(<LoginScreen error="something" />);
  expect(screen.getByRole("alert").textContent).toBe("로그인하지 못했어요. 다시 시도해 주세요.");
});

function stubFetch(handler: (url: string, init: RequestInit) => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => { calls.push({ url, init }); return handler(url, init); }));
  return calls;
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

test("상단바에 이름(없으면 이메일)을 보여 주고, 로그아웃하면 세션을 지운 뒤 로그인 화면으로 간다", async () => {
  const go = vi.spyOn(navigation, "go").mockImplementation(() => undefined);
  const calls = stubFetch((url) => (url.endsWith("/auth/me") ? json(200, { id: 1, email: "seller@example.com", name: null }) : new Response(null, { status: 204 })));
  render(<AccountMenu />);
  expect(await screen.findByText("seller@example.com")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));
  await waitFor(() => expect(go).toHaveBeenCalledWith("/login"));
  expect(calls.map((call) => [call.init.method, call.url])).toEqual([["GET", "/api/v1/auth/me"], ["POST", "/api/v1/auth/logout"]]);
});

test("로그인 화면에서는 계정 정보를 부르지 않는다", () => {
  pathname.current = "/login";
  const calls = stubFetch(() => json(401, { detail: "로그인이 필요합니다" }));
  const view = render(<AccountMenu />);
  expect(view.container.textContent).toBe("");
  expect(calls).toHaveLength(0);
});

test("?error=__proto__ 처럼 등록되지 않은 이름은 일반 안내로 보여 주고 로그인 버튼도 그대로 보인다", () => {
  for (const code of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
    const view = render(<LoginScreen error={code} />);
    expect(screen.getByRole("alert").textContent).toBe("로그인하지 못했어요. 다시 시도해 주세요.");
    expect(screen.getByRole("link", { name: "Google로 로그인" })).toBeDefined();
    view.unmount();
  }
});

test("Google 화면에서 취소하고 돌아와(next 없음) 다시 눌러도 원래 보던 화면으로 돌아간다", () => {
  // 1) 검수 화면에서 로그인으로 와서 Google 버튼을 누른다
  const first = render(<LoginScreen next="/campaigns/3/review" />);
  fireEvent.click(screen.getByRole("link", { name: "Google로 로그인" }));
  first.unmount();
  // 2) 취소하면 백엔드는 /login?error=denied 로만 돌려보낸다
  render(<LoginScreen error="denied" />);
  expect(screen.getByRole("link", { name: "Google로 로그인" }).getAttribute("href")).toBe("/api/v1/auth/google/login?next=%2Fcampaigns%2F3%2Freview");
});

test("오류 없이 로그인 화면을 열면 예전에 기억한 경로를 쓰지 않는다", () => {
  window.sessionStorage.setItem("mama.loginNext", "/campaigns/3/review");
  render(<LoginScreen />);
  expect(screen.getByRole("link", { name: "Google로 로그인" }).getAttribute("href")).toBe("/api/v1/auth/google/login?next=%2F");
});

test("로그아웃 요청이 실패하면 이동하지 않고 알린 뒤 다시 누를 수 있다", async () => {
  const go = vi.spyOn(navigation, "go").mockImplementation(() => undefined);
  let logoutStatus = 503;
  stubFetch((url) => (url.endsWith("/auth/me") ? json(200, { id: 1, email: "seller@example.com", name: "하린" }) : logoutStatus === 204 ? new Response(null, { status: 204 }) : json(logoutStatus, { detail: "오류" })));
  render(<AccountMenu />);
  fireEvent.click(await screen.findByRole("button", { name: "로그아웃" }));
  expect((await screen.findByRole("alert")).textContent).toContain("로그아웃하지 못했어요");
  expect(go).not.toHaveBeenCalled();
  const retry = screen.getByRole("button", { name: "다시 로그아웃" }) as HTMLButtonElement;
  expect(retry.disabled).toBe(false);
  logoutStatus = 204;
  fireEvent.click(retry);
  await waitFor(() => expect(go).toHaveBeenCalledWith("/login"));
});

test("네트워크가 끊겨 로그아웃 요청이 서버에 닿지 않아도 이동하지 않는다", async () => {
  const go = vi.spyOn(navigation, "go").mockImplementation(() => undefined);
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.endsWith("/auth/me")) return json(200, { id: 1, email: "seller@example.com", name: "하린" });
    throw new TypeError("Failed to fetch");
  }));
  render(<AccountMenu />);
  fireEvent.click(await screen.findByRole("button", { name: "로그아웃" }));
  expect((await screen.findByRole("alert")).textContent).toContain("로그아웃하지 못했어요");
  expect(go).not.toHaveBeenCalled();
});

test("동시에 온 401은 한 번만 이동하고, 이동이 취소돼 페이지가 남으면 다음 401에서 다시 이동한다", async () => {
  vi.useFakeTimers();
  const go = vi.spyOn(navigation, "go").mockImplementation(() => undefined);
  window.history.replaceState(null, "", "/campaigns/3/draft");
  stubFetch(() => json(401, { detail: "로그인이 필요합니다" }));
  await Promise.allSettled([apiFetch("/api/v1/campaigns/3"), apiFetch("/api/v1/campaigns/3/history")]);
  expect(go).toHaveBeenCalledOnce();
  // '이 페이지에 머무르기'로 이동이 취소된 뒤 다시 저장을 누른 경우
  vi.advanceTimersByTime(REDIRECT_DEDUPE_MS);
  await apiFetch("/api/v1/campaigns/3/drafts/x", { method: "PUT", body: {} }).catch(() => undefined);
  expect(go).toHaveBeenCalledTimes(2);
  expect(go).toHaveBeenLastCalledWith("/login?next=%2Fcampaigns%2F3%2Fdraft");
});

test("로그인이 풀렸다는 오류 옆에는 지금 경로로 돌아오는 로그인 링크를 둔다(이동이 취소됐을 때 쓸 수 있게)", () => {
  window.history.replaceState(null, "", "/campaigns/3/review");
  render(<Feedback pending={false} notice="" error={new ApiError("unauthorized", "로그인이 필요해요. 로그인 화면으로 이동할게요.")} />);
  expect(screen.getByRole("link", { name: "로그인하러 가기" }).getAttribute("href")).toBe("/login?next=%2Fcampaigns%2F3%2Freview");
});


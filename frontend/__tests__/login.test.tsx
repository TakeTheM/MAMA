import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { AccountMenu } from "../components/ui/account-menu";
import { LOGIN_ERRORS, LoginScreen } from "../features/auth/login-screen";
import { googleLoginUrl, loginPath, navigation, safeNext } from "../lib/api/login-path";

const { pathname } = vi.hoisted(() => ({ pathname: { current: "/" } }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); pathname.current = "/"; navigation.redirecting = false; });

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

import { NextRequest } from "next/server";
import { getRedirectUrl, unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import nextConfig from "../next.config";
import { config, proxy } from "../proxy";

// Supabase 세션 확인을 흉내 낸다: sb-test-auth-token 쿠키가 "valid"면 로그인, "refresh"면 갱신 쿠키를 쓴다.
const COOKIE = "sb-test-auth-token";
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, { cookies }: { cookies: { getAll: () => { name: string; value: string }[]; setAll: (list: unknown[], headers: Record<string, string>) => void } }) => ({
    auth: {
      async getClaims() {
        const value = cookies.getAll().find((cookie) => cookie.name === COOKIE)?.value;
        if (value === "refresh") {
          cookies.setAll([{ name: COOKIE, value: "valid", options: { path: "/" } }], { "Cache-Control": "private, no-store" });
          return { data: { claims: { sub: "u1" } }, error: null };
        }
        if (value === "expired") {
          cookies.setAll([{ name: COOKIE, value: "", options: { path: "/", maxAge: 0 } }], {});
          return { data: null, error: new Error("expired") };
        }
        return value === "valid" ? { data: { claims: { sub: "u1" } }, error: null } : { data: null, error: null };
      },
    },
  }),
}));

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
});
afterEach(() => { vi.unstubAllEnvs(); });

const request = (path: string, session?: string) => {
  const req = new NextRequest(`https://mama.example${path}`);
  if (session !== undefined) req.cookies.set(COOKIE, session);
  return req;
};

test("로그인 세션이 없으면 처음 화면부터 로그인 화면으로 보낸다", async () => {
  expect(getRedirectUrl(await proxy(request("/")))).toBe("https://mama.example/login");
  expect(getRedirectUrl(await proxy(request("/campaigns/new")))).toBe("https://mama.example/login?next=%2Fcampaigns%2Fnew");
  expect(getRedirectUrl(await proxy(request("/campaigns/3/review?tab=x")))).toBe("https://mama.example/login?next=%2Fcampaigns%2F3%2Freview%3Ftab%3Dx");
  expect(getRedirectUrl(await proxy(request("/performance", "")))).toBe("https://mama.example/login?next=%2Fperformance");
});

test("세션이 있거나 로그인 화면·로그인 콜백이면 그대로 보여 준다", async () => {
  expect(getRedirectUrl(await proxy(request("/", "valid")))).toBeNull();
  expect(getRedirectUrl(await proxy(request("/campaigns/new", "valid")))).toBeNull();
  expect(getRedirectUrl(await proxy(request("/login")))).toBeNull();
  expect(getRedirectUrl(await proxy(request("/login?next=%2Fperformance&error=denied")))).toBeNull();
  expect(getRedirectUrl(await proxy(request("/auth/callback?code=abc&next=%2F")))).toBeNull();
});

test("세션을 갱신하면 새 쿠키를 응답에 싣고, 만료된 세션은 쿠키를 지우며 로그인 화면으로 보낸다", async () => {
  const refreshed = await proxy(request("/campaigns/new", "refresh"));
  expect(getRedirectUrl(refreshed)).toBeNull();
  expect(refreshed.cookies.get(COOKIE)?.value).toBe("valid");
  expect(refreshed.headers.get("Cache-Control")).toBe("private, no-store");

  const expired = await proxy(request("/campaigns/new", "expired"));
  expect(getRedirectUrl(expired)).toBe("https://mama.example/login?next=%2Fcampaigns%2Fnew");
  expect(expired.cookies.get(COOKIE)?.value).toBe("");
});

test("Supabase 설정이 없으면 로그인 화면에서 설정 오류를 알린다", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  expect(getRedirectUrl(await proxy(request("/performance", "valid")))).toBe("https://mama.example/login?error=config&next=%2Fperformance");
});

test("API·Next 내부 파일·정적 파일에는 로그인 확인을 하지 않는다", () => {
  const matches = (url: string) => unstable_doesMiddlewareMatch({ config, nextConfig, url });
  for (const url of ["/", "/campaigns/new", "/campaigns/3/publishing/schedule", "/performance", "/apiary"]) expect(matches(url)).toBe(true);
  // 마지막 경로 조각에 점이 있어도 정적 파일 확장자가 아니면 페이지로 보고 로그인을 확인한다.
  for (const url of ["/campaigns/spring.sale", "/report.v2", "/campaigns/3/review.html"]) expect(matches(url)).toBe(true);
  for (const url of ["/api", "/api/v1/auth/me", "/api/v1/campaigns", "/_next/static/chunks/a.js", "/_next/image?url=x", "/favicon.ico", "/file.svg", "/robots.txt", "/sitemap.xml", "/manifest.webmanifest", "/images/hero.jpeg"]) {
    expect(matches(url)).toBe(false);
  }
});

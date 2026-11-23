import { NextRequest } from "next/server";
import { getRedirectUrl, unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { expect, test } from "vitest";
import nextConfig from "../next.config";
import { SESSION_COOKIE, config, proxy } from "../proxy";

const request = (path: string, session?: string) => {
  const req = new NextRequest(`https://mama.example${path}`);
  if (session !== undefined) req.cookies.set(SESSION_COOKIE, session);
  return req;
};

test("세션 쿠키가 없으면 처음 화면부터 로그인 화면으로 보낸다", () => {
  expect(getRedirectUrl(proxy(request("/")))).toBe("https://mama.example/login");
  expect(getRedirectUrl(proxy(request("/campaigns/new")))).toBe("https://mama.example/login?next=%2Fcampaigns%2Fnew");
  expect(getRedirectUrl(proxy(request("/campaigns/3/review?tab=x")))).toBe("https://mama.example/login?next=%2Fcampaigns%2F3%2Freview%3Ftab%3Dx");
  expect(getRedirectUrl(proxy(request("/performance", "")))).toBe("https://mama.example/login?next=%2Fperformance");
});

test("세션 쿠키가 있거나 로그인 화면이면 그대로 보여 준다", () => {
  expect(getRedirectUrl(proxy(request("/", "token")))).toBeNull();
  expect(getRedirectUrl(proxy(request("/campaigns/new", "token")))).toBeNull();
  expect(getRedirectUrl(proxy(request("/login")))).toBeNull();
  expect(getRedirectUrl(proxy(request("/login?next=%2Fperformance&error=denied")))).toBeNull();
});

test("API·Next 내부 파일·정적 파일에는 로그인 확인을 하지 않는다", () => {
  const matches = (url: string) => unstable_doesMiddlewareMatch({ config, nextConfig, url });
  for (const url of ["/", "/campaigns/new", "/campaigns/3/publishing/schedule", "/performance", "/apiary"]) expect(matches(url)).toBe(true);
  // 마지막 경로 조각에 점이 있어도 정적 파일 확장자가 아니면 페이지로 보고 로그인을 확인한다.
  for (const url of ["/campaigns/spring.sale", "/report.v2", "/campaigns/3/review.html"]) expect(matches(url)).toBe(true);
  for (const url of ["/api", "/api/v1/auth/me", "/api/v1/auth/google/login?next=%2F", "/_next/static/chunks/a.js", "/_next/image?url=x", "/favicon.ico", "/file.svg", "/robots.txt", "/sitemap.xml", "/manifest.webmanifest", "/images/hero.jpeg"]) {
    expect(matches(url)).toBe(false);
  }
});

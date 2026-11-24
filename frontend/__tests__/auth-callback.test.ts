import { NextRequest } from "next/server";
import { getRedirectUrl } from "next/experimental/testing/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

// code 값에 따라 Supabase의 code → 세션 교환 결과를 흉내 낸다.
const { store, exchanged } = vi.hoisted(() => ({ store: new Map<string, string>(), exchanged: [] as string[] }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [...store].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => { store.set(name, value); },
  }),
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, { cookies }: { cookies: { setAll: (list: unknown[], headers: Record<string, string>) => void } }) => ({
    auth: {
      async exchangeCodeForSession(code: string) {
        exchanged.push(code);
        if (code === "ok") { cookies.setAll([{ name: "sb-test-auth-token", value: "session", options: {} }], {}); return { error: null }; }
        if (code === "reused") return { error: { code: "flow_state_not_found" } };
        return { error: { code: "unexpected_failure" } };
      },
    },
  }),
}));
const { GET } = await import("../app/auth/callback/route");

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
});
afterEach(() => { vi.unstubAllEnvs(); store.clear(); exchanged.length = 0; });

const callback = async (query: string) => getRedirectUrl(await GET(new NextRequest(`https://mama.example/auth/callback${query}`)));

test("code를 세션으로 바꿔 쿠키에 저장하고 원래 보던 화면으로 보낸다", async () => {
  expect(await callback("?code=ok&next=%2Fcampaigns%2F3%2Freview")).toBe("https://mama.example/campaigns/3/review");
  expect(store.get("sb-test-auth-token")).toBe("session");
});

test("돌려보낼 경로는 같은 사이트 경로만 쓴다", async () => {
  expect(await callback("?code=ok&next=%2F%2Fevil.com")).toBe("https://mama.example/");
  expect(await callback("?code=ok&next=https%3A%2F%2Fevil.com")).toBe("https://mama.example/");
  expect(await callback("?code=ok")).toBe("https://mama.example/");
  // 탭·줄바꿈을 끼워 //evil.com 으로 해석되게 만든 값
  expect(await callback("?code=ok&next=%2F%09%2Fevil.com")).toBe("https://mama.example/");
  expect(await callback("?code=ok&next=%2F%0A%5Cevil.com")).toBe("https://mama.example/");
});

test("실패하면 이유와 돌아갈 경로를 담아 로그인 화면으로 보낸다", async () => {
  expect(await callback("?error=access_denied&next=%2Fperformance")).toBe("https://mama.example/login?error=denied&next=%2Fperformance");
  expect(await callback("?error=server_error")).toBe("https://mama.example/login?error=google");
  expect(await callback("?next=%2Fperformance")).toBe("https://mama.example/login?error=state&next=%2Fperformance");
  expect(await callback("?code=reused")).toBe("https://mama.example/login?error=state");
  expect(await callback("?code=broken")).toBe("https://mama.example/login?error=google");
  expect(exchanged).toEqual(["reused", "broken"]);
});

test("Supabase 설정이 없으면 교환하지 않고 설정 오류를 알린다", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
  expect(await callback("?code=ok")).toBe("https://mama.example/login?error=config");
  expect(exchanged).toEqual([]);
});

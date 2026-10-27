import { render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import Home from "../app/page";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("백엔드 상태가 ok이면 화면에 ok를 보여 준다", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "ok" }),
    }),
  );

  render(<Home />);

  expect(screen.getByRole("heading", { name: "MAMA" })).toBeDefined();
  expect(await screen.findByText("ok")).toBeDefined();
});

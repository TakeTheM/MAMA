import { describe, expect, test } from "vitest";
import { createMockAdapter } from "../features/publishing/mock-adapter";
import { fromSeoulInput, REVIEW_WARNING, toSeoulInput } from "../features/publishing/model";

const NOW = "2026-11-02T03:00:00.000Z";
const make = (scenario: Parameters<typeof createMockAdapter>[0] = {}) => createMockAdapter({ delay: 0, now: () => new Date(NOW), ...scenario });
const schedule = (hours = 25, amount = 70000, days = 7) => ({
  action: "schedule" as const,
  schedule: { scheduledAt: new Date(Date.parse(NOW) + hours * 3600000).toISOString(), amount, days },
});

describe("F-04 목업 어댑터", () => {
  test("예약 → 게시 → 종료를 기록하고 이력과 기록 시각을 함께 저장한다", async () => {
    const adapter = make();
    const initial = await adapter.getCampaign("demo");
    expect(initial.allowedActions).toEqual(["schedule"]);
    const planned = await adapter.mutate("demo", schedule());
    expect(planned.campaign.status).toBe("게시 예약됨");
    const published = await adapter.mutate("demo", { action: "publish" });
    expect(published.campaign.publishedAt).toBe(NOW);
    const ended = await adapter.mutate("demo", { action: "end" });
    expect(ended.campaign.status).toBe("종료");
    expect(ended.campaign.endedAt).toBe(NOW);
    expect(ended.campaign.allowedActions).toEqual([]);
    expect(ended.campaign.history).toHaveLength(initial.history.length + 3);
    expect(ended.campaign.history.at(-1)).toEqual({ from: "집행중", to: "종료", at: NOW, actor: "seller-demo" });
    // Read snapshots must not allow the caller to mutate stored data.
    ended.campaign.history.length = 0;
    expect((await adapter.getCampaign("demo")).history).toHaveLength(4);
  });

  test.each([[23.99, REVIEW_WARNING], [24, undefined], [25, undefined]])("%s시간 후 예약 경고", async (hours, warning) => {
    expect((await make().mutate("demo", schedule(hours))).warning).toBe(warning);
  });

  test.each([
    [-1, 100, 1, "scheduledAt"], [25, 0, 1, "amount"], [25, -1, 1, "amount"],
    [25, NaN, 1, "amount"], [25, 100, 0, "days"], [25, 100, -1, "days"],
    [25, 100, 1.5, "days"], [25, 100, NaN, "days"],
  ])("잘못된 시각·예산 거절 (%s, %s, %s)", async (hours, amount, days, field) => {
    const adapter = make();
    await expect(adapter.mutate("demo", schedule(hours, amount, days))).rejects.toMatchObject({ code: "validation", field });
    const campaign = await adapter.getCampaign("demo");
    expect(campaign.status).toBe("승인됨");
    expect(campaign.history).toHaveLength(1);
  });

  test("빈 예정 시각과 공백 반려 사유를 거절한다", async () => {
    const adapter = make();
    await expect(adapter.mutate("demo", { action: "schedule", schedule: { scheduledAt: "", amount: 1, days: 1 } })).rejects.toMatchObject({ field: "scheduledAt" });
    await adapter.mutate("demo", schedule());
    await expect(adapter.mutate("demo", { action: "reject", reason: "  \n " })).rejects.toMatchObject({ field: "reason" });
    expect((await adapter.getCampaign("demo")).status).toBe("게시 예약됨");
  });

  test("반려 사유가 수정 요청까지 유지된다", async () => {
    const adapter = make({ scenario: "scheduled" });
    await adapter.mutate("demo", { action: "reject", reason: "  상품 정보를 수정해 주세요  " });
    const { campaign } = await adapter.mutate("demo", { action: "revise" });
    expect(campaign.status).toBe("수정 요청");
    expect(campaign.rejectionReason).toBe("상품 정보를 수정해 주세요");
    expect(campaign.history.at(-2)?.reason).toBe(campaign.rejectionReason);
  });

  test("순서 건너뛰기·취소 이후 작업과 다른 소유자의 요청을 거절한다", async () => {
    await expect(make().mutate("demo", { action: "publish" })).rejects.toMatchObject({ code: "conflict" });
    await expect(make({ scenario: "scheduled" }).mutate("demo", { action: "end" })).rejects.toMatchObject({ code: "conflict" });
    await expect(make({ scenario: "canceled" }).mutate("demo", { action: "publish" })).rejects.toMatchObject({ code: "conflict" });
    const other = make({ actorId: "other" });
    await expect(other.getCampaign("demo")).rejects.toMatchObject({ code: "forbidden" });
    await expect(other.mutate("demo", schedule())).rejects.toMatchObject({ code: "forbidden" });
  });

  test("같은 작업을 동시에 요청해도 상태 이력은 한 번만 추가된다", async () => {
    const adapter = make({ scenario: "scheduled" });
    const results = await Promise.allSettled([
      adapter.mutate("demo", { action: "publish" }), adapter.mutate("demo", { action: "publish" }),
    ]);
    expect(results.map((result) => result.status)).toEqual(["fulfilled", "rejected"]);
    expect((await adapter.getCampaign("demo")).history.filter((entry) => entry.to === "집행중")).toHaveLength(1);
  });

  test("종료 시각이 게시 시각보다 앞서면 변경하지 않는다", async () => {
    let clock = new Date(NOW);
    const adapter = make({ scenario: "scheduled", now: () => clock });
    await adapter.mutate("demo", { action: "publish" });
    clock = new Date(Date.parse(NOW) - 1000);
    await expect(adapter.mutate("demo", { action: "end" })).rejects.toMatchObject({ code: "validation" });
    expect((await adapter.getCampaign("demo")).status).toBe("집행중");
  });

  test("조회와 저장 실패 후 재시도가 가능하며 저장 실패는 상태를 바꾸지 않는다", async () => {
    const loading = make({ scenario: "load-error" });
    await expect(loading.getCampaign("demo")).rejects.toMatchObject({ code: "network" });
    expect((await loading.getCampaign("demo")).status).toBe("승인됨");
    const saving = make({ scenario: "save-error" });
    await expect(saving.mutate("demo", schedule())).rejects.toMatchObject({ code: "network" });
    expect((await saving.getCampaign("demo")).history).toHaveLength(1);
    expect((await saving.mutate("demo", schedule())).campaign.status).toBe("게시 예약됨");
    await expect(make().getCampaign("unknown")).rejects.toMatchObject({ code: "not_found" });
  });

  test("한국 시간 입력은 실행 환경 시간대와 관계없이 변환된다", () => {
    expect(toSeoulInput(NOW)).toBe("2026-11-02T12:00");
    expect(fromSeoulInput("2026-11-02T12:00")).toBe(NOW);
  });
});

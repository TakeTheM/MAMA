import {
  type Action, type Campaign, type CampaignStatus, type Mutation, type PublishingAdapter,
  PublishingError, REVIEW_WARNING,
} from "./model";

export const SCENARIOS = [
  ["approved", "승인됨 · 처음부터"], ["scheduled", "게시 예약됨"],
  ["running", "집행중"], ["rejected", "플랫폼 반려"], ["revision", "수정 요청"],
  ["ended", "종료"], ["canceled", "취소"], ["planning", "기획중 · 조회만"],
  ["load-error", "조회 실패 · 재시도 가능"], ["save-error", "저장 실패 · 1회"],
  ["forbidden", "권한 없음"], ["missing", "없는 캠페인"],
] as const;
export type Scenario = typeof SCENARIOS[number][0];
const allowed: Partial<Record<CampaignStatus, Action[]>> = {
  승인됨: ["schedule"], "게시 예약됨": ["publish", "reject", "cancel"],
  집행중: ["end"], "플랫폼 반려": ["revise"],
};
const HOUR = 60 * 60 * 1000;

// This is the only mock rule boundary. Replace this adapter with FastAPI calls later.
// Each instance is an isolated, in-memory demo session; no browser storage is used.
export function createMockAdapter(options: {
  scenario?: Scenario; actorId?: string; now?: () => Date; delay?: number;
  /** 데모 저장소의 캠페인으로 시작할 때 (scenario 대신) */
  initial?: Campaign;
} = {}): PublishingAdapter {
  const scenario = options.scenario ?? "approved";
  const actor = options.actorId ?? "seller-demo";
  const now = options.now ?? (() => new Date());
  let loadFailure = scenario === "load-error";
  let saveFailure = scenario === "save-error";
  let record: Campaign | undefined;
  const pause = () => new Promise<void>((resolve) => setTimeout(resolve, options.delay ?? 350));

  function seed(): Campaign {
    const base = now().getTime();
    const campaign: Campaign = {
      id: "demo", ownerId: "seller-demo", name: "가을의 한 잔, 우리 가게를 알리다",
      product: "시그니처 밤 라떼", channels: ["인스타그램"],
      caption: "쌀쌀한 오후에 따뜻한 한 잔. 고소한 밤과 부드러운 우유가 만난 시그니처 밤 라떼를 만나보세요. 오늘도 매장에서 기다릴게요.",
      hashtags: ["#가을메뉴", "#밤라떼", "#동네카페"], status: "승인됨",
      initialBudget: { amount: 70000, days: 7 }, allowedActions: [],
      history: [{ from: "검수 대기", to: "승인됨", at: new Date(base - 4 * HOUR).toISOString(), actor: "seller-demo" }],
    };
    function advance(to: CampaignStatus, offset: number, reason?: string) {
      campaign.history.push({ from: campaign.status, to, at: new Date(base + offset * HOUR).toISOString(), actor: "seller-demo", reason });
      campaign.status = to;
    }
    if (["scheduled", "running", "rejected", "revision", "ended", "canceled"].includes(scenario)) {
      campaign.schedule = { scheduledAt: new Date(base - HOUR).toISOString(), amount: 70000, days: 7 };
      advance("게시 예약됨", -3);
    }
    if (["running", "ended"].includes(scenario)) {
      advance("집행중", -1); campaign.publishedAt = new Date(base - HOUR).toISOString();
    }
    if (scenario === "ended") { advance("종료", -0.5); campaign.endedAt = new Date(base - HOUR / 2).toISOString(); }
    if (["rejected", "revision"].includes(scenario)) {
      campaign.rejectionReason = "플랫폼에서 랜딩 페이지의 상품 정보를 확인할 수 없습니다.";
      advance("플랫폼 반려", -1, campaign.rejectionReason);
    }
    if (scenario === "revision") advance("수정 요청", -0.5);
    if (scenario === "canceled") advance("취소", -1);
    if (scenario === "planning") { campaign.status = "기획중"; campaign.history = []; }
    return campaign;
  }
  function requireCampaign(id: string) {
    if (id !== (options.initial?.id ?? "demo") || scenario === "missing") throw new PublishingError("not_found", "캠페인을 찾을 수 없습니다.");
    record ??= options.initial ? structuredClone(options.initial) : seed();
    if (scenario === "forbidden" || record.ownerId !== actor) throw new PublishingError("forbidden", "이 캠페인을 조회하거나 변경할 권한이 없습니다.");
    return record;
  }
  function snapshot(campaign: Campaign): Campaign {
    return structuredClone({ ...campaign, allowedActions: allowed[campaign.status] ?? [] });
  }
  return {
    async getCampaign(id) {
      await pause();
      if (loadFailure) { loadFailure = false; throw new PublishingError("network", "캠페인을 불러오지 못했습니다. 다시 시도해 주세요."); }
      return snapshot(requireCampaign(id));
    },
    async mutate(id, command: Mutation) {
      await pause();
      const current = requireCampaign(id);
      if (!(allowed[current.status] ?? []).includes(command.action)) throw new PublishingError("conflict", "현재 상태에서는 이 작업을 할 수 없습니다.");
      if (saveFailure) { saveFailure = false; throw new PublishingError("network", "기록을 저장하지 못했습니다. 입력 내용을 확인하고 다시 시도해 주세요."); }
      const at = now().toISOString();
      const next = structuredClone(current);
      let warning: string | undefined;
      switch (command.action) {
        case "schedule": {
          const { scheduledAt, amount, days } = command.schedule;
          const timestamp = Date.parse(scheduledAt);
          if (!Number.isFinite(timestamp) || timestamp < Date.parse(at)) throw new PublishingError("validation", "게시 예정 시각은 현재 이후로 입력해 주세요.", "scheduledAt");
          if (!Number.isFinite(amount) || amount <= 0) throw new PublishingError("validation", "예산 금액은 0보다 커야 합니다.", "amount");
          if (!Number.isInteger(days) || days <= 0) throw new PublishingError("validation", "예산 기간은 1일 이상의 정수로 입력해 주세요.", "days");
          next.schedule = { ...command.schedule }; next.status = "게시 예약됨";
          if (timestamp - Date.parse(at) < 24 * HOUR) warning = REVIEW_WARNING;
          break;
        }
        case "publish": next.status = "집행중"; next.publishedAt = at; break;
        case "end":
          if (!current.publishedAt || Date.parse(at) < Date.parse(current.publishedAt)) throw new PublishingError("validation", "종료 시각은 게시 시각보다 앞설 수 없습니다.");
          next.status = "종료"; next.endedAt = at; break;
        case "reject":
          if (!command.reason.trim()) throw new PublishingError("validation", "반려 사유를 입력해 주세요.", "reason");
          next.status = "플랫폼 반려"; next.rejectionReason = command.reason.trim(); break;
        case "revise": next.status = "수정 요청"; break;
        case "cancel": next.status = "취소"; break;
      }
      next.history.push({ from: current.status, to: next.status, at, actor, ...(command.action === "reject" ? { reason: next.rejectionReason } : {}) });
      record = next;
      return { campaign: snapshot(next), warning };
    },
  };
}

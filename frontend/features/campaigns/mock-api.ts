import type { CampaignStatus, Channel } from "@/lib/campaign-status";
import {
  type Campaign, type CampaignAction, type CampaignApi, type CampaignSummary, type ChannelCopy, type HistoryEntry,
  type PerformanceInput, type PlanInput, type RiskFinding, ApiError,
} from "./model";

/*
 * 백엔드(FastAPI)가 생기기 전까지 쓰는 mock.
 * 상태 전이 허용 여부, 입력 검사, L1·L2·L3 대신 만든 예시 결과, ROAS 계산은 여기에만 둔다.
 * 실제 서비스에서는 이 규칙이 모두 FastAPI로 간다 (CLAUDE.md). 화면 코드는 이 규칙을 다시 만들지 않는다.
 * 저장은 메모리에만 한다(새로고침하면 처음 예시로 돌아간다).
 */

const ACTOR = "seller-demo";
const HOUR = 3600_000;

const ALLOWED: Partial<Record<CampaignStatus, CampaignAction[]>> = {
  기획중: ["save-plan", "generate-draft", "cancel"],
  "초안 생성됨": ["save-draft", "regenerate", "request-review", "cancel"],
  // 위험 표현은 경고만 한다. 검수를 마치면 사장님이 확인하고 승인하거나, 고친 뒤 다시 검수할 수 있다.
  "검수 대기": ["approve", "apply-fix", "save-draft", "request-review"],
  "수정 요청": ["save-draft", "apply-fix", "request-review"],
  "게시 예약됨": ["cancel"],
  종료: ["submit-performance", "complete-evaluation"],
};

const SOURCES = {
  R1: { title: "추천·보증 등에 관한 표시·광고 심사지침 (공정거래위원회)", url: "https://www.law.go.kr/행정규칙/추천ㆍ보증등에관한표시ㆍ광고심사지침" },
  R3: { title: "표시·광고의 공정화에 관한 법률 제3조", url: "https://www.law.go.kr/법령/표시ㆍ광고의공정화에관한법률" },
  R4: { title: "식품 등의 표시·광고에 관한 법률 제8조", url: "https://www.law.go.kr/법령/식품등의표시ㆍ광고에관한법률" },
};
/** 금지어 규칙 목록 (LLM 결과와 별도로 한 번 더 거른다, US-03) */
const BANNED: { phrase: string; rule: "R3" | "R4"; fix: string; reason: string }[] = [
  { phrase: "100% 천연 재료", rule: "R3", fix: "엄선한 재료", reason: "첨가물이 하나라도 들어 있으면 사실과 다른 광고가 될 수 있어요. 확인할 수 있는 사실로 바꿔 주세요." },
  { phrase: "업계 최고", rule: "R3", fix: "꼼꼼하게 만든", reason: "비교 근거 없이 ‘최고’라고 하면 과장 광고로 볼 수 있어요." },
  { phrase: "무조건", rule: "R3", fix: "대부분", reason: "결과를 단정하는 표현은 소비자를 오해하게 할 수 있어요." },
  { phrase: "면역력", rule: "R4", fix: "든든한 하루", reason: "일반 식품이 질병 예방·면역 효과를 내세우면 효능 표방 광고가 될 수 있어요." },
  { phrase: "다이어트", rule: "R4", fix: "가벼운 한 끼", reason: "일반 식품에 체중 감량 효과를 표시하면 효능 표방 광고가 될 수 있어요." },
  { phrase: "주름 개선", rule: "R4", fix: "촉촉한 마무리", reason: "기능성 화장품 인증 없이 주름 개선을 말하면 안 돼요." },
];
const RULE_LABEL = { R1: "협찬 미표시", R3: "거짓·과장", R4: "효능 표방", R5: "비하·혐오" } as const;

function hasAdMark(copy: ChannelCopy) {
  return copy.hashtags.some((tag) => tag.replace(/\s/g, "") === "#광고") || /\[광고\]|#광고/.test(copy.caption);
}

/** L2 위험 표현 검수 대신 쓰는 예시 결과 + 금지어 이중 검사 */
function review(campaign: Campaign): RiskFinding[] {
  const findings: RiskFinding[] = [];
  for (const channel of campaign.plan.channels) {
    const copy = campaign.drafts[channel];
    if (!copy) continue;
    const text = `${copy.caption} ${copy.hashtags.join(" ")}`;
    for (const item of BANNED) {
      if (!text.includes(item.phrase)) continue;
      findings.push({
        id: `${channel}-${item.phrase}`, channel, rule: item.rule, ruleLabel: RULE_LABEL[item.rule],
        quote: item.phrase, title: `“${item.phrase}”`, reason: item.reason, source: SOURCES[item.rule],
        suggestion: copy.caption.replace(item.phrase, item.fix), replacement: item.fix, applied: false,
      });
    }
    if (!hasAdMark(copy)) {
      findings.push({
        id: `${channel}-ad-mark`, channel, rule: "R1", ruleLabel: RULE_LABEL.R1, quote: null,
        title: "광고 표시가 없어요", reason: "대가를 받은 광고는 첫 줄이나 해시태그에 ‘광고’임을 알려야 해요. 표시가 없으면 소비자가 일반 후기로 오해할 수 있어요.",
        source: SOURCES.R1, suggestion: "해시태그 맨 앞에 #광고 추가", applied: false,
      });
    }
  }
  return findings;
}

/** L1 초안 생성 대신 쓰는 예시 문구 */
function writeDraft(plan: PlanInput, channel: Channel, variant = 0): ChannelCopy {
  const intro = ["", "다시 만든 초안이에요. ", "한 번 더 다듬었어요. "][variant % 3];
  const product = plan.productName.trim();
  const point = plan.productDescription.trim().split(/[.\n]/)[0];
  const ask = plan.goal === "구매 늘리기" ? "지금 프로필 링크에서 만나보세요." : plan.goal === "팔로워 늘리기" ? "팔로우하고 새 소식을 먼저 받아 보세요." : "가게에 들러 직접 확인해 보세요.";
  const caption = channel === "X"
    ? `${intro}${product} 나왔어요. ${point}. ${ask}`
    : `${intro}오늘 소개할 상품은 ${product}예요.\n${point}.\n가격은 ${Number(plan.price).toLocaleString("ko-KR")}원이에요. ${ask}`;
  const base = product.replace(/\s/g, "");
  return { caption, hashtags: [`#${base}`, `#${plan.category}`, channel === "틱톡" ? "#추천템" : "#동네가게", "#소상공인"] };
}

function plan(values: Partial<PlanInput> & Pick<PlanInput, "productName" | "channels">): PlanInput {
  return { productDescription: "", price: "", category: "식품", goal: "구매 늘리기", budgetAmount: "50000", budgetDays: "7", ...values };
}

function seed(now: number): Campaign[] {
  const at = (hoursAgo: number) => new Date(now - hoursAgo * HOUR).toISOString();
  const log = (steps: [CampaignStatus, CampaignStatus, number, string?, string?][]): HistoryEntry[] =>
    steps.map(([from, to, hoursAgo, actor, reason]) => ({ from, to, at: at(hoursAgo), actor: actor ?? ACTOR, ...(reason ? { reason } : {}) }));
  const base = { ownerId: ACTOR, findings: [], canApprove: false, allowedActions: [] as CampaignAction[] };

  const granola = plan({ productName: "수제 그래놀라", productDescription: "국산 귀리와 꿀로 매일 아침 구워요. 바삭하고 달지 않아 아이 간식으로도 좋아요", price: "12900", channels: ["인스타그램", "X"], budgetAmount: "70000" });
  const a: Campaign = {
    ...base, id: "a", name: "수제 그래놀라 첫 출시", status: "검수 대기", updatedAt: at(2), plan: granola,
    drafts: {
      인스타그램: { caption: "매일 아침 직접 굽는 수제 그래놀라가 나왔어요. 100% 천연 재료만 사용해서 바삭하고 고소해요. 우유나 요거트에 한 줌 올려 드세요.", hashtags: ["#그래놀라", "#수제간식", "#아침메뉴"] },
      X: { caption: "[광고] 매일 아침 굽는 수제 그래놀라 나왔어요. 프로필 링크에서 만나보세요.", hashtags: ["#광고", "#그래놀라"] },
    },
    history: log([["기획중", "초안 생성됨", 30], ["초안 생성됨", "검수 대기", 2]]),
  };
  a.findings = review(a);
  a.canApprove = true;

  const b: Campaign = {
    ...base, id: "b", name: "봄 니트 가디건 재입고", status: "플랫폼 반려", updatedAt: at(7),
    plan: plan({ productName: "니트 가디건", productDescription: "부드러운 울 혼방 니트. 봄가을에 걸치기 좋아요", price: "39000", category: "패션", channels: ["틱톡"], budgetAmount: "100000", budgetDays: "10" }),
    drafts: { 틱톡: { caption: "[광고] 다시 들어온 니트 가디건, 이번엔 색이 하나 더 늘었어요.", hashtags: ["#광고", "#가디건", "#봄코디"] } },
    schedule: { scheduledAt: at(20), amount: 100000, days: 10 }, rejectionReason: "랜딩 페이지에서 상품 가격 정보를 확인할 수 없습니다.",
    history: log([["기획중", "초안 생성됨", 90], ["초안 생성됨", "검수 대기", 80], ["검수 대기", "승인됨", 79], ["승인됨", "게시 예약됨", 50], ["게시 예약됨", "플랫폼 반려", 7, ACTOR, "랜딩 페이지에서 상품 가격 정보를 확인할 수 없습니다."]]),
  };
  const handcream = plan({ productName: "유자 핸드크림", productDescription: "고흥 유자 향을 담은 핸드크림. 끈적임 없이 빠르게 스며들어요", price: "9800", category: "화장품", channels: ["인스타그램", "X"], budgetAmount: "50000", budgetDays: "5" });
  const c: Campaign = {
    ...base, id: "c", name: "유자 핸드크림 신상", status: "초안 생성됨", updatedAt: at(22), plan: handcream,
    drafts: { 인스타그램: writeDraft(handcream, "인스타그램"), X: writeDraft(handcream, "X") },
    reference: { id: "g", name: "가을 밤 라떼", roas: 312 },
    history: log([["기획중", "초안 생성됨", 22]]),
  };
  const d: Campaign = {
    ...base, id: "d", name: "제철 사과 선물세트", status: "승인됨", updatedAt: at(29),
    plan: plan({ productName: "사과 선물세트", productDescription: "청송 사과 5kg 선물세트", price: "45000", channels: ["인스타그램", "틱톡"], budgetAmount: "80000", budgetDays: "7" }),
    drafts: {
      인스타그램: { caption: "[광고] 청송에서 막 따온 제철 사과로 선물세트를 준비했어요. 아삭하고 달콤한 맛 그대로 보내 드려요.", hashtags: ["#광고", "#사과선물세트", "#청송사과"] },
      틱톡: { caption: "[광고] 사과 박스 열어 볼게요. 제철 청송 사과 선물세트예요.", hashtags: ["#광고", "#사과", "#선물추천"] },
    },
    history: log([["기획중", "초안 생성됨", 40], ["초안 생성됨", "검수 대기", 31], ["검수 대기", "승인됨", 29]]),
  };
  const e: Campaign = {
    ...base, id: "e", name: "원두 정기배송 시작", status: "집행중", updatedAt: at(240),
    plan: plan({ productName: "원두 정기배송", productDescription: "매주 볶은 원두를 집으로 보내 드려요", price: "18000", channels: ["X"], budgetAmount: "60000", budgetDays: "14" }),
    drafts: { X: { caption: "[광고] 매주 볶은 원두를 집 앞까지. 원두 정기배송을 시작했어요.", hashtags: ["#광고", "#원두", "#홈카페"] } },
    schedule: { scheduledAt: at(242), amount: 60000, days: 14 }, publishedAt: at(240),
    history: log([["기획중", "초안 생성됨", 300], ["초안 생성됨", "검수 대기", 290], ["검수 대기", "승인됨", 289], ["승인됨", "게시 예약됨", 280], ["게시 예약됨", "집행중", 240]]),
  };
  const f: Campaign = {
    ...base, id: "f", name: "수제 쿠키 박스", status: "종료", updatedAt: at(290),
    plan: plan({ productName: "수제 쿠키 박스", productDescription: "버터 쿠키 6종을 담은 선물 박스", price: "16000", channels: ["인스타그램"], budgetAmount: "50000", budgetDays: "7" }),
    drafts: { 인스타그램: { caption: "[광고] 버터 향 가득한 쿠키 6종을 한 박스에 담았어요.", hashtags: ["#광고", "#수제쿠키", "#선물박스"] } },
    schedule: { scheduledAt: at(460), amount: 50000, days: 7 }, publishedAt: at(458), endedAt: at(290),
    history: log([["기획중", "초안 생성됨", 520], ["초안 생성됨", "검수 대기", 500], ["검수 대기", "승인됨", 499], ["승인됨", "게시 예약됨", 470], ["게시 예약됨", "집행중", 458], ["집행중", "종료", 290]]),
  };
  const g: Campaign = {
    ...base, id: "g", name: "가을 밤 라떼", status: "성과 평가 완료", updatedAt: at(480),
    plan: plan({ productName: "시그니처 밤 라떼", productDescription: "고소한 밤과 부드러운 우유", price: "6500", channels: ["인스타그램"], budgetAmount: "70000", budgetDays: "7" }),
    drafts: { 인스타그램: { caption: "[광고] 쌀쌀한 오후에 따뜻한 한 잔. 고소한 밤과 부드러운 우유가 만난 시그니처 밤 라떼를 만나보세요.", hashtags: ["#광고", "#가을메뉴", "#밤라떼", "#동네카페"] } },
    schedule: { scheduledAt: at(700), amount: 70000, days: 7 }, publishedAt: at(698), endedAt: at(530),
    performance: {
      impressions: 18400, clicks: 920, conversions: 64, cost: 70000, revenue: 218400, roas: 312,
      summary: "광고비 7만 원으로 매출 21만 8천 원이 나서 쓴 돈의 약 3배를 벌었어요. 클릭한 사람 100명 중 7명이 실제로 주문했어요.",
      suggestions: ["반응이 좋았던 ‘따뜻한 한 잔’ 같은 계절 표현을 다음 문구에도 써 보세요.", "주문이 많았던 오후 시간대에 맞춰 게시해 보세요.", "같은 예산으로 다음에는 X 채널도 함께 시험해 보세요."],
    },
    history: log([["기획중", "초안 생성됨", 760], ["초안 생성됨", "검수 대기", 740], ["검수 대기", "승인됨", 739], ["승인됨", "게시 예약됨", 720], ["게시 예약됨", "집행중", 698], ["집행중", "종료", 530], ["종료", "성과 평가 완료", 480]]),
  };
  const h: Campaign = {
    ...base, id: "h", name: "여름 샌들 할인", status: "취소", updatedAt: at(600),
    plan: plan({ productName: "가죽 샌들", productDescription: "통가죽 스트랩 샌들", price: "52000", category: "패션", channels: ["X"] }),
    drafts: { X: { caption: "[광고] 여름 샌들 마지막 할인", hashtags: ["#광고", "#샌들"] } },
    history: log([["기획중", "초안 생성됨", 620], ["초안 생성됨", "취소", 600]]),
  };
  return [a, b, c, d, e, f, g, h];
}

function validatePlan(input: PlanInput) {
  const fields: Record<string, string> = {};
  if (!input.productName.trim()) fields.productName = "상품명을 입력해 주세요";
  if (!input.productDescription.trim()) fields.productDescription = "상품 특징을 입력해 주세요";
  const price = Number(input.price);
  if (!input.price.trim() || !Number.isFinite(price) || price <= 0) fields.price = "가격을 0보다 큰 숫자로 입력해 주세요";
  if (!input.channels.length) fields.channels = "채널을 1개 이상 골라 주세요";
  const amount = Number(input.budgetAmount);
  if (!input.budgetAmount.trim() || !Number.isFinite(amount) || amount <= 0) fields.budgetAmount = "금액을 0보다 큰 숫자로 입력해 주세요";
  const days = Number(input.budgetDays);
  if (!input.budgetDays.trim() || !Number.isInteger(days) || days <= 0) fields.budgetDays = "기간을 1일 이상으로 입력해 주세요";
  if (Object.keys(fields).length) throw new ApiError("validation", "빈 항목이나 잘못된 값을 확인해 주세요.", fields);
}

function validatePerformance(input: PerformanceInput) {
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    const number = Number(String(value).replace(/,/g, ""));
    if (!String(value).trim()) fields[key] = "값을 입력해 주세요";
    else if (!Number.isFinite(number) || number < 0) fields[key] = "0 이상의 숫자로 입력해 주세요";
  }
  if (Object.keys(fields).length) throw new ApiError("validation", "빈 칸이나 음수가 있어요. 확인해 주세요.", fields);
}
const toNumber = (value: string) => Number(String(value).replace(/,/g, ""));

export type MockOptions = { delay?: number; now?: () => Date; actorId?: string; failNext?: "load" | "save" | "llm" };

export function createMockCampaignApi(options: MockOptions = {}): CampaignApi & {
  /** 게시 화면 mock과 같은 저장소를 쓰기 위한 연결 (데모 전용) */
  peek(id: string): Campaign | undefined;
  replace(campaign: Campaign): void;
} {
  const now = options.now ?? (() => new Date());
  const actor = options.actorId ?? ACTOR;
  let failNext = options.failNext;
  const store = new Map(seed(now().getTime()).map((campaign) => [campaign.id, campaign]));
  let serial = 0;
  const pause = () => new Promise<void>((resolve) => setTimeout(resolve, options.delay ?? 300));

  function allowedFor(campaign: Campaign): CampaignAction[] {
    return [...(ALLOWED[campaign.status] ?? [])];
  }
  function snapshot(campaign: Campaign): Campaign {
    return structuredClone({ ...campaign, allowedActions: allowedFor(campaign) });
  }
  function find(id: string) {
    const campaign = store.get(id);
    if (!campaign) throw new ApiError("not_found", "캠페인을 찾을 수 없습니다.");
    if (campaign.ownerId !== actor) throw new ApiError("forbidden", "이 캠페인을 조회하거나 변경할 권한이 없습니다.");
    return campaign;
  }
  function requireAction(id: string, action: CampaignAction) {
    const campaign = find(id);
    if (!allowedFor(campaign).includes(action)) {
      if (action === "cancel" && ["집행중", "일시정지", "종료", "성과 평가 완료"].includes(campaign.status)) {
        throw new ApiError("conflict", "이미 올린 광고는 플랫폼에서 직접 중지해 주세요.");
      }
      throw new ApiError("conflict", "현재 상태에서는 이 작업을 할 수 없습니다.");
    }
    return structuredClone(campaign);
  }
  function move(campaign: Campaign, to: CampaignStatus, by = actor, reason?: string) {
    campaign.history.push({ from: campaign.status, to, at: now().toISOString(), actor: by, ...(reason ? { reason } : {}) });
    campaign.status = to;
  }
  function commit(campaign: Campaign) {
    campaign.updatedAt = now().toISOString();
    store.set(campaign.id, campaign);
    return snapshot(campaign);
  }
  function maybeFail(kind: "save" | "llm") {
    if (failNext !== kind) return;
    failNext = undefined;
    if (kind === "llm") throw new ApiError("llm", "AI 응답을 받지 못했어요. 입력한 내용은 그대로 있어요. 잠시 뒤 다시 시도해 주세요.");
    throw new ApiError("network", "저장하지 못했어요. 입력한 내용을 확인하고 다시 시도해 주세요.");
  }
  function latestEvaluated() {
    return [...store.values()].filter((campaign) => campaign.ownerId === actor && campaign.status === "성과 평가 완료")
      .sort((x, y) => Date.parse(y.updatedAt) - Date.parse(x.updatedAt))[0];
  }
  function summarize(campaign: Campaign): CampaignSummary {
    return {
      id: campaign.id, name: campaign.name, status: campaign.status, updatedAt: campaign.updatedAt,
      channels: campaign.plan.channels, findingCount: campaign.findings.filter((finding) => !finding.applied).length,
      roas: campaign.performance?.roas ?? null,
    };
  }
  function blankCampaign(input: PlanInput): Campaign {
    serial += 1;
    return {
      id: `new-${serial}`, ownerId: actor, name: input.productName.trim() ? `${input.productName.trim()} 광고` : "이름 없는 캠페인",
      status: "기획중", updatedAt: now().toISOString(), plan: structuredClone(input), drafts: {}, findings: [], canApprove: false,
      history: [], allowedActions: [],
    };
  }
  function planTarget(id: string | null, input: PlanInput, action: CampaignAction) {
    if (id === null) return blankCampaign(input);
    const campaign = requireAction(id, action);
    campaign.plan = structuredClone(input);
    if (input.productName.trim()) campaign.name = `${input.productName.trim()} 광고`;
    return campaign;
  }

  return {
    peek: (id) => store.get(id),
    replace: (campaign) => { store.set(campaign.id, structuredClone(campaign)); },

    async listCampaigns() {
      await pause();
      if (failNext === "load") { failNext = undefined; throw new ApiError("network", "캠페인 목록을 불러오지 못했어요. 다시 시도해 주세요."); }
      return [...store.values()].filter((campaign) => campaign.ownerId === actor)
        .sort((x, y) => Date.parse(y.updatedAt) - Date.parse(x.updatedAt)).map(summarize);
    },
    async getCampaign(id) {
      await pause();
      if (failNext === "load") { failNext = undefined; throw new ApiError("network", "캠페인을 불러오지 못했어요. 다시 시도해 주세요."); }
      return snapshot(find(id));
    },
    async getLatestEvaluated() {
      await pause();
      const latest = latestEvaluated();
      return latest ? summarize(latest) : null;
    },
    async savePlan(id, input) {
      await pause();
      const campaign = planTarget(id, input, "save-plan");
      maybeFail("save");
      return commit(campaign);
    },
    async generateDraft(id, input) {
      await pause();
      const campaign = planTarget(id, input, "generate-draft");
      validatePlan(input);
      maybeFail("llm");
      const reference = latestEvaluated();
      campaign.drafts = Object.fromEntries(input.channels.map((channel) => [channel, writeDraft(input, channel)]));
      campaign.reference = reference ? { id: reference.id, name: reference.name, roas: reference.performance?.roas ?? null } : undefined;
      move(campaign, "초안 생성됨");
      return commit(campaign);
    },
    async saveDraft(id, channel, copy) {
      await pause();
      const campaign = requireAction(id, "save-draft");
      if (!campaign.plan.channels.includes(channel)) throw new ApiError("validation", "고르지 않은 채널입니다.");
      maybeFail("save");
      campaign.drafts[channel] = { caption: copy.caption, hashtags: copy.hashtags.filter((tag) => tag.trim()) };
      if (campaign.status === "검수 대기") {
        // 검수하지 않은 문구는 승인하지 않는다. 다시 검수해야 승인 버튼이 켜진다.
        campaign.canApprove = false;
        campaign.reviewOutdated = true;
      }
      return commit(campaign);
    },
    async regenerateChannel(id, channel) {
      await pause();
      const campaign = requireAction(id, "regenerate");
      maybeFail("llm");
      serial += 1;
      campaign.drafts[channel] = writeDraft(campaign.plan, channel, serial);
      return commit(campaign);
    },
    async requestReview(id, drafts) {
      await pause();
      const campaign = requireAction(id, "request-review");
      if (drafts) for (const channel of campaign.plan.channels) if (drafts[channel]) campaign.drafts[channel] = structuredClone(drafts[channel]);
      const empty = campaign.plan.channels.filter((channel) => !campaign.drafts[channel]?.caption.trim());
      if (empty.length) throw new ApiError("validation", `${empty.join(", ")} 캡션이 비어 있어요. 채운 뒤 검수를 요청해 주세요.`, { caption: "캡션을 입력해 주세요" });
      if (campaign.status !== "검수 대기") move(campaign, "검수 대기");
      campaign.rejectionReason = undefined;
      if (failNext === "llm") {
        // 검수(L2) 실패: 상태는 검수 대기 그대로, 승인 버튼은 꺼진 채로 둔다.
        failNext = undefined;
        campaign.findings = []; campaign.canApprove = false; campaign.reviewOutdated = false;
        campaign.reviewError = "검수 결과를 받지 못했어요. 잠시 뒤 다시 시도해 주세요.";
        return commit(campaign);
      }
      campaign.reviewError = undefined;
      campaign.reviewOutdated = false;
      campaign.findings = review(campaign);
      // 검수 성공 = 승인 가능. 위험 표현은 경고로만 보여 주고 상태를 바꾸지 않는다.
      campaign.canApprove = true;
      return commit(campaign);
    },
    async applyFix(id, findingId) {
      await pause();
      const campaign = requireAction(id, "apply-fix");
      const finding = campaign.findings.find((item) => item.id === findingId);
      if (!finding) throw new ApiError("not_found", "고쳐 쓴 문장을 찾을 수 없습니다.");
      if (finding.applied) throw new ApiError("conflict", "이미 적용한 문장입니다.");
      const copy = campaign.drafts[finding.channel];
      if (!copy) throw new ApiError("conflict", "문구를 찾을 수 없습니다.");
      if (finding.rule === "R1") copy.hashtags = ["#광고", ...copy.hashtags.filter((tag) => tag !== "#광고")];
      else if (finding.quote && finding.replacement !== undefined && copy.caption.includes(finding.quote)) {
        // 지금 문구에서 이 표현만 바꾼다. 앞서 적용한 수정은 그대로 둔다.
        copy.caption = copy.caption.replace(finding.quote, finding.replacement);
      } else throw new ApiError("conflict", "문구가 바뀌어서 이 제안을 적용할 수 없어요. 직접 고친 뒤 다시 검수를 요청해 주세요.");
      finding.applied = true;
      // 남은 제안의 '고쳐 쓴 문장'도 바뀐 문구 기준으로 다시 보여 준다.
      for (const other of campaign.findings) {
        if (other.applied || other.channel !== finding.channel || !other.quote || other.replacement === undefined) continue;
        other.suggestion = copy.caption.replace(other.quote, other.replacement);
      }
      return commit(campaign);
    },
    async approve(id) {
      await pause();
      const campaign = requireAction(id, "approve");
      if (!campaign.canApprove) throw new ApiError("conflict", campaign.reviewError ? "검수를 마치지 못해 승인할 수 없어요. 다시 검수를 요청해 주세요." : "고친 문구로 다시 검수를 요청한 뒤 승인할 수 있어요.");
      move(campaign, "승인됨");
      return commit(campaign);
    },
    async submitPerformance(id, input) {
      await pause();
      const campaign = requireAction(id, "submit-performance");
      validatePerformance(input);
      const cost = toNumber(input.cost), revenue = toNumber(input.revenue);
      campaign.performance = {
        impressions: toNumber(input.impressions), clicks: toNumber(input.clicks), conversions: toNumber(input.conversions),
        cost, revenue, roas: cost > 0 ? Math.round((revenue / cost) * 100) : null,
      };
      if (failNext === "llm") {
        // L3 실패: 숫자와 ROAS는 저장하고, 요약이 없으니 평가 완료는 막힌다.
        failNext = undefined;
        campaign.performance.summaryError = "AI 요약을 만들지 못했어요. 숫자는 저장했어요. 다시 ‘요약 만들기’를 눌러 주세요.";
        return commit(campaign);
      }
      const p = campaign.performance;
      const profit = p.roas === null ? "광고비가 0원이라 수익률은 계산할 수 없어요." : p.roas >= 100 ? `광고비보다 매출이 ${(p.roas / 100).toFixed(1)}배 많았어요.` : "매출이 광고비보다 적어서 이번에는 손해가 났어요.";
      const rate = p.clicks > 0 ? ` 클릭한 사람 100명 중 약 ${Math.round((p.conversions / p.clicks) * 100)}명이 구매했어요.` : "";
      p.summary = `${profit}${rate}`;
      p.suggestions = [
        p.clicks / Math.max(p.impressions, 1) < 0.02 ? "보는 사람에 비해 클릭이 적어요. 첫 줄에 가격이나 혜택을 바로 보여 주세요." : "클릭 반응이 좋았어요. 같은 첫 문장 형식을 다음 광고에도 써 보세요.",
        "주문이 많았던 요일·시간대를 확인해 그 시간에 게시해 보세요.",
        p.roas !== null && p.roas >= 100 ? "같은 예산으로 채널을 하나 더 시험해 보세요." : "예산을 줄여 문구 두 가지를 비교해 보세요.",
      ];
      return commit(campaign);
    },
    async completeEvaluation(id) {
      await pause();
      const campaign = requireAction(id, "complete-evaluation");
      if (!campaign.performance?.summary) throw new ApiError("conflict", "성과 요약을 먼저 만들어 주세요.");
      move(campaign, "성과 평가 완료");
      return commit(campaign);
    },
    async cancel(id) {
      await pause();
      const campaign = requireAction(id, "cancel");
      maybeFail("save");
      move(campaign, "취소");
      return commit(campaign);
    },
  };
}


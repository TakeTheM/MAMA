// 상태 이름은 docs/domain/03-rules-states-llm.md와 똑같이 쓴다.
// 이 파일은 화면 표시(배지 색, 진행 단계, 이동할 화면)만 정한다. 상태 전이 허용 여부는 백엔드(지금은 mock)가 정한다.
export type CampaignStatus =
  | "기획중" | "초안 생성됨" | "검수 대기" | "수정 요청" | "승인됨"
  | "게시 예약됨" | "플랫폼 반려" | "집행중" | "일시정지" | "종료" | "성과 평가 완료" | "취소";

export type Channel = "인스타그램" | "X" | "틱톡";
export const CHANNELS: Channel[] = ["인스타그램", "X", "틱톡"];

export type Tone = "red" | "green" | "yellow" | "gray";
export function statusTone(status: CampaignStatus): Tone {
  switch (status) {
    case "수정 요청": case "플랫폼 반려": return "red";
    case "승인됨": case "집행중": case "성과 평가 완료": return "green";
    case "검수 대기": case "일시정지": return "yellow";
    default: return "gray";
  }
}

export const STEPS = ["기획", "초안", "검수·승인", "게시 예약", "집행", "성과"] as const;
export function activeStep(status: CampaignStatus, canceledFrom?: CampaignStatus): number {
  switch (status) {
    case "기획중": return 0;
    case "초안 생성됨": return 1;
    case "검수 대기": case "수정 요청": return 2;
    case "승인됨": return 3;
    case "게시 예약됨": case "플랫폼 반려": case "집행중": case "일시정지": return 4;
    case "종료": case "성과 평가 완료": return 5;
    case "취소": return canceledFrom && canceledFrom !== "취소" ? activeStep(canceledFrom) : 0;
  }
}

/** 캠페인 상태별로 사장님이 열어야 할 화면 */
export function campaignPath(id: string, status: CampaignStatus): string {
  const base = `/campaigns/${encodeURIComponent(id)}`;
  switch (status) {
    case "기획중": return `${base}/plan`;
    case "초안 생성됨": return `${base}/draft`;
    case "검수 대기": case "수정 요청": return `${base}/review`;
    case "승인됨": return `${base}/publishing/schedule`;
    case "게시 예약됨": case "플랫폼 반려": case "집행중": case "일시정지": case "취소": return `${base}/publishing`;
    case "종료": case "성과 평가 완료": return `${base}/performance`;
  }
}

export function formatTime(value?: string) {
  if (!value) return "아직 기록되지 않음";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short",
  }).format(new Date(value));
}

/** 목록의 짧은 시각 표시 (예: 11.02 14:20, 한국 시간) */
export function formatShortTime(value: string) {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("month")}.${get("day")} ${get("hour")}:${get("minute")}`;
}

export const money = (amount: number) => `${amount.toLocaleString("ko-KR")}원`;

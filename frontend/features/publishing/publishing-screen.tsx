"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AppShell, DemoNotice } from "@/components/ui/app-shell";
import { CampaignHeading as SharedHeading } from "@/components/ui/campaign-heading";
import { Icon } from "@/components/ui/icon";
import { LoadGate } from "@/components/ui/load-gate";
import { canceledFrom, money } from "@/lib/campaign-status";
import ui from "@/components/ui/ui.module.css";
import { type Campaign, REVIEW_WARNING, formatTime, fromSeoulInput } from "./model";
import { SCENARIOS, type Scenario } from "./mock-adapter";
import { useDemoScenario, usePublishingSession } from "./publishing-session";
import styles from "./publishing.module.css";

export function PublishingShell({ children }: { children: ReactNode }) {
  const demo = useDemoScenario();
  const { campaign, pending, mutate } = usePublishingSession();
  return <AppShell active="campaigns" notice={demo && <DemoNotice>
    {<details><summary>데모 도구</summary><div className={ui.demoPanel}><label htmlFor="scenario">테스트 시나리오</label><select id="scenario" value={demo.scenario} disabled={pending} onChange={(event) => demo.changeScenario(event.target.value as Scenario)}>{SCENARIOS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div></details>}
  </DemoNotice>}>
    {campaign && <SharedHeading name={campaign.name} status={campaign.status} detail={`${campaign.product} · ${campaign.channels.join(", ")}`} canceledFrom={canceledFrom(campaign.status, campaign.history)} pending={pending}
      onCancel={campaign.allowedActions.includes("cancel") ? () => mutate({ action: "cancel" }) : undefined} />}
    {children}
  </AppShell>;
}

function SessionGate({ children }: { children: ReactNode }) {
  const { campaign, loadError, reload } = usePublishingSession();
  return <LoadGate data={campaign} loadError={loadError} reload={reload}>{() => children}</LoadGate>;
}
function recordsPath(id: string) { return `/campaigns/${encodeURIComponent(id)}/publishing`; }
function schedulePath(id: string) { return `${recordsPath(id)}/schedule`; }
const MANUAL_NOTICE = "MAMA는 플랫폼에 직접 올리거나 광고비를 쓰지 않아요. 예약 후 직접 올리고 ‘게시함’을 눌러 기록해 주세요.";

export function ScheduleScreen() {
  return <SessionGate><ScheduleContent /></SessionGate>;
}
function ScheduleContent() {
  const { campaign } = usePublishingSession();
  if (!campaign) return null;
  return <div className={styles.columns}>
    <div>{campaign.allowedActions.includes("schedule") ? <ScheduleForm campaign={campaign} /> : <section className={styles.card}><h2>저장된 게시 계획</h2><PlanFacts campaign={campaign} /><p className={styles.help}>현재 상태에서는 게시 계획을 변경할 수 없습니다.</p><Link className={styles.primary} href={recordsPath(campaign.id)}>게시·종료 기록 보기</Link></section>}</div>
    <ApprovalPanel campaign={campaign} />
  </div>;
}

function ScheduleForm({ campaign }: { campaign: Campaign }) {
  const router = useRouter();
  const { error, pending, mutate } = usePublishingSession();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [amount, setAmount] = useState(String(campaign.initialBudget.amount));
  const [days, setDays] = useState(String(campaign.initialBudget.days));
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  let iso = "";
  try { if (date && time) iso = fromSeoulInput(`${date}T${time}`); } catch { /* Invalid dates are validated by the adapter. */ }
  const difference = Date.parse(iso) - now;
  const nearReview = difference >= 0 && difference < 24 * 3600000;
  const invalid = (field: string) => error?.field === field;
  return <form noValidate className={styles.stack} onSubmit={async (event) => {
    event.preventDefault();
    const success = await mutate({ action: "schedule", schedule: { scheduledAt: iso, amount: amount.trim() ? Number(amount) : NaN, days: days.trim() ? Number(days) : NaN } });
    if (success) router.push(recordsPath(campaign.id));
  }}>
    <section className={styles.card} aria-labelledby="when-title"><h2 id="when-title">언제 올릴까요?</h2>
      <fieldset disabled={pending} className={styles.inputGrid}>
        <div><label htmlFor="scheduled-date">게시 예정일</label><input id="scheduled-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} aria-invalid={invalid("scheduledAt")} aria-describedby={`time-help${invalid("scheduledAt") ? " action-error" : ""}`} required /></div>
        <div><label htmlFor="scheduled-time">시각</label><input id="scheduled-time" type="time" value={time} onChange={(event) => setTime(event.target.value)} aria-invalid={invalid("scheduledAt")} aria-describedby={`time-help${invalid("scheduledAt") ? " action-error" : ""}`} required /></div>
      </fieldset>
      <p id="time-help" className={styles.help}>한국 시간(KST) 기준 · 모든 채널에 같은 시각을 적용합니다.</p>
      {nearReview && <ReviewWarning />}
    </section>
    <section className={styles.card} aria-labelledby="budget-title"><div className={styles.cardTitle}><h2 id="budget-title">예산</h2><p className={styles.help}>기획할 때 넣은 예산을 불러왔어요</p></div>
      <fieldset disabled={pending} className={styles.inputGrid}>
        <div><label htmlFor="budget-amount">금액 (원)</label><input id="budget-amount" type="number" min="0" step="any" value={amount} onChange={(event) => setAmount(event.target.value)} aria-invalid={invalid("amount")} aria-describedby={invalid("amount") ? "action-error" : undefined} required /></div>
        <div><label htmlFor="budget-days">기간 (일)</label><input id="budget-days" type="number" min="1" step="1" value={days} onChange={(event) => setDays(event.target.value)} aria-invalid={invalid("days")} aria-describedby={invalid("days") ? "action-error" : undefined} required /></div>
      </fieldset>
    </section>
    <div className={styles.saveRow}><p className={styles.help}>{MANUAL_NOTICE}</p><button className={styles.primary} type="submit" disabled={pending}>{pending ? "저장 중…" : "게시 예약"}</button></div>
    <Feedback />
  </form>;
}
function ReviewWarning() {
  return <div className={styles.warning} role="status"><Icon name="clock" /><div><strong>{REVIEW_WARNING}</strong><p>저장은 할 수 있어요. 심사가 늦어질 수 있으니 플랫폼에서 진행 상황을 확인해 주세요.</p></div></div>;
}
function ApprovalPanel({ campaign }: { campaign: Campaign }) {
  const approval = [...campaign.history].reverse().find((entry) => entry.to === "승인됨");
  return <aside className={styles.stack} aria-label="승인 정보"><section className={styles.card}><h2>승인된 문구</h2>{campaign.copies?.length ? campaign.copies.map((copy) => <div key={copy.channel} className={styles.approvedCopy}><strong>{copy.channel}</strong><p>{copy.caption}</p><p className={styles.help}>{copy.hashtags.join(" ")}</p></div>) : <div className={styles.approvedCopy}><strong>{campaign.channels.join(", ")}</strong><p>{campaign.caption}</p><p className={styles.help}>{campaign.hashtags.join(" ")}</p></div>}</section>
    {approval && <div className={styles.approval}><Icon name="check" /><span>{actorName(approval.actor)} · {formatTime(approval.at)} 승인</span></div>}
  </aside>;
}
function PlanFacts({ campaign }: { campaign: Campaign }) {
  return <dl className={styles.facts}><div><dt>게시 예정 시각</dt><dd>{formatTime(campaign.schedule?.scheduledAt)}</dd></div><div><dt>총 예산</dt><dd>{money(campaign.schedule?.amount ?? campaign.initialBudget.amount)}</dd></div><div><dt>기간</dt><dd>{campaign.schedule?.days ?? campaign.initialBudget.days}일</dd></div></dl>;
}

export function RecordsScreen() {
  return <SessionGate><RecordsContent /></SessionGate>;
}
function RecordsContent() {
  const { campaign, pending, error, warning, mutate } = usePublishingSession();
  const [reason, setReason] = useState("");
  if (!campaign) return null;
  const can = (action: "schedule" | "publish" | "end" | "reject" | "revise") => campaign.allowedActions.includes(action);
  return <div className={styles.columns}>
    <section className={styles.stack} aria-label="지금 할 일" aria-busy={pending}>
      <div className={styles.recordIntro}><h2>{can("publish") ? "플랫폼에 올리셨나요?" : "게시·종료 기록"}</h2><p>예약 시각: {formatTime(campaign.schedule?.scheduledAt)} · {campaign.channels.join(", ")}</p></div>
      {warning && <ReviewWarning />}
      {can("schedule") && <section className={styles.card}><h2>게시 계획을 먼저 정해 주세요</h2><p className={styles.help}>게시 예정 시각과 예산을 저장한 뒤 게시함·반려를 기록할 수 있습니다.</p><Link className={styles.primary} href={schedulePath(campaign.id)}>게시 시각·예산 정하기</Link></section>}
      {can("publish") && <section className={`${styles.card} ${styles.featured} ${styles.publishCard}`}><div><h3>올렸어요</h3><p>누른 시각이 게시 시각으로 기록되고 ‘집행중’이 돼요.</p></div><button className={styles.primary} disabled={pending} onClick={() => void mutate({ action: "publish" })}>게시함</button></section>}
      {can("reject") && <form className={styles.card} noValidate onSubmit={(event) => { event.preventDefault(); void mutate({ action: "reject", reason }); }}><div><h3>플랫폼에서 반려됐어요</h3><p>반려 사유를 남기면 ‘다시 고치기’ 후에도 함께 확인할 수 있어요.</p></div><div><label htmlFor="rejection-reason">반려 사유 <span className={styles.optional}>(필수)</span></label><textarea id="rejection-reason" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="플랫폼이 알려 준 사유를 그대로 붙여 넣어 주세요" disabled={pending} aria-invalid={error?.field === "reason"} aria-describedby={error?.field === "reason" ? "action-error" : undefined} required /></div><div className={styles.alignRight}><button className={styles.secondary} disabled={pending}>반려 기록</button></div></form>}
      {can("publish") && <div className={styles.dashed}><Icon name="info" /><p>‘집행중’이 되면 종료 버튼이 나와요. 플랫폼에서 광고가 끝난 뒤 눌러서 기록해 주세요.</p></div>}
      {can("end") && <section className={`${styles.card} ${styles.featured}`}><h3>광고가 끝났어요</h3><p>플랫폼에서 광고를 종료한 뒤 기록해 주세요. 기간이 지나도 자동 종료되지 않습니다.</p><div className={styles.alignRight}><button className={styles.primary} disabled={pending} onClick={() => void mutate({ action: "end" })}>종료 기록</button></div></section>}
      {campaign.rejectionReason && <section className={styles.card}><h3>플랫폼 반려 사유</h3><p className={styles.reason}>{campaign.rejectionReason}</p>{can("revise") && <div className={styles.alignRight}><button className={styles.primary} disabled={pending} onClick={() => void mutate({ action: "revise" })}>다시 고치기</button></div>}</section>}
      {campaign.status === "수정 요청" && <p className={styles.dashed}>반려 사유를 확인하고 문구와 상품 정보를 수정해 주세요. <Link className={styles.textLink} href={`/campaigns/${encodeURIComponent(campaign.id)}/review`}>문구 고치러 가기</Link></p>}
      {campaign.status === "종료" && <p className={styles.approval}><Icon name="check" />광고 집행 기록을 마쳤습니다. <Link className={styles.textLink} href={`/campaigns/${encodeURIComponent(campaign.id)}/performance`}>성과 숫자 입력하기</Link></p>}
      {campaign.status === "취소" && <p className={styles.dashed}>취소된 캠페인입니다. 저장된 기록만 확인할 수 있습니다.</p>}
      {!campaign.allowedActions.length && !["수정 요청", "종료", "취소"].includes(campaign.status) && <p className={styles.dashed}>현재 단계에서는 게시·집행 기록을 변경할 수 없습니다.</p>}
      <Feedback />
      <details className={styles.card}><summary>게시 계획과 승인 문구 확인</summary><PlanFacts campaign={campaign} /><p className={styles.reason}>{campaign.caption}</p><p className={styles.help}>{campaign.hashtags.join(" ")}</p><Link className={styles.textLink} href={schedulePath(campaign.id)}>게시 시각·예산 보기</Link></details>
      {(campaign.publishedAt || campaign.endedAt) && <dl className={`${styles.card} ${styles.facts}`}><div><dt>게시 시각</dt><dd>{formatTime(campaign.publishedAt)}</dd></div><div><dt>종료 시각</dt><dd>{formatTime(campaign.endedAt)}</dd></div></dl>}
      <p className={styles.help}>{MANUAL_NOTICE}</p>
    </section>
    <HistoryPanel campaign={campaign} />
  </div>;
}
function Feedback() {
  const { pending, error, notice } = usePublishingSession();
  return <div className={styles.feedback}>{pending && <p role="status">기록을 저장하고 있습니다…</p>}{error && <p id="action-error" role="alert" className={styles.error}>{error.message}</p>}<p role="status" aria-live="polite" className={styles.success}>{notice}</p></div>;
}
function actorName(actor: string) { return actor === "seller-demo" ? "사장님" : actor; }
function HistoryPanel({ campaign }: { campaign: Campaign }) {
  return <aside className={styles.card} aria-label="상태 기록"><div className={styles.cardTitle}><h2>상태 기록</h2><span className={styles.help}>{campaign.history.length}건</span></div>
    {campaign.history.length ? <ol className={styles.timeline}>{[...campaign.history].reverse().map((entry, index) => <li key={`${entry.at}-${index}`}><i /><div><h3>{entry.from} → {entry.to}</h3><p><time dateTime={entry.at}>{formatTime(entry.at)}</time> · {actorName(entry.actor)}</p>{entry.reason && <blockquote>{entry.reason}</blockquote>}</div></li>)}</ol> : <p className={styles.help}>아직 상태 변경 기록이 없습니다.</p>}
    <p className={styles.historyNote}>직접 기록한 시각 기준이에요. 실제 플랫폼의 게시·종료 시각과 다를 수 있습니다. 모든 시각은 한국 시간(KST)입니다.</p>
  </aside>;
}

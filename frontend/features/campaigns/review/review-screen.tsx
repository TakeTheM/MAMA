"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type KeyboardEvent, type ReactNode } from "react";
import { AppShell } from "@/components/ui/app-shell";
import { Icon } from "@/components/ui/icon";
import ui from "@/components/ui/ui.module.css";
import { type Channel, campaignPath } from "@/lib/campaign-status";
import { useCampaign } from "../api-context";
import type { Campaign, ChannelCopy, RiskFinding } from "../model";
import { Feedback, Heading, LoadGate, WrongStage } from "../shared";
import styles from "./review.module.css";

/** 04 검수 결과 · 수정 요청 (US-03). 위험 표현은 경고로 보여 주고, 승인은 사장님이 정한다. */
export function ReviewScreen({ campaignId }: { campaignId: string }) {
  const session = useCampaign(campaignId);
  return <AppShell active="campaigns">
    <LoadGate campaign={session.campaign} loadError={session.loadError} reload={session.reload}>{(campaign) => <>
      <Heading campaign={campaign} pending={session.pending} onCancel={() => session.run((api) => api.cancel(campaign.id), "캠페인을 취소했어요.")} />
      {campaign.status === "수정 요청" || campaign.status === "검수 대기"
        ? <ReviewBody key={campaign.id} campaign={campaign} session={session} />
        : <>
          <WrongStage campaign={campaign}>이 캠페인은 지금 ‘{campaign.status}’ 단계예요. <Link className={ui.textLink} href={campaignPath(campaign.id, campaign.status)}>지금 단계 화면으로 가기</Link></WrongStage>
          <Feedback pending={session.pending} error={session.error} notice={session.notice} />
        </>}
    </>}</LoadGate>
  </AppShell>;
}

type Session = ReturnType<typeof useCampaign>;

/**
 * 제안 하나를 문구에 넣는다. 위험 표현 자리만 바꿔서 앞서 고친 내용은 그대로 둔다.
 * 표현을 찾을 수 없으면(이미 고친 경우) null.
 */
export function applyFinding(copy: ChannelCopy, finding: RiskFinding): ChannelCopy | null {
  if (!finding.quote || finding.replacement === undefined) {
    // 광고 표시 누락(R1)처럼 바꿀 자리가 없는 경고는 #광고를 맨 앞에 붙인다.
    return { ...copy, hashtags: ["#광고", ...copy.hashtags.filter((tag) => tag !== "#광고")] };
  }
  if (copy.caption.includes(finding.quote)) return { ...copy, caption: copy.caption.replace(finding.quote, finding.replacement) };
  const index = copy.hashtags.findIndex((tag) => tag.includes(finding.quote as string));
  if (index < 0) return null;
  const hashtags = [...copy.hashtags];
  hashtags[index] = hashtags[index].replace(finding.quote, finding.replacement);
  return { ...copy, hashtags: hashtags.filter((tag) => tag.trim()) };
}

function ReviewBody({ campaign, session }: { campaign: Campaign; session: Session }) {
  const router = useRouter();
  const channels = campaign.plan.channels;
  // 고친 문구는 '다시 검수 요청'과 함께 보낸다(백엔드는 검수 대기에서 문구를 따로 저장하지 않는다).
  const [base, setBase] = useState(campaign.updatedAt);
  const [drafts, setDrafts] = useState(() => structuredClone(campaign.drafts));
  const [applied, setApplied] = useState<string[]>([]);
  const [localError, setLocalError] = useState("");
  if (base !== campaign.updatedAt) {
    setBase(campaign.updatedAt); setDrafts(structuredClone(campaign.drafts)); setApplied([]); setLocalError("");
  }
  const allFindings = campaign.findings.map((finding) => ({ ...finding, applied: finding.applied || applied.includes(finding.id) }));
  const open = allFindings.filter((finding) => !finding.applied);
  const [active, setActive] = useState<Channel>(() => open[0]?.channel ?? channels[0]);
  const [editing, setEditing] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const copy = drafts[active] ?? { caption: "", hashtags: [] };
  const findings = allFindings.filter((finding) => finding.channel === active);
  const changed = JSON.stringify(drafts) !== JSON.stringify(campaign.drafts);
  const canEdit = campaign.allowedActions.includes("request-review") && !campaign.reviewPending;
  const canApprove = campaign.allowedActions.includes("approve") && campaign.canApprove && !changed;

  async function approve() {
    setConfirmApprove(false);
    const next = await session.run((api) => api.approve(campaign.id));
    if (next) router.push(`/campaigns/${encodeURIComponent(campaign.id)}/publishing/schedule`);
  }
  async function rereview() {
    const next = await session.run((api) => api.requestReview(campaign.id, changed ? drafts : undefined));
    if (!next) return;
    setEditing(false);
    setActive(next.findings[0]?.channel ?? active);
  }
  function apply(finding: RiskFinding) {
    const next = applyFinding(drafts[finding.channel] ?? { caption: "", hashtags: [] }, finding);
    if (!next) { setLocalError("문구가 바뀌어서 이 제안을 넣을 수 없어요. 직접 고친 뒤 다시 검수를 요청해 주세요."); return; }
    setLocalError("");
    setDrafts({ ...drafts, [finding.channel]: next });
    setApplied([...applied, finding.id]);
  }
  function onTabKey(event: KeyboardEvent<HTMLButtonElement>) {
    const move = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!move) return;
    event.preventDefault();
    const next = channels[(channels.indexOf(active) + move + channels.length) % channels.length];
    setActive(next);
    document.getElementById(`review-tab-${next}`)?.focus();
  }

  return <>
    <ResultBanner campaign={campaign} openCount={open.length} changed={changed} />
    <div className={`${ui.columns} ${ui.columnsWide}`}>
      <section aria-label="검수한 문구" className={ui.stack} aria-busy={session.pending}>
        <div role="tablist" aria-label="채널" className={ui.tabs}>
          {channels.map((channel) => {
            const count = open.filter((finding) => finding.channel === channel).length;
            return <button key={channel} id={`review-tab-${channel}`} type="button" role="tab" className={ui.tab} aria-selected={channel === active} aria-controls="review-panel" tabIndex={channel === active ? 0 : -1} onKeyDown={onTabKey} onClick={() => setActive(channel)}>
              {channel}<span className={ui.count} data-alert={count > 0} aria-label={`위험 표현 ${count}개`}>{count}</span>
            </button>;
          })}
        </div>

        <div id="review-panel" role="tabpanel" aria-labelledby={`review-tab-${active}`} className={ui.card}>
          {editing ? <>
            <div><label htmlFor="edit-caption">캡션</label><textarea id="edit-caption" rows={6} value={copy.caption} disabled={session.pending} onChange={(event) => setDrafts({ ...drafts, [active]: { ...copy, caption: event.target.value } })} /></div>
            <div><label htmlFor="edit-tags">해시태그 <span className={ui.optional}>(띄어쓰기로 구분)</span></label><input id="edit-tags" type="text" value={copy.hashtags.join(" ")} disabled={session.pending} onChange={(event) => setDrafts({ ...drafts, [active]: { ...copy, hashtags: event.target.value.split(/\s+/).filter(Boolean).map((tag) => (tag.startsWith("#") ? tag : `#${tag}`)) } })} /></div>
            <div className={ui.actions}><button type="button" className={`${ui.secondary} ${ui.small}`} onClick={() => setEditing(false)}>고치기 마침</button></div>
          </> : <>
            <span className={styles.caption}>캡션</span>
            <p className={styles.copy}><Marked text={copy.caption} findings={findings} /></p>
            <p className={styles.tags}><Marked text={copy.hashtags.join(" ")} findings={findings} />{findings.filter((finding) => !finding.quote && !finding.applied).map((finding) => <mark key={finding.id} className={styles.missing}> 광고 표시 없음<sup>{findings.indexOf(finding) + 1}</sup></mark>)}</p>
            {canEdit && <div className={ui.alignRight}><button type="button" className={ui.ghost} disabled={session.pending} onClick={() => setEditing(true)}>직접 고치기</button></div>}
          </>}
        </div>

        <div className={styles.decision}>
          <span id="approve-hint" className={ui.help}>{approveHint(campaign, canApprove, open.length, changed)}</span>
          {!confirmApprove && <button type="button" className={`${ui.secondary} ${ui.off}`} disabled={!canApprove || session.pending} aria-describedby="approve-hint" onClick={() => (open.length ? setConfirmApprove(true) : void approve())}>승인</button>}
          {(campaign.allowedActions.includes("request-review") || changed) && <button type="button" className={ui.primary} disabled={session.pending || !campaign.allowedActions.includes("request-review")} onClick={() => { setConfirmApprove(false); void rereview(); }}>{session.pending ? "요청 중…" : "다시 검수 요청"}</button>}
        </div>
        {confirmApprove && <div className={ui.confirm} role="alertdialog" aria-labelledby="approve-title" aria-describedby="approve-desc">
          <div><strong id="approve-title">경고 {open.length}개가 남아 있어요. 이대로 승인할까요?</strong><p id="approve-desc">승인한 계정과 시각이 상태 기록에 남아요. 위험 표현을 확인한 뒤 결정해 주세요.</p></div>
          <div>
            <button type="button" className={ui.ghost} disabled={session.pending} onClick={() => setConfirmApprove(false)}>돌아가기</button>
            <button type="button" className={`${ui.primary} ${ui.small}`} disabled={session.pending} onClick={() => void approve()}>그대로 승인</button>
          </div>
        </div>}
        {localError && <p role="alert" className={ui.error}>{localError}</p>}
        <Feedback pending={session.pending} error={session.error} notice={session.notice} />
      </section>

      <aside aria-label="위험 표현 목록" className={ui.stack}>
        {findings.length ? findings.map((finding, index) => <FindingCard key={finding.id} finding={finding} index={index + 1} disabled={session.pending || !canEdit} onApply={() => apply(finding)} />)
          : <p className={ui.dashed}>{active} 문구에서 찾은 위험 표현이 없어요.</p>}
      </aside>
    </div>
  </>;
}

function ResultBanner({ campaign, openCount, changed }: { campaign: Campaign; openCount: number; changed: boolean }) {
  if (changed) return <Banner tone="alert" title="고친 문구로 다시 검수를 요청해 주세요"><span>고친 내용은 아직 저장되지 않았어요. ‘다시 검수 요청’을 누르면 고친 문구로 저장하고 검수해요.</span></Banner>;
  if (campaign.reviewPending) return <Banner tone="alert" title="검수하고 있어요"><span>잠시 뒤 새로고침해 주세요.</span></Banner>;
  if (campaign.rejectionReason && campaign.status === "수정 요청") {
    return <Banner tone="alert" title="플랫폼에서 반려된 광고예요">
      <span>반려 사유: {campaign.rejectionReason}</span>
      <span>문구나 상품 정보를 고친 뒤 다시 검수를 요청해 주세요.</span>
    </Banner>;
  }
  if (campaign.reviewError) return <Banner tone="alert" title="검수를 마치지 못했어요"><span>{campaign.reviewError}</span></Banner>;
  if (campaign.status === "수정 요청") return <Banner tone="alert" title="문구를 고친 뒤 다시 검수를 요청해 주세요"><span>다시 검수를 마치면 승인할 수 있어요.</span></Banner>;
  if (campaign.canApprove && openCount > 0) {
    return <Banner tone="alert" title={`위험 표현 ${openCount}개를 찾았어요`}><span>고쳐 쓴 문장을 적용하거나 직접 고치는 걸 권해요. 내용을 확인했다면 그대로 승인할 수도 있어요.</span></Banner>;
  }
  if (campaign.canApprove) return <Banner tone="ok" title="위험 표현이 없어요"><span>문구를 한 번 더 확인하고 ‘승인’을 눌러 주세요. AI 검수만으로는 승인되지 않아요.</span></Banner>;
  return <Banner tone="alert" title="검수 결과를 기다리고 있어요"><span>잠시 뒤 새로고침해 주세요.</span></Banner>;
}
function approveHint(campaign: Campaign, canApprove: boolean, openCount: number, changed: boolean) {
  if (changed) return "고친 문구로 다시 검수해야 승인할 수 있어요";
  if (canApprove) return openCount ? `경고 ${openCount}개를 확인했다면 그대로 승인할 수 있어요` : "위험 표현이 없어요. 문구를 확인하고 승인해 주세요.";
  if (campaign.reviewError) return "검수를 마쳐야 승인할 수 있어요";
  return "고친 문구로 다시 검수해야 승인할 수 있어요";
}
function Banner({ tone, title, children }: { tone: "alert" | "ok"; title: string; children: ReactNode }) {
  return <div role="status" className={tone === "ok" ? ui.okBox : ui.alertBox}><Icon name={tone === "ok" ? "check" : "warning"} size={22} /><div><strong>{title}</strong>{children}</div></div>;
}

/** 캡션 안의 위험 표현을 찾아 번호와 함께 강조한다 */
function Marked({ text, findings }: { text: string; findings: RiskFinding[] }) {
  const marks = findings.map((finding, index) => ({ finding, no: index + 1 })).filter(({ finding }) => finding.quote && !finding.applied);
  const parts: ReactNode[] = [];
  let rest = text;
  let key = 0;
  while (rest) {
    const hit = marks.map((mark) => ({ ...mark, at: rest.indexOf(mark.finding.quote as string) })).filter((mark) => mark.at >= 0).sort((x, y) => x.at - y.at)[0];
    if (!hit) { parts.push(rest); break; }
    const quote = hit.finding.quote as string;
    parts.push(rest.slice(0, hit.at));
    parts.push(<mark key={key++}><span>{quote}</span><sup>{hit.no}</sup></mark>);
    rest = rest.slice(hit.at + quote.length);
  }
  return <>{parts}</>;
}

function FindingCard({ finding, index, disabled, onApply }: { finding: RiskFinding; index: number; disabled: boolean; onApply: () => void }) {
  return <article className={`${ui.card} ${styles.finding}`} data-applied={finding.applied} aria-labelledby={`finding-${finding.id}`}>
    <div className={styles.findingHead}><span className={styles.no}>{index}</span><span className={styles.rule}>{finding.rule} {finding.ruleLabel}</span>{finding.applied && <span className={styles.done}><Icon name="check" size={14} />적용됨</span>}</div>
    <h3 id={`finding-${finding.id}`}>{finding.title}</h3>
    <p className={styles.reason}>{finding.reason}</p>
    {finding.source && <a className={styles.source} href={finding.source.url} target="_blank" rel="noopener noreferrer"><Icon name="link" size={16} />근거 자료: {finding.source.title}<span className={ui.srOnly}> (새 창)</span></a>}
    <div className={styles.suggestion}><span>이렇게 바꿔 보세요</span><p>{finding.suggestion}</p></div>
    <div className={ui.alignRight}><button type="button" className={`${ui.primary} ${ui.small}`} disabled={disabled || finding.applied} onClick={onApply}>{finding.applied ? "적용됨" : "적용"}</button></div>
  </article>;
}

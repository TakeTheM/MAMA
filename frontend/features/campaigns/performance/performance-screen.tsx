"use client";

import Link from "next/link";
import { useState } from "react";
import { AppShell } from "@/components/ui/app-shell";
import { Icon } from "@/components/ui/icon";
import ui from "@/components/ui/ui.module.css";
import { campaignPath, money } from "@/lib/campaign-status";
import { useCampaign } from "../api-context";
import type { Campaign, PerformanceField, PerformanceInput } from "../model";
import { Feedback, Heading, LoadGate, WrongStage } from "../shared";
import styles from "./performance.module.css";

const FIELDS: { key: PerformanceField; label: string; unit?: string }[] = [
  { key: "impressions", label: "노출" }, { key: "clicks", label: "클릭" }, { key: "conversions", label: "전환" },
  { key: "cost", label: "광고비", unit: "원" }, { key: "revenue", label: "매출", unit: "원" },
];

/** 07 성과 요약·다음 제안 (US-05) */
export function PerformanceScreen({ campaignId }: { campaignId: string }) {
  const session = useCampaign(campaignId);
  return <AppShell active="performance">
    <LoadGate campaign={session.campaign} loadError={session.loadError} reload={session.reload}>{(campaign) => <>
      <Heading campaign={campaign} pending={session.pending} onCancel={() => session.run((api) => api.cancel(campaign.id))} />
      {campaign.status === "종료" || campaign.status === "성과 평가 완료"
        ? <PerformanceBody key={campaign.id} campaign={campaign} session={session} />
        : <WrongStage campaign={campaign}>광고를 종료 기록한 뒤에 성과를 넣을 수 있어요. <Link className={ui.textLink} href={campaignPath(campaign.id, campaign.status)}>지금 단계 화면으로 가기</Link></WrongStage>}
    </>}</LoadGate>
  </AppShell>;
}

type Session = ReturnType<typeof useCampaign>;
const fromSaved = (campaign: Campaign): PerformanceInput => {
  const p = campaign.performance;
  return { impressions: p ? String(p.impressions) : "", clicks: p ? String(p.clicks) : "", conversions: p ? String(p.conversions) : "", cost: p ? String(p.cost) : "", revenue: p ? String(p.revenue) : "" };
};

function PerformanceBody({ campaign, session }: { campaign: Campaign; session: Session }) {
  const [values, setValues] = useState<PerformanceInput>(() => fromSaved(campaign));
  const editable = campaign.allowedActions.includes("submit-performance");
  const p = campaign.performance;
  const fieldError = (key: PerformanceField) => session.error?.fields[key];

  return <div className={`${ui.columns} ${ui.columnsLeft}`}>
    <form noValidate aria-label="성과 입력" className={`${ui.card} ${styles.form}`} onSubmit={(event) => { event.preventDefault(); void session.run((api) => api.submitPerformance(campaign.id, values), "숫자를 저장하고 요약을 만들었어요."); }}>
      <div><h2>성과 숫자 입력</h2><p className={ui.help}>플랫폼 광고 관리자에서 확인한 값을 넣어 주세요</p></div>
      <fieldset disabled={!editable || session.pending} className={styles.grid}>
        {FIELDS.map((field) => <div key={field.key} data-wide={field.key === "revenue"}>
          <label htmlFor={field.key}>{field.label}</label>
          <div className={styles.unit}>
            <input id={field.key} type="text" inputMode="numeric" value={values[field.key]} placeholder="0" onChange={(event) => setValues({ ...values, [field.key]: event.target.value })} aria-invalid={fieldError(field.key) ? true : undefined} aria-describedby={fieldError(field.key) ? `${field.key}-error` : undefined} />
            {field.unit && <span aria-hidden="true">{field.unit}</span>}
          </div>
          {fieldError(field.key) && <p id={`${field.key}-error`} className={ui.fieldError}><Icon name="alert" size={16} />{fieldError(field.key)}</p>}
        </div>)}
      </fieldset>
      {editable && <button className={`${ui.secondary} ${ui.block}`} type="submit" disabled={session.pending}><Icon name="sparkle" size={18} />{session.pending ? "요약을 만들고 있어요…" : p ? "다시 요약 만들기" : "요약 만들기"}</button>}
      <Feedback pending={false} error={session.error} notice={session.notice} />
    </form>

    <section aria-label="결과" className={ui.stack}>
      <div className={styles.metrics}>
        <div className={styles.roas}>
          <div><span>ROAS · 매출 ÷ 광고비</span><strong>{!p ? "—" : p.roas === null ? "계산할 수 없음" : `${p.roas.toLocaleString("ko-KR")}%`}</strong></div>
          <span className={styles.system}>시스템 계산</span>
        </div>
        {(["impressions", "clicks", "conversions"] as const).map((key) => <div key={key} className={styles.metric}><span>{FIELDS.find((field) => field.key === key)?.label}</span><strong>{p ? p[key].toLocaleString("ko-KR") : "—"}</strong></div>)}
      </div>
      {p && <p className={ui.help}>광고비 {money(p.cost)} · 매출 {money(p.revenue)}{p.roas === null && " · 광고비가 0원이라 ROAS를 계산할 수 없어요."}</p>}

      <article className={ui.card} aria-labelledby="summary-title">
        <div className={ui.cardTitle}><h2 id="summary-title" className={ui.sectionTitle}><Icon name="sparkle" size={18} />AI 요약</h2>{p?.summary && campaign.status === "종료" && <span className={ui.help}>확인한 뒤 ‘평가 완료’를 눌러 주세요</span>}</div>
        {p?.summaryError && <p role="alert" className={ui.error}>{p.summaryError}</p>}
        {p?.summary ? <>
          <div className={styles.block}><span>결과 요약</span><p className={styles.summary}>{p.summary}</p></div>
          <div className={`${styles.block} ${styles.divided}`}><span>다음 광고 제안</span>
            <ol className={styles.suggestions}>{p.suggestions?.map((item, index) => <li key={item}><b>{index + 1}</b>{item}</li>)}</ol>
          </div>
        </> : !p?.summaryError && <p className={ui.help}>성과 숫자를 넣고 ‘요약 만들기’를 누르면 이번 광고로 수익이 났는지 쉬운 말로 알려 드려요. 숫자는 시스템이 계산한 값을 그대로 보여 줘요.</p>}
      </article>

      {campaign.status === "종료" ? <div className={ui.actionsSplit}>
        <span className={ui.help}>평가를 완료하면 이 문구와 성과가 다음 캠페인 초안에 반영돼요.</span>
        <button type="button" className={ui.primary} disabled={session.pending || !campaign.allowedActions.includes("complete-evaluation")} onClick={() => void session.run((api) => api.completeEvaluation(campaign.id), "평가를 완료했어요. 다음 초안에 반영돼요.")}>평가 완료</button>
      </div> : <div className={ui.approval}><Icon name="check" /><span>평가를 마친 캠페인이에요. 다음 캠페인 초안을 만들 때 참고해요. <Link className={ui.textLink} href="/campaigns/new">새 캠페인 만들기</Link></span></div>}
    </section>
  </div>;
}

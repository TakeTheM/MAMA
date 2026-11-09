"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/ui/app-shell";
import { Icon } from "@/components/ui/icon";
import { StatusBadge } from "@/components/ui/status-badge";
import ui from "@/components/ui/ui.module.css";
import { type CampaignStatus, campaignPath, formatShortTime } from "@/lib/campaign-status";
import { asApiError, useCampaignApi } from "../api-context";
import type { ApiError, CampaignSummary } from "../model";
import styles from "./list.module.css";

const GROUPS = {
  action: ["수정 요청", "플랫폼 반려"],
  progress: ["기획중", "초안 생성됨", "검수 대기", "승인됨", "게시 예약됨"],
  running: ["집행중", "일시정지"],
  waiting: ["종료"],
  done: ["성과 평가 완료"],
  canceled: ["취소"],
} satisfies Record<string, CampaignStatus[]>;
type Filter = "all" | "action" | "progress" | "running" | "done" | "canceled";
const FILTERS: [Filter, string][] = [["all", "전체"], ["action", "조치 필요"], ["progress", "진행 중"], ["running", "집행중"], ["done", "완료"], ["canceled", "취소"]];
const inGroup = (group: CampaignStatus[], status: CampaignStatus) => group.includes(status);

/** 목록의 '다음 할 일' 안내 (화면 문구일 뿐, 할 수 있는지는 각 화면에서 백엔드 응답으로 다시 정해진다) */
function nextStep(campaign: CampaignSummary): { text: string; urgent?: boolean } {
  switch (campaign.status) {
    case "수정 요청": return { text: campaign.findingCount ? `위험 표현 ${campaign.findingCount}개 고치기` : "문구 고치고 다시 검수 요청", urgent: true };
    case "플랫폼 반려": return { text: "반려 사유 보고 다시 고치기", urgent: true };
    case "기획중": return { text: "기획 마저 쓰고 초안 만들기" };
    case "초안 생성됨": return { text: "초안 확인하고 검수 요청" };
    case "검수 대기": return campaign.findingCount ? { text: `경고 ${campaign.findingCount}개 확인하고 승인`, urgent: true } : { text: "검수 결과 확인하고 승인" };
    case "승인됨": return { text: "게시 시각·예산 정하기" };
    case "게시 예약됨": return { text: "올린 뒤 ‘게시함’ 기록" };
    case "집행중": return { text: "끝나면 종료 기록" };
    case "일시정지": return { text: "플랫폼에서 상태 확인" };
    case "종료": return { text: "성과 숫자 입력" };
    case "성과 평가 완료": return { text: "다음 초안에 반영됨" };
    case "취소": return { text: "—" };
  }
}

function useCampaignList() {
  const api = useCampaignApi();
  const [items, setItems] = useState<CampaignSummary[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    api.listCampaigns().then((data) => { if (active) setItems(data); })
      .catch((failure: unknown) => { if (active) setError(asApiError(failure)); });
    return () => { active = false; };
  }, [api, attempt]);
  return { items, error, retry: () => { setError(null); setItems(null); setAttempt((value) => value + 1); } };
}

function ListState({ error, retry }: { error: ApiError | null; retry: () => void }) {
  if (error) return <section className={ui.empty} role="alert"><h2>목록을 불러오지 못했어요</h2><p>{error.message}</p><button className={ui.primary} onClick={retry}>다시 시도</button></section>;
  return <section className={ui.empty} role="status"><h2>캠페인을 불러오는 중입니다</h2><p>잠시만 기다려 주세요.</p></section>;
}

export function CampaignListScreen() {
  const { items, error, retry } = useCampaignList();
  const [filter, setFilter] = useState<Filter>("all");
  const count = (group: CampaignStatus[]) => items?.filter((item) => inGroup(group, item.status)).length ?? 0;
  const visible = items?.filter((item) => filter === "all" || inGroup(GROUPS[filter], item.status)) ?? [];

  return <AppShell active="campaigns">
    <div className={ui.pageHead}>
      <div><h1>캠페인</h1><p className={ui.lead}>광고 한 건을 기획부터 성과 확인까지 이어서 관리해요.</p></div>
      <Link href="/campaigns/new" className={ui.primary}><Icon name="plus" size={18} />새 캠페인 만들기</Link>
    </div>
    {!items ? <ListState error={error} retry={retry} /> : <>
      <section aria-label="상태 요약" className={styles.summary}>
        <div className={styles.stat} data-alert={count(GROUPS.action) > 0}><span><i />조치 필요</span><strong>{count(GROUPS.action)}</strong><small>수정 요청 · 플랫폼 반려</small></div>
        <div className={styles.stat}><span>진행 중</span><strong>{count(GROUPS.progress)}</strong><small>기획 ~ 게시 예약</small></div>
        <div className={styles.stat}><span>집행중</span><strong>{count(GROUPS.running)}</strong><small>플랫폼에 올라간 광고</small></div>
        <div className={styles.stat}><span>성과 입력 대기</span><strong>{count(GROUPS.waiting)}</strong><small>종료된 광고</small></div>
      </section>
      <section aria-label="캠페인 목록" className={ui.stack}>
        <div className={ui.pills} role="group" aria-label="상태로 거르기">
          {FILTERS.map(([key, label]) => <button key={key} type="button" className={ui.pill} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label} {key === "all" ? items.length : count(GROUPS[key])}</button>)}
        </div>
        <CampaignTable items={visible} column="next" />
      </section>
    </>}
  </AppShell>;
}

export function PerformanceListScreen() {
  const { items, error, retry } = useCampaignList();
  const rows = items?.filter((item) => inGroup([...GROUPS.waiting, ...GROUPS.done], item.status)) ?? [];
  return <AppShell active="performance">
    <div className={ui.pageHead}><div><h1>성과 기록</h1><p className={ui.lead}>끝난 광고의 성과 숫자를 넣고, 요약과 다음 광고 제안을 확인해요.</p></div></div>
    {!items ? <ListState error={error} retry={retry} /> : <section aria-label="성과 기록 목록" className={ui.stack}>
      <CampaignTable items={rows} column="roas" empty="아직 끝난 광고가 없어요. 집행중인 광고를 종료 기록하면 여기에 나와요." />
    </section>}
  </AppShell>;
}

function CampaignTable({ items, column, empty = "이 조건에 맞는 캠페인이 없어요." }: { items: CampaignSummary[]; column: "next" | "roas"; empty?: string }) {
  if (!items.length) return <p className={ui.dashed}>{empty}</p>;
  return <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="캠페인 표">
    <table className={styles.table}>
      <thead><tr><th scope="col">캠페인</th><th scope="col">채널</th><th scope="col">상태</th><th scope="col">{column === "next" ? "다음 할 일" : "ROAS"}</th><th scope="col">최근 변경</th></tr></thead>
      <tbody>{items.map((item) => {
        const step = nextStep(item);
        const quiet = item.status === "취소";
        return <tr key={item.id} data-quiet={quiet}>
          <td><Link href={campaignPath(item.id, item.status)}>{item.name}</Link></td>
          <td>{item.channels.join(" · ")}</td>
          <td><StatusBadge status={item.status} size="sm" /></td>
          {column === "next"
            ? <td data-urgent={step.urgent ?? false}>{step.text}</td>
            : <td>{item.status === "종료" ? <span data-urgent="true">성과 숫자 입력</span> : item.roas === null ? "계산할 수 없음" : `${item.roas.toLocaleString("ko-KR")}%`}</td>}
          <td className={styles.time}><time dateTime={item.updatedAt}>{formatShortTime(item.updatedAt)}</time></td>
        </tr>;
      })}</tbody>
    </table>
  </div>;
}

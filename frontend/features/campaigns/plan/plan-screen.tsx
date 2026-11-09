"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AppShell } from "@/components/ui/app-shell";
import { Icon } from "@/components/ui/icon";
import ui from "@/components/ui/ui.module.css";
import { CHANNELS, type Channel, campaignPath } from "@/lib/campaign-status";
import { asApiError, useCampaign, useCampaignApi } from "../api-context";
import { type ApiError, type Campaign, type CampaignSummary, CATEGORIES, GOALS, type PlanField, type PlanInput } from "../model";
import { Feedback, Heading, LoadGate, WrongStage } from "../shared";
import styles from "./plan.module.css";

const EMPTY: PlanInput = { productName: "", productDescription: "", price: "", category: "식품", goal: "구매 늘리기", channels: [], budgetAmount: "", budgetDays: "" };

/** 02 새 캠페인 · 기획중 (US-01) */
export function NewCampaignScreen() {
  return <AppShell active="new">
    <div className={ui.pageHead}><div>
      <p className={ui.breadcrumb}><Link href="/">캠페인</Link><span aria-hidden="true">›</span><span>새 캠페인</span></p>
      <h1>어떤 광고를 만들까요?</h1>
      <p className={ui.lead}>4가지만 채우면 채널별 캡션과 해시태그 초안을 만들어 드려요.</p>
    </div></div>
    <PlanForm campaignId={null} initial={EMPTY} />
  </AppShell>;
}

/** 임시 저장한 기획중 캠페인을 이어서 쓰는 화면 */
export function PlanScreen({ campaignId }: { campaignId: string }) {
  const session = useCampaign(campaignId);
  return <AppShell active="campaigns">
    <LoadGate campaign={session.campaign} loadError={session.loadError} reload={session.reload}>{(campaign) => <>
      <Heading campaign={campaign} pending={session.pending} onCancel={() => session.run((api) => api.cancel(campaign.id), "캠페인을 취소했어요.")} />
      {campaign.allowedActions.includes("generate-draft")
        ? <PlanForm key={campaign.id} campaignId={campaign.id} initial={campaign.plan} />
        : <><WrongStage campaign={campaign}>이미 초안을 만든 캠페인이에요. <Link className={ui.textLink} href={campaignPath(campaign.id, campaign.status)}>지금 단계 화면으로 가기</Link></WrongStage>
          <Feedback pending={session.pending} error={session.error} notice={session.notice} /></>}
    </>}</LoadGate>
  </AppShell>;
}

function PlanForm({ campaignId, initial }: { campaignId: string | null; initial: PlanInput }) {
  const api = useCampaignApi();
  const router = useRouter();
  const [values, setValues] = useState<PlanInput>(initial);
  const [pending, setPending] = useState<"save" | "draft" | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState("");
  const [reference, setReference] = useState<CampaignSummary | null>(null);
  // 첫 임시 저장으로 만든 캠페인 id. 다음 저장·초안 만들기는 이 캠페인에 한다(중복 생성 방지).
  const [savedId, setSavedId] = useState<string | null>(campaignId);

  useEffect(() => {
    let active = true;
    api.getLatestEvaluated().then((latest) => { if (active) setReference(latest); }).catch(() => { /* 참고 캠페인은 없어도 된다 */ });
    return () => { active = false; };
  }, [api]);

  const set = <K extends PlanField>(field: K, value: PlanInput[K]) => setValues((current) => ({ ...current, [field]: value }));
  const toggleChannel = (channel: Channel, on: boolean) =>
    set("channels", on ? CHANNELS.filter((item) => item === channel || values.channels.includes(item)) : values.channels.filter((item) => item !== channel));
  const fieldError = (field: PlanField) => error?.fields[field];

  async function submit(kind: "save" | "draft") {
    if (pending) return;
    setPending(kind); setError(null); setNotice("");
    try {
      const saved: Campaign = kind === "save" ? await api.savePlan(savedId, values) : await api.generateDraft(savedId, values);
      setSavedId(saved.id);
      if (kind === "draft") { router.push(`/campaigns/${encodeURIComponent(saved.id)}/draft`); return; }
      setNotice("임시 저장했어요. 목록에서 이어서 쓸 수 있어요.");
      // 새 캠페인이면 주소를 바꾸는 동안 버튼을 꺼 둔다.
      if (!savedId) { router.replace(`/campaigns/${encodeURIComponent(saved.id)}/plan`); return; }
      setPending(null);
    } catch (failure) {
      const error = asApiError(failure);
      // 저장은 됐는데 초안 생성에서 실패하면, 다시 시도할 때 같은 캠페인을 쓴다.
      if (error.campaignId) setSavedId(error.campaignId);
      setError(error);
      setPending(null);
    }
  }

  return <div className={ui.columns}>
    <form noValidate className={ui.stack} aria-busy={pending !== null} onSubmit={(event) => { event.preventDefault(); void submit("draft"); }}>
      <fieldset disabled={pending !== null} className={styles.fieldsets}>
        <section className={ui.card} aria-labelledby="product-title">
          <h2 id="product-title" className={ui.sectionTitle}><span className={ui.stepNo}>1</span>상품 정보</h2>
          <Field id="productName" label="상품명" error={fieldError("productName")}>
            <input id="productName" type="text" value={values.productName} placeholder="예: 수제 그래놀라" onChange={(event) => set("productName", event.target.value)} {...invalid("productName", fieldError("productName"))} />
          </Field>
          <Field id="productDescription" label="상품 특징" error={fieldError("productDescription")}>
            <textarea id="productDescription" rows={4} value={values.productDescription} placeholder="상품의 특징을 2~3줄로 적어 주세요. 재료, 맛, 누구에게 좋은지 등" onChange={(event) => set("productDescription", event.target.value)} {...invalid("productDescription", fieldError("productDescription"))} />
          </Field>
          <div className={ui.inputGrid}>
            <Field id="price" label="가격" error={fieldError("price")}>
              <Unit unit="원"><input id="price" type="text" inputMode="numeric" value={values.price} placeholder="예: 12900" onChange={(event) => set("price", event.target.value)} {...invalid("price", fieldError("price"))} /></Unit>
            </Field>
            <Field id="category" label="카테고리">
              <select id="category" value={values.category} onChange={(event) => set("category", event.target.value as PlanInput["category"])}>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select>
            </Field>
          </div>
        </section>

        <section className={ui.card} aria-labelledby="goal-title">
          <h2 id="goal-title" className={ui.sectionTitle}><span className={ui.stepNo}>2</span>광고 목표</h2>
          <fieldset className={ui.chips}><legend>광고 목표</legend>
            {GOALS.map((goal) => <label key={goal} className={ui.chip}><input type="radio" name="goal" value={goal} checked={values.goal === goal} onChange={() => set("goal", goal)} />{goal}</label>)}
          </fieldset>
        </section>

        <section className={ui.card} aria-labelledby="channel-title">
          <h2 id="channel-title" className={ui.sectionTitle}><span className={ui.stepNo}>3</span>채널 <small>1개 이상</small></h2>
          <fieldset className={ui.chips} aria-describedby={fieldError("channels") ? "channels-error" : undefined}><legend>채널</legend>
            {CHANNELS.map((channel) => <label key={channel} className={ui.chip}><input type="checkbox" checked={values.channels.includes(channel)} onChange={(event) => toggleChannel(channel, event.target.checked)} aria-invalid={fieldError("channels") ? true : undefined} />{channel}</label>)}
          </fieldset>
          {fieldError("channels") && <ErrorText id="channels-error">{fieldError("channels")}</ErrorText>}
        </section>

        <section className={ui.card} aria-labelledby="budget-title">
          <h2 id="budget-title" className={ui.sectionTitle}><span className={ui.stepNo}>4</span>예산</h2>
          <div className={ui.inputGrid}>
            <Field id="budgetAmount" label="금액" error={fieldError("budgetAmount")}>
              <Unit unit="원"><input id="budgetAmount" type="text" inputMode="numeric" value={values.budgetAmount} placeholder="예: 50000" onChange={(event) => set("budgetAmount", event.target.value)} {...invalid("budgetAmount", fieldError("budgetAmount"))} /></Unit>
            </Field>
            <Field id="budgetDays" label="기간" error={fieldError("budgetDays")}>
              <Unit unit="일"><input id="budgetDays" type="text" inputMode="numeric" value={values.budgetDays} placeholder="예: 7" onChange={(event) => set("budgetDays", event.target.value)} {...invalid("budgetDays", fieldError("budgetDays"))} /></Unit>
            </Field>
          </div>
        </section>
      </fieldset>

      <div className={ui.actions}>
        <button className={ui.secondary} type="button" disabled={pending !== null} onClick={() => void submit("save")}>{pending === "save" ? "저장 중…" : "임시 저장"}</button>
        <button className={ui.primary} type="submit" disabled={pending !== null}><Icon name="sparkle" size={18} />{pending === "draft" ? "초안을 만들고 있어요…" : "초안 만들기"}</button>
      </div>
      <Feedback pending={false} error={error} notice={notice} />
      {pending === "draft" && <p role="status" className={ui.help}>AI가 채널별 캡션과 해시태그를 쓰고 있어요. 잠시만 기다려 주세요.</p>}
    </form>

    <aside className={ui.stack} aria-label="도움말">
      <section className={`${ui.card} ${ui.cardTight}`}>
        <h2 className={styles.asideTitle}>참고할 지난 캠페인</h2>
        <p className={ui.help}>성과 평가가 끝난 가장 최근 캠페인의 문구와 성과를 초안에 반영해요.</p>
        {reference
          ? <div className={styles.reference}><strong>{reference.name}</strong><span>성과 평가 완료 · ROAS {reference.roas === null ? "계산할 수 없음" : `${reference.roas}%`}</span></div>
          : <p className={ui.help}>아직 성과 평가를 마친 캠페인이 없어요. 참고 없이 초안을 만들어요.</p>}
      </section>
      <section className={ui.muted}>
        <h2><Icon name="lock" size={18} />AI에 보내지 않는 정보</h2>
        <p>고객 이름·연락처·주소와 매입 단가(원가)는 초안을 만들 때 쓰지 않아요.</p>
      </section>
    </aside>
  </div>;
}

function invalid(field: PlanField, message?: string) {
  return message ? { "aria-invalid": true as const, "aria-describedby": `${field}-error` } : {};
}
function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return <div><label htmlFor={id}>{label}</label>{children}{error && <ErrorText id={`${id}-error`}>{error}</ErrorText>}</div>;
}
function ErrorText({ id, children }: { id: string; children: ReactNode }) {
  return <p id={id} className={ui.fieldError}><Icon name="alert" size={16} />{children}</p>;
}
function Unit({ unit, children }: { unit: string; children: ReactNode }) {
  return <div className={styles.unit}>{children}<span aria-hidden="true">{unit}</span></div>;
}

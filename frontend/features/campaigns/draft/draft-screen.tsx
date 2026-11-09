"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type KeyboardEvent } from "react";
import { AppShell } from "@/components/ui/app-shell";
import { Icon } from "@/components/ui/icon";
import ui from "@/components/ui/ui.module.css";
import { type Channel, campaignPath } from "@/lib/campaign-status";
import { useCampaign } from "../api-context";
import { type Campaign, type ChannelCopy, CHANNEL_LIMITS } from "../model";
import { Feedback, Heading, LoadGate, WrongStage } from "../shared";
import styles from "./draft.module.css";

/** 03 초안 확인·수정 (US-01, US-02) */
export function DraftScreen({ campaignId }: { campaignId: string }) {
  const session = useCampaign(campaignId);
  return <AppShell active="campaigns">
    <LoadGate campaign={session.campaign} loadError={session.loadError} reload={session.reload}>{(campaign) => <>
      <Heading campaign={campaign} pending={session.pending} onCancel={() => session.run((api) => api.cancel(campaign.id), "캠페인을 취소했어요.")} />
      {campaign.allowedActions.includes("request-review") && campaign.status === "초안 생성됨"
        ? <DraftEditor key={campaign.id} campaign={campaign} session={session} />
        : <>
          <WrongStage campaign={campaign}>이 캠페인은 지금 ‘{campaign.status}’ 단계예요. <Link className={ui.textLink} href={campaignPath(campaign.id, campaign.status)}>지금 단계 화면으로 가기</Link></WrongStage>
          <Feedback pending={session.pending} error={session.error} notice={session.notice} />
        </>}
    </>}</LoadGate>
  </AppShell>;
}

type Session = ReturnType<typeof useCampaign>;

function DraftEditor({ campaign, session }: { campaign: Campaign; session: Session }) {
  const router = useRouter();
  const channels = campaign.plan.channels;
  const [active, setActive] = useState<Channel>(channels[0]);
  const [drafts, setDrafts] = useState<Partial<Record<Channel, ChannelCopy>>>(() => structuredClone(campaign.drafts));
  const [newTag, setNewTag] = useState("");
  const copy = drafts[active] ?? { caption: "", hashtags: [] };
  const dirty = channels.filter((channel) => JSON.stringify(drafts[channel]) !== JSON.stringify(campaign.drafts[channel]));
  const limit = CHANNEL_LIMITS[active];
  const update = (next: Partial<ChannelCopy>) => setDrafts((current) => ({ ...current, [active]: { ...copy, ...next } }));

  function addTag() {
    const tags = newTag.split(/[\s,]+/).map((tag) => tag.trim().replace(/^#*/, "")).filter(Boolean).map((tag) => `#${tag}`);
    if (!tags.length) return;
    update({ hashtags: [...copy.hashtags, ...tags.filter((tag) => !copy.hashtags.includes(tag))] });
    setNewTag("");
  }
  function onTagKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") { event.preventDefault(); addTag(); }
    if (event.key === "Backspace" && !newTag && copy.hashtags.length) update({ hashtags: copy.hashtags.slice(0, -1) });
  }
  async function save() {
    let last: Campaign | null = null;
    for (const channel of dirty) {
      last = await session.run((api) => api.saveDraft(campaign.id, channel, drafts[channel] ?? { caption: "", hashtags: [] }), "저장했어요.");
      if (!last) return;
    }
  }
  function onTabKey(event: KeyboardEvent<HTMLButtonElement>) {
    const index = channels.indexOf(active);
    const move = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!move) return;
    event.preventDefault();
    const next = channels[(index + move + channels.length) % channels.length];
    setActive(next);
    document.getElementById(`tab-${next}`)?.focus();
  }

  return <div className={`${ui.columns} ${ui.columnsWide}`}>
    <section aria-label="초안 편집" className={ui.stack} aria-busy={session.pending}>
      <div className={styles.tabRow}>
        <div role="tablist" aria-label="채널" className={ui.tabs}>
          {channels.map((channel) => <button key={channel} id={`tab-${channel}`} role="tab" type="button" className={ui.tab} aria-selected={channel === active} aria-controls="draft-panel" tabIndex={channel === active ? 0 : -1} onKeyDown={onTabKey} onClick={() => setActive(channel)}>{channel}{dirty.includes(channel) && <span className={styles.dot} aria-label="저장 안 됨" />}</button>)}
        </div>
        {campaign.reference && <span className={styles.reference}><Icon name="redo" size={16} />참고한 캠페인: {campaign.reference.name}</span>}
      </div>

      <div id="draft-panel" role="tabpanel" aria-labelledby={`tab-${active}`} className={ui.stack}>
        <div>
          <div className={styles.labelRow}><label htmlFor="caption">캡션</label><span className={styles.counter} data-over={copy.caption.length > limit}>{copy.caption.length.toLocaleString("ko-KR")} / {limit.toLocaleString("ko-KR")}자</span></div>
          <textarea id="caption" rows={8} className={styles.caption} value={copy.caption} disabled={session.pending} onChange={(event) => update({ caption: event.target.value })} aria-invalid={session.error?.fields.caption && !copy.caption.trim() ? true : undefined} aria-describedby="caption-help" />
          <p id="caption-help" className={ui.help}>{copy.caption.length > limit ? `${active} 글자 수 제한을 넘었어요. 줄여 주세요.` : "AI가 만든 초안이에요. 바로 고쳐 쓸 수 있어요."}</p>
        </div>

        <div>
          <span className={styles.fieldLabel} id="tags-label">해시태그</span>
          <div className={styles.tagBox} role="group" aria-labelledby="tags-label">
            {copy.hashtags.map((tag) => <span key={tag} className={styles.tag}>{tag}<button type="button" aria-label={`${tag} 삭제`} disabled={session.pending} onClick={() => update({ hashtags: copy.hashtags.filter((item) => item !== tag) })}><Icon name="close" size={14} /></button></span>)}
            <label htmlFor="newtag" className={ui.srOnly}>해시태그 추가</label>
            <input id="newtag" type="text" className={styles.tagInput} placeholder="+ 추가 (Enter)" value={newTag} disabled={session.pending} onChange={(event) => setNewTag(event.target.value)} onKeyDown={onTagKey} onBlur={addTag} />
          </div>
        </div>

        <div className={styles.footer}>
          <button className={ui.ghost} type="button" disabled={session.pending} onClick={async () => {
            const channel = active;
            const next = await session.run((api) => api.regenerateChannel(campaign.id, channel), `${channel} 초안을 다시 만들었어요.`);
            const fresh = next?.drafts[channel];
            if (fresh) setDrafts((current) => ({ ...current, [channel]: fresh }));
          }}><Icon name="redo" size={16} />이 채널 다시 만들기</button>
          <div className={styles.footerActions}>
            <button className={ui.secondary} type="button" disabled={session.pending || !dirty.length} onClick={() => void save()}>저장</button>
            <button className={ui.primary} type="button" disabled={session.pending} onClick={async () => {
              const next = await session.run((api) => api.requestReview(campaign.id, drafts));
              if (next) router.push(`/campaigns/${encodeURIComponent(campaign.id)}/review`);
            }}>{session.pending ? "요청 중…" : "검수 요청"}</button>
          </div>
        </div>
        <p className={ui.help}>검수 요청은 자동으로 되지 않아요. 문구를 확인한 뒤 직접 눌러 주세요.{dirty.length > 0 && " 다시 만들면 이 채널에서 고친 내용은 사라져요."}</p>
        <Feedback pending={session.pending} error={session.error} notice={session.notice} />
      </div>
    </section>

    <aside aria-label="미리보기" className={styles.previewWrap}>
      <span className={styles.previewTitle}>{active} 미리보기</span>
      <Preview channel={active} name={campaign.plan.productName} copy={copy} />
    </aside>
  </div>;
}

function Preview({ channel, name, copy }: { channel: Channel; name: string; copy: ChannelCopy }) {
  const short = copy.caption.length > 90 ? `${copy.caption.slice(0, 90)}…` : copy.caption;
  return <div className={styles.preview} data-channel={channel}>
    <div className={styles.previewHead}><span aria-hidden="true" /><b>우리 가게</b></div>
    {channel !== "X" && <div className={styles.previewImage}>{name || "상품"} 이미지</div>}
    <div className={styles.previewBody}>
      <p><b>우리 가게</b> {short || "캡션을 입력하면 이렇게 보여요."}</p>
      <p className={styles.previewTags}>{copy.hashtags.slice(0, 5).join(" ")}</p>
    </div>
  </div>;
}

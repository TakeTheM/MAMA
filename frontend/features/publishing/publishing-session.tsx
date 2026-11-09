"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { type Campaign, type Mutation, type PublishingAdapter, PublishingError } from "./model";
import { demoStoreAdapter } from "./demo-bridge";
import { createMockAdapter, type Scenario } from "./mock-adapter";

type Session = {
  campaignId: string;
  campaign: Campaign | null;
  loadError: PublishingError | null;
  error: PublishingError | null;
  pending: boolean;
  notice: string;
  warning: string;
  reload: () => void;
  mutate: (command: Mutation) => Promise<boolean>;
};
const SessionContext = createContext<Session | null>(null);
const DemoContext = createContext<{ scenario: Scenario; changeScenario: (value: Scenario) => void } | null>(null);

export function PublishingProvider({ campaignId, children, adapter }: {
  campaignId: string; children: ReactNode; adapter?: PublishingAdapter;
}) {
  const [scenario, setScenario] = useState<Scenario>("approved");
  // 목록에 있는 데모 캠페인이면 같은 저장소를 쓰고, "demo"는 시나리오 도구로 상태를 바꿔 볼 수 있다.
  const [stored] = useState(() => (adapter ? null : demoStoreAdapter(campaignId)));
  const source = adapter ?? stored ?? undefined;
  return <DemoContext.Provider value={source ? null : { scenario, changeScenario: setScenario }}>
    <SessionProvider key={`${campaignId}:${scenario}`} campaignId={campaignId} scenario={scenario} adapter={source}>
      {children}
    </SessionProvider>
  </DemoContext.Provider>;
}

function SessionProvider({ campaignId, scenario, adapter, children }: {
  campaignId: string; scenario: Scenario; adapter?: PublishingAdapter; children: ReactNode;
}) {
  const [source] = useState(() => adapter ?? createMockAdapter({ scenario }));
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loadError, setLoadError] = useState<PublishingError | null>(null);
  const [error, setError] = useState<PublishingError | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [warning, setWarning] = useState("");
  const [attempt, setAttempt] = useState(0);
  const lock = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    source.getCampaign(campaignId).then((data) => {
      if (active) setCampaign(data);
    }).catch((failure: unknown) => {
      if (active) setLoadError(asError(failure));
    });
    return () => { active = false; mounted.current = false; };
  }, [source, campaignId, attempt]);

  const reload = useCallback(() => {
    setLoadError(null);
    setAttempt((value) => value + 1);
  }, []);

  async function mutate(command: Mutation) {
    if (lock.current) return false;
    lock.current = true;
    setPending(true); setError(null); setNotice("");
    try {
      const result = await source.mutate(campaignId, command);
      if (!mounted.current) return false;
      setCampaign(result.campaign);
      setWarning(result.warning ?? "");
      setNotice(`${result.campaign.status} 상태로 기록했습니다.`);
      return true;
    } catch (failure) {
      if (mounted.current) setError(asError(failure));
      return false;
    } finally {
      lock.current = false;
      if (mounted.current) setPending(false);
    }
  }

  return <SessionContext.Provider value={{ campaignId, campaign, loadError, error, pending, notice, warning, reload, mutate }}>{children}</SessionContext.Provider>;
}

export function usePublishingSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("PublishingProvider is required");
  return session;
}
export function useDemoScenario() { return useContext(DemoContext); }
function asError(value: unknown) {
  return value instanceof PublishingError ? value : new PublishingError("network", "요청을 처리하지 못했습니다. 다시 시도해 주세요.");
}

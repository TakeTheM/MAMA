"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { type Campaign, type Mutation, type PublishingAdapter, PublishingError } from "./model";
import { AuthRequirement } from "@/components/auth/auth";
import { createHttpPublishingAdapter } from "./http-adapter";
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

/**
 * 게시 화면 데이터. 기본은 FastAPI를 부르고, adapter를 넣으면(테스트) 그것을 쓴다.
 * demo를 켜면 시나리오를 바꿔 볼 수 있는 mock으로 움직인다.
 */
export function PublishingProvider({ campaignId, children, adapter, demo = false }: {
  campaignId: string; children: ReactNode; adapter?: PublishingAdapter; demo?: boolean;
}) {
  const [scenario, setScenario] = useState<Scenario>("approved");
  const [http] = useState(() => (adapter || demo ? null : createHttpPublishingAdapter()));
  const source = adapter ?? http ?? undefined;
  return <AuthRequirement required={source === http && http !== null}>
    <DemoContext.Provider value={demo && !adapter ? { scenario, changeScenario: setScenario } : null}>
      <SessionProvider key={`${campaignId}:${scenario}`} campaignId={campaignId} scenario={scenario} adapter={source}>
        {children}
      </SessionProvider>
    </DemoContext.Provider>
  </AuthRequirement>;
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

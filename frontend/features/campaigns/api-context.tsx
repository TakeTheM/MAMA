"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { type Campaign, type CampaignApi, ApiError } from "./model";
import { createMockCampaignApi } from "./mock-api";

// 데모용 저장소 하나를 모든 화면이 함께 쓴다(브라우저 메모리, 새로고침하면 초기화).
// 백엔드가 생기면 /api/... 를 부르는 구현으로 바꾸고 이 자리에서만 갈아 끼운다.
let demoApi: ReturnType<typeof createMockCampaignApi> | null = null;
export function getDemoApi() {
  demoApi ??= createMockCampaignApi();
  return demoApi;
}

const ApiContext = createContext<CampaignApi | null>(null);
export function CampaignApiProvider({ api, children }: { api: CampaignApi; children: ReactNode }) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}
export function useCampaignApi(): CampaignApi {
  return useContext(ApiContext) ?? getDemoApi();
}

export function asApiError(value: unknown) {
  return value instanceof ApiError ? value : new ApiError("network", "요청을 처리하지 못했습니다. 다시 시도해 주세요.");
}

/** 캠페인 하나를 불러오고, 바꾸는 요청을 한 번에 하나만 보낸다. */
export function useCampaign(id: string) {
  const api = useCampaignApi();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState(0);
  const lock = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    api.getCampaign(id).then((data) => { if (active) setCampaign(data); })
      .catch((failure: unknown) => { if (active) setLoadError(asApiError(failure)); });
    return () => { active = false; mounted.current = false; };
  }, [api, id, attempt]);

  const reload = useCallback(() => { setLoadError(null); setAttempt((value) => value + 1); }, []);

  const run = useCallback(async (request: (api: CampaignApi) => Promise<Campaign>, success?: string) => {
    if (lock.current) return null;
    lock.current = true;
    setPending(true); setError(null); setNotice("");
    try {
      const next = await request(api);
      if (!mounted.current) return null;
      setCampaign(next);
      if (success) setNotice(success);
      return next;
    } catch (failure) {
      if (mounted.current) setError(asApiError(failure));
      return null;
    } finally {
      lock.current = false;
      if (mounted.current) setPending(false);
    }
  }, [api]);

  const clearError = useCallback(() => setError(null), []);
  return { api, campaign, loadError, error, pending, notice, reload, run, clearError };
}

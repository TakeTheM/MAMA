"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createHttpCampaignApi } from "./http-api";
import { type Campaign, type CampaignApi, ApiError } from "./model";

// 실제 화면은 FastAPI(/api/v1/campaigns)를 부른다. 테스트는 CampaignApiProvider로 mock을 넣는다.
let httpApi: CampaignApi | null = null;
function defaultApi() {
  httpApi ??= createHttpCampaignApi();
  return httpApi;
}

const ApiContext = createContext<CampaignApi | null>(null);
/** 다른 구현(테스트용 mock 등)을 넣을 때 쓴다. */
export function CampaignApiProvider({ api, children }: { api: CampaignApi; children: ReactNode }) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}
export function useCampaignApi(): CampaignApi {
  return useContext(ApiContext) ?? defaultApi();
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
      if (mounted.current) {
        setError(asApiError(failure));
        // 요청이 실패해도 백엔드 상태가 바뀌었을 수 있다(예: 검수 실패 기록). 최신 상태를 다시 읽는다.
        api.getCampaign(id).then((data) => { if (mounted.current) setCampaign(data); }).catch(() => undefined);
      }
      return null;
    } finally {
      lock.current = false;
      if (mounted.current) setPending(false);
    }
  }, [api, id]);

  const clearError = useCallback(() => setError(null), []);
  return { api, campaign, loadError, error, pending, notice, reload, run, clearError };
}

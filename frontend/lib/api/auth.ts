import { apiFetch } from "./http";

/** GET /api/v1/auth/me 응답 (백엔드 PR #52) */
export type Me = { id: number; email: string; name: string | null };

export const getMe = () => apiFetch<Me>("/api/v1/auth/me");
/** 세션 쿠키를 지운다(204). */
export const logout = () => apiFetch<void>("/api/v1/auth/logout", { method: "POST" });

/** 상단바에 보일 이름: name이 없으면 email */
export const displayName = (me: Me) => me.name?.trim() || me.email;

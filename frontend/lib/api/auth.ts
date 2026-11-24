import { apiFetch } from "./http";

/** GET /api/v1/auth/me 응답: Supabase 토큰으로 찾은(없으면 만든) 셀러 계정 */
export type Me = { id: number; email: string; name: string | null };

export const getMe = () => apiFetch<Me>("/api/v1/auth/me");

/** 상단바에 보일 이름: name이 없으면 email */
export const displayName = (me: Me) => me.name?.trim() || me.email;

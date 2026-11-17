// Supabase를 라이브러리 없이 REST로 쓴다 (설치할 것 없이 정적 사이트에서 동작).
// 로그인 없이 기기마다 '익명 사용자'를 하나 만들어 리뷰·등록 요청의 주인으로 쓴다.

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

export const supabaseReady = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

interface Session {
  access_token: string;
  refresh_token: string;
  expires_at: number; // 초 단위
  user_id: string;
}

const KEY = "andepandang-session";

function load(): Session | null {
  try {
    const s = localStorage.getItem(KEY);
    return s ? (JSON.parse(s) as Session) : null;
  } catch {
    return null;
  }
}
function save(s: Session | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {}
}

function toSession(j: { access_token: string; refresh_token: string; expires_in: number; user: { id: string } }): Session {
  return { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Math.floor(Date.now() / 1000) + j.expires_in, user_id: j.user.id };
}

async function authPost(path: string, body: unknown) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`auth ${res.status}`);
  return res.json();
}

let pending: Promise<Session> | null = null;

/** 이 기기의 익명 사용자 세션 (없으면 만들고, 만료가 가까우면 새로 고침) */
export function session(): Promise<Session> {
  if (pending) return pending;
  pending = (async () => {
    const s = load();
    const now = Math.floor(Date.now() / 1000);
    if (s && s.expires_at - now > 60) return s;
    if (s) {
      try {
        const fresh = toSession(await authPost("token?grant_type=refresh_token", { refresh_token: s.refresh_token }));
        save(fresh);
        return fresh;
      } catch {
        save(null);
      }
    }
    const created = toSession(await authPost("signup", { data: {} }));
    save(created);
    return created;
  })().finally(() => {
    pending = null;
  });
  return pending;
}

/** 지금 기기 사용자 id (세션이 이미 있을 때만) */
export function myUserId(): string | null {
  return load()?.user_id ?? null;
}

/** PostgREST 호출. auth=true면 익명 사용자 토큰으로 */
export async function rest<T>(path: string, init: RequestInit & { auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" };
  if (init.auth) headers.Authorization = `Bearer ${(await session()).access_token}`;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

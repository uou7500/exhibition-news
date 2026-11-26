import { myUserId, rest, session, supabaseReady } from "./supabase";

/**
 * 방명록: 감상 한마디 + 정보 태그 + 추천(👍)·비추천(👎) 중 하나(선택).
 * 별점 대신 추천·비추천만 두고, 지도에는 추천 수를 보여 준다 (2026-11-27 사용자 결정).
 * 표 이름은 예전 그대로 `reviews`. 추천 칸·집계 보기는 docs/supabase-votes.sql.
 */

/** 좋고 나쁨이 아니라 다음 관람객에게 도움이 되는 정보 */
export const NOTE_TAGS = [
  "조용해요",
  "사진 촬영 가능",
  "작가가 있었어요",
  "아이와 함께 가기 좋아요",
  "휠체어로 다니기 편해요",
  "30분이면 충분해요",
  "1시간 넘게 머물렀어요",
  "입구 찾기 어려워요",
] as const;

export interface Note {
  id: string;
  exhibition_id: string;
  user_id: string;
  nickname: string | null;
  body: string | null;
  tags: string[];
  /** 1 = 추천, -1 = 비추천, null = 고르지 않음 */
  vote: Vote | null;
  created_at: string;
}

export type Vote = 1 | -1;
export interface VoteCount {
  up: number;
  down: number;
}

/** 전시별 추천·비추천 수 (숨긴 글 제외). 아직 SQL을 실행하지 않았으면 빈 값 */
export async function fetchVoteCounts(): Promise<Record<string, VoteCount>> {
  if (!supabaseReady) return {};
  try {
    const rows = await rest<{ exhibition_id: string; up: number; down: number }[]>("exhibition_votes?select=exhibition_id,up,down&limit=5000");
    const out: Record<string, VoteCount> = {};
    for (const r of rows) out[r.exhibition_id] = { up: Number(r.up) || 0, down: Number(r.down) || 0 };
    return out;
  } catch {
    return {};
  }
}

export async function fetchNotes(exhibitionId: string): Promise<Note[]> {
  if (!supabaseReady) return [];
  const q = (cols: string) =>
    rest<Note[]>(`reviews?select=${cols}&exhibition_id=eq.${encodeURIComponent(exhibitionId)}&order=created_at.desc&limit=100`);
  const base = "id,exhibition_id,user_id,nickname,body,tags,created_at";
  // 추천 칸(vote)이 아직 없으면(SQL 실행 전) 예전 방식으로 읽는다
  const rows = await q(`${base},vote`).catch(() => q(base));
  return rows.map((r) => ({ ...r, tags: r.tags ?? [], vote: r.vote === 1 || r.vote === -1 ? r.vote : null }));
}

/** 내 방명록 쓰기·고치기 (전시마다 하나) */
export async function saveNote(exhibitionId: string, body: string, tags: string[], nickname: string, vote: Vote | null): Promise<void> {
  const s = await session();
  const row: Record<string, unknown> = {
    exhibition_id: exhibitionId,
    user_id: s.user_id,
    body: body.trim() || null,
    tags,
    nickname: nickname.trim() || null,
    vote,
    updated_at: new Date().toISOString(),
  };
  const send = (r: Record<string, unknown>) =>
    rest("reviews?on_conflict=exhibition_id,user_id", {
      method: "POST",
      auth: true,
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(r),
    });
  try {
    await send(row);
  } catch (e) {
    // 추천 칸(vote)이 아직 없을 때(SQL 실행 전), 추천을 고르지 않았으면 예전 방식으로 저장
    if (vote !== null || !String(e).includes("vote")) throw e;
    const { vote: _drop, ...rest0 } = row;
    void _drop;
    await send(rest0);
  }
}

export async function deleteNote(exhibitionId: string): Promise<void> {
  const uid = myUserId();
  if (!uid) return;
  await rest(`reviews?exhibition_id=eq.${encodeURIComponent(exhibitionId)}&user_id=eq.${uid}`, { method: "DELETE", auth: true });
}

export const REPORT_REASONS = ["욕설·비하", "광고·홍보", "전시와 관계없는 글", "개인정보 노출"] as const;

/** 방명록 글 신고. 같은 글을 다시 신고해도 오류로 보지 않는다. 3번 쌓이면 서버가 자동으로 숨긴다 */
export async function reportNote(noteId: string, reason: string): Promise<void> {
  const s = await session();
  try {
    await rest("review_reports", {
      method: "POST",
      auth: true,
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ review_id: noteId, user_id: s.user_id, reason }),
    });
  } catch (e) {
    if (!String(e).startsWith("409")) throw e;
  }
}

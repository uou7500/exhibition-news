import { myUserId, rest, session, supabaseReady } from "./supabase";

/**
 * 방명록: 점수 없이 감상 한마디와 정보 태그만 남긴다.
 * (앙데팡당의 취지 — 심사·등급 없이 평등하게 — 에 맞춰 별점은 쓰지 않는다)
 * 표 이름은 예전 그대로 `reviews`.
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
  created_at: string;
}

export async function fetchNotes(exhibitionId: string): Promise<Note[]> {
  if (!supabaseReady) return [];
  const rows = await rest<Note[]>(
    `reviews?select=id,exhibition_id,user_id,nickname,body,tags,created_at&exhibition_id=eq.${encodeURIComponent(exhibitionId)}&order=created_at.desc&limit=100`,
  );
  return rows.map((r) => ({ ...r, tags: r.tags ?? [] }));
}

/** 내 방명록 쓰기·고치기 (전시마다 하나) */
export async function saveNote(exhibitionId: string, body: string, tags: string[], nickname: string): Promise<void> {
  const s = await session();
  await rest("reviews?on_conflict=exhibition_id,user_id", {
    method: "POST",
    auth: true,
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      exhibition_id: exhibitionId,
      user_id: s.user_id,
      body: body.trim() || null,
      tags,
      nickname: nickname.trim() || null,
      updated_at: new Date().toISOString(),
    }),
  });
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

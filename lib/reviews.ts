import { myUserId, rest, session, supabaseReady } from "./supabase";

export interface Rating { avg: number; n: number }
export interface Review {
  id: string;
  exhibition_id: string;
  user_id: string;
  nickname: string | null;
  rating: number;
  body: string | null;
  created_at: string;
}

/** 모든 전시의 평균 별점·리뷰 수 (목록·지도용) */
export async function fetchRatings(): Promise<Map<string, Rating>> {
  const m = new Map<string, Rating>();
  if (!supabaseReady) return m;
  const rows = await rest<{ exhibition_id: string; avg: number; n: number }[]>("exhibition_ratings?select=exhibition_id,avg,n");
  for (const r of rows) m.set(r.exhibition_id, { avg: Number(r.avg), n: r.n });
  return m;
}

export async function fetchReviews(exhibitionId: string): Promise<Review[]> {
  if (!supabaseReady) return [];
  return rest<Review[]>(
    `reviews?select=id,exhibition_id,user_id,nickname,rating,body,created_at&exhibition_id=eq.${encodeURIComponent(exhibitionId)}&order=created_at.desc&limit=100`,
  );
}

/** 내 리뷰 쓰기·고치기 (전시마다 하나) */
export async function saveReview(exhibitionId: string, rating: number, body: string, nickname: string): Promise<void> {
  const s = await session();
  await rest("reviews?on_conflict=exhibition_id,user_id", {
    method: "POST",
    auth: true,
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      exhibition_id: exhibitionId,
      user_id: s.user_id,
      rating,
      body: body.trim() || null,
      nickname: nickname.trim() || null,
      updated_at: new Date().toISOString(),
    }),
  });
}

export async function deleteReview(exhibitionId: string): Promise<void> {
  const uid = myUserId();
  if (!uid) return;
  await rest(`reviews?exhibition_id=eq.${encodeURIComponent(exhibitionId)}&user_id=eq.${uid}`, { method: "DELETE", auth: true });
}

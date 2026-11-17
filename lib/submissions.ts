import type { Exhibition, Genre } from "./types";
import { rest, session, supabaseReady } from "./supabase";

export interface SubmissionInput {
  title: string;
  artist: string;
  venue: string;
  address: string;
  lat: number | null;
  lon: number | null;
  start_date: string;
  end_date: string;
  price: number | null;
  kind: "졸업전시" | "실험전시" | "작가전" | "기타";
  link: string;
  poster_url: string;
  description: string;
  contact: string;
}

export async function submitExhibition(input: SubmissionInput): Promise<void> {
  const s = await session();
  const clean = (v: string) => v.trim() || null;
  await rest("submissions", {
    method: "POST",
    auth: true,
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      ...input,
      user_id: s.user_id,
      artist: clean(input.artist),
      link: clean(input.link),
      poster_url: clean(input.poster_url),
      description: clean(input.description),
      contact: clean(input.contact),
    }),
  });
}

interface Approved {
  id: string; title: string; artist: string | null; venue: string; address: string;
  lat: number | null; lon: number | null; start_date: string; end_date: string;
  price: number | null; kind: string | null; link: string | null; poster_url: string | null; description: string | null;
}

/** 운영자가 승인한 등록 요청 → 지도에 올릴 전시 */
export async function fetchApproved(): Promise<Exhibition[]> {
  if (!supabaseReady) return [];
  const rows = await rest<Approved[]>("approved_submissions?select=*");
  return rows
    .filter((r) => r.lat != null && r.lon != null)
    .map((r) => {
      const city = r.address.split(" ")[0]?.replace(/(특별시|광역시|특별자치시|특별자치도|도)$/, "") || "기타";
      return {
        id: `sub-${r.id}`,
        title: r.artist ? `${r.title} — ${r.artist}` : r.title,
        venue: r.venue,
        city,
        lat: r.lat!,
        lon: r.lon!,
        genre: "기타" as Genre,
        startDate: r.start_date,
        endDate: r.end_date,
        price: r.price,
        description: r.description ?? undefined,
        thumbnail: r.poster_url ?? undefined,
        url: r.link ?? undefined,
        address: r.address,
        tags: r.kind && r.kind !== "기타" ? [r.kind] : undefined,
        source: "manual" as const,
      };
    });
}

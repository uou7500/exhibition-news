import type { Exhibition } from "./types";
import type { PopularityData } from "./picks";
import { cleanExhibition } from "./clean";

/**
 * 최신 데이터를 사이트 재배포 없이 받아 오는 곳.
 * 수집 워크플로가 하루 다섯 번 저장소의 data/ 폴더를 갱신하고, 앱은 열릴 때 여기서 최신본을 읽는다.
 * 저장소가 비공개라 읽을 수 없으면(404) 배포 때 함께 묶인 데이터를 그대로 쓴다.
 * Netlify는 data/만 바뀐 커밋은 다시 빌드하지 않는다(netlify.toml) — 크레딧 절약.
 */
export const DATA_BASE = "https://raw.githubusercontent.com/uou7500/exhibition-news/main/data";

async function getJson<T>(name: string): Promise<T | null> {
  try {
    const res = await fetch(`${DATA_BASE}/${name}?t=${Math.floor(Date.now() / 600_000)}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function loadLatest(): Promise<{ exhibitions: Exhibition[] | null; popularity: PopularityData | null; overseas: Exhibition[] | null }> {
  const [collected, manual, popularity, overseasRaw] = await Promise.all([
    getJson<Exhibition[]>("exhibitions.json"),
    getJson<Exhibition[]>("manual-exhibitions.json"),
    getJson<PopularityData>("popularity.json"),
    getJson<Exhibition[]>("overseas-exhibitions.json"),
  ]);
  const exhibitions = collected && collected.length ? [...collected, ...(manual ?? [])].map(cleanExhibition) : null;
  const overseas = Array.isArray(overseasRaw) ? overseasRaw.map(cleanExhibition) : null;
  return { exhibitions, popularity, overseas };
}

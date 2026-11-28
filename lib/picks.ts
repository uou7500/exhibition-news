import popularity from "@/data/popularity.json";
import type { Exhibition } from "./types";
import { statusOf } from "./status";

/** 대중픽: 전시 id → 최근 언급 수 */
export interface PopularityData {
  updatedAt: string | null;
  windowDays: number;
  items: Record<string, { recent: number; total: number }>;
}

export function getPopularity(): PopularityData {
  return popularity as PopularityData;
}

/** '대중을 위한' 상위 전시: 지금 열려 있고 최근 언급이 있는 전시를 언급 수 많은 순으로 n개 (시작 화면 탭) */
export function topPopular(exhibitions: Exhibition[], data: PopularityData, n = 10): { x: Exhibition; recent: number }[] {
  const byId = new Map(exhibitions.map((x) => [x.id, x]));
  const out: { x: Exhibition; recent: number }[] = [];
  for (const [id, v] of Object.entries(data.items)) {
    const x = byId.get(id);
    if (!x || v.recent <= 0) continue;
    const k = statusOf(x).kind;
    if (k === "on" || k === "ending") out.push({ x, recent: v.recent });
  }
  return out.sort((a, b) => b.recent - a.recent).slice(0, n);
}

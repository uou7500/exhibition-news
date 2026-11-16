import popularity from "@/data/popularity.json";

/** 대중픽: 전시 id → 최근 언급 수 */
export interface PopularityData {
  updatedAt: string | null;
  windowDays: number;
  items: Record<string, { recent: number; total: number }>;
}

export function getPopularity(): PopularityData {
  return popularity as PopularityData;
}

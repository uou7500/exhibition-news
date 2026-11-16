import popularity from "@/data/popularity.json";
import expertPicks from "@/data/expert-picks.json";

/** 대중픽: 전시 id → 최근 언급 수 */
export interface PopularityData {
  updatedAt: string | null;
  windowDays: number;
  items: Record<string, { recent: number; total: number }>;
}

/**
 * 전문가 픽 한 건. data/expert-picks.json에 이 형태로 넣는다.
 * 예: { "id": "culture-246265", "by": "홍길동", "role": "독립 큐레이터", "comment": "수장고를 여는 방식이 새롭다" }
 */
export interface ExpertPick {
  id: string;
  by: string;
  role?: string;
  comment?: string;
}

export function getPopularity(): PopularityData {
  return popularity as PopularityData;
}

export function getExpertPicks(): ExpertPick[] {
  return expertPicks as ExpertPick[];
}

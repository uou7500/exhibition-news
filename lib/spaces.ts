import spaces from "@/data/spaces.json";

/**
 * 독립·대안 전시공간. 지도에 '독립공간' 핀으로 보인다.
 * 좌표가 없으면 카카오 장소 검색(search)으로 찾고, 찾은 장소 주소에 area 글자가 들어 있을 때만 쓴다(엉뚱한 곳 방지).
 */
export interface Space {
  id: string;
  name: string;
  /** 카카오 장소 검색어 */
  search?: string;
  /** 동네 확인용 글자. 예: "충신동" */
  area?: string;
  lat?: number;
  lon?: number;
  url?: string;
  instagram?: string;
  note?: string;
}

export function getSpaces(): Space[] {
  return spaces as Space[];
}

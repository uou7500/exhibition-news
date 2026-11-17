import type { Exhibition } from "@/lib/types";
import type { MyLocation } from "@/lib/geo";
import type { Space } from "@/lib/spaces";
import type { Rating } from "@/lib/reviews";

/** 주변 장소 종류 (카카오 장소 카테고리 코드) */
export type PoiCode = "CS2" | "CE7" | "SW8";
export const POI_LABELS: Record<PoiCode, string> = { CS2: "편의점", CE7: "카페", SW8: "지하철역" };

/** 지도 엔진(SVG 임시 지도 / 카카오맵)이 공통으로 받는 값 */
export interface MapViewProps {
  /** 필터를 통과한 전시 */
  items: Exhibition[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** 지금 화면 안에 보이는 전시 ID가 바뀔 때마다 호출 */
  onVisibleChange: (ids: Set<string>) => void;
  /** 목록에서 고른 전시로 지도를 옮기라는 요청. seq가 바뀔 때마다 이동 */
  focus: { id: string; seq: number } | null;
  /** 데스크톱 배치(좌측 목록 패널 400px)인지 */
  desktop: boolean;
  /** 상세 패널이 열려 있는지 (데스크톱에서 확대 버튼 위치 조정) */
  detailOpen: boolean;
  /** 켜 둔 주변 장소 종류 (카카오맵만 지원) */
  poi: Set<PoiCode>;
  /** 내 위치 (위치 버튼을 누른 뒤에만 값이 있음) */
  myLoc: MyLocation | null;
  /** 내 위치 중심 탐색 반경(미터). null = 반경 없음 */
  radius: number | null;
  /** 내 위치로 지도를 맞추라는 요청. 값이 바뀔 때마다 이동 */
  locateSeq: number;
  /** 사용자가 지도를 손가락으로 끌기 시작할 때 (목록 시트 내리기용) */
  onMapDrag: () => void;
  /** 지도에 보일 독립공간 (카카오맵만 지원) */
  spaces: Space[];
  /** 전시별 별점 (지도 이름표 옆에 표시) */
  ratings: Map<string, Rating>;
}

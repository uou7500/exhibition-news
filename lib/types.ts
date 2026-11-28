// 앱 전체에서 쓰는 전시 데이터 형태.
// 공공데이터 수집 스크립트(scripts/fetch-exhibitions.mjs)도 이 형태로 data/exhibitions.json을 만든다.

export type Genre = "회화" | "미디어" | "사진" | "조각·설치" | "공예" | "디자인" | "기타";

export interface Exhibition {
  /** 출처별 고유 ID. 예: "culture-12345", "sample-1" */
  id: string;
  title: string;
  venue: string;
  /** 시·군 이름. 예: "서울", "부산", "완주" (해외는 한글 도시 이름. 예: "로스앤젤레스") */
  city: string;
  /** 나라 코드. 비어 있으면 한국. 해외 전시(data/overseas-exhibitions.json)는 "US" */
  country?: string;
  lat: number;
  lon: number;
  genre: Genre;
  /** YYYY-MM-DD */
  startDate: string;
  /** YYYY-MM-DD */
  endDate: string;
  /** 성인 기준 관람료(원). 0 = 무료, null = 정보 없음 */
  price: number | null;
  /** 원문 가격 표기. 예: "성인 5,000원 / 청소년 3,000원" */
  priceText?: string;
  hours?: string;
  description?: string;
  thumbnail?: string;
  /** 예매처 또는 전시 안내 페이지 */
  url?: string;
  address?: string;
  /** 데이터 출처 */
  /** 직접 붙인 분류. 예: ["졸업전시"], ["실험전시"], ["작가전"] */
  tags?: string[];
  /** 검색용 다른 이름. 예: 갤러리현대 → ["현대갤러리", "현대화랑", "Gallery Hyundai"] */
  keywords?: string[];
  source: "sample" | "culture.go.kr" | "manual";
}

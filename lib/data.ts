import type { Exhibition } from "./types";
import { cleanExhibition as clean } from "./clean";
import { SAMPLE_EXHIBITIONS } from "./sample-exhibitions";
import collected from "@/data/exhibitions.json";
import manual from "@/data/manual-exhibitions.json";
import overseas from "@/data/overseas-exhibitions.json";

/**
 * 화면에 보여줄 전시 목록.
 * - data/exhibitions.json: 공공데이터 수집 결과
 * - data/manual-exhibitions.json: 공공데이터에 없는 전시를 직접 넣은 것 (졸업전시, 독립공간 전시 등)
 * 둘 다 비어 있으면 예시 데이터를 쓴다. 나중에 DB(Supabase)로 옮길 때는 이 함수만 바꾸면 된다.
 */
export function getExhibitions(): { items: Exhibition[]; isSample: boolean } {
  const real = [...(collected as Exhibition[]), ...(manual as Exhibition[])].map(clean);
  if (real.length > 0) return { items: real, isSample: false };
  return { items: SAMPLE_EXHIBITIONS, isSample: true };
}

/**
 * 해외(지금은 미국 서부) 전시. data/overseas-exhibitions.json.
 * 국내 전시와 섞지 않는다: 시작 화면·전시 도우미·대중을 위한 탭은 국내만 쓰고,
 * 지도 위 '미국 서부' 버튼을 누르면 이 목록과 세계 지도(OpenStreetMap)로 바뀐다.
 */
export function getOverseas(): Exhibition[] {
  return (overseas as Exhibition[]).map(clean);
}

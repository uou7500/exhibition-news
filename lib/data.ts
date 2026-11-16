import type { Exhibition } from "./types";
import { SAMPLE_EXHIBITIONS } from "./sample-exhibitions";
import collected from "@/data/exhibitions.json";

/**
 * 화면에 보여줄 전시 목록.
 * 수집 스크립트가 만든 data/exhibitions.json에 데이터가 있으면 그것을, 비어 있으면 예시 데이터를 쓴다.
 * 나중에 DB(Supabase)로 옮길 때는 이 함수만 바꾸면 된다.
 */
export function getExhibitions(): { items: Exhibition[]; isSample: boolean } {
  const real = collected as Exhibition[];
  if (Array.isArray(real) && real.length > 0) return { items: real, isSample: false };
  return { items: SAMPLE_EXHIBITIONS, isSample: true };
}

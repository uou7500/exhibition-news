import type { Exhibition } from "./types";

/** '예술의 미래' 분류 */
export type FutureKind = "졸업전시" | "실험전시" | "작가전";
export const FUTURE_KINDS: FutureKind[] = ["졸업전시", "실험전시", "작가전"];

const GRAD = /졸업|졸전|학위청구|degree\s*show|graduation/i;
const EXPERIMENT = /실험|프로젝트|project|레지던시|레지던스|오픈\s?스튜디오|open\s?studio|신진|청년\s?작가|영아티스트|young\s?artist|퍼포먼스|performance|사운드|선정\s?작가|입주\s?작가|창작\s?공간|창작\s?센터|앙데팡당/i;
const SOLO = /개인전|solo\s*(show|exhibition)/i;
/** 큰 기관: 작가 개인전이라도 '소규모'로 보지 않는다 */
const INSTITUTION = /미술관|박물관|국립|시립|도립|군립|문화재단|아트센터|예술의전당|문화예술회관|문화회관|기념관|DDP|플라자|아트리움|백화점|호텔/;

/**
 * 제목·장소·소개글로 '예술의 미래' 분류를 추정한다.
 * 직접 붙인 tags가 있으면 그것을 먼저 따른다.
 */
export function futureKindOf(x: Exhibition): FutureKind | null {
  for (const k of FUTURE_KINDS) if (x.tags?.includes(k)) return k;
  if (GRAD.test(x.title)) return "졸업전시";
  const big = INSTITUTION.test(x.venue);
  const text = `${x.title} ${(x.description ?? "").slice(0, 400)}`;
  if (EXPERIMENT.test(x.title) || (!big && EXPERIMENT.test(text))) return "실험전시";
  if (SOLO.test(x.title) && !big) return "작가전";
  return null;
}

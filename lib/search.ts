// 검색: 검색어를 완벽히 쓰지 않아도 가까운 전시를 찾는다.
// 1) 그대로 들어 있으면 '정확히 맞음'
// 2) 줄임말 사전(홍대 → 홍익대 등)으로 바꿔서 들어 있으면 '정확히 맞음'
// 3) 검색어 글자가 한 칸(제목·장소·주소 등) 안에 순서대로 가까이 들어 있으면 '비슷함' (예: "홍대" → "홍익대학교", "국현" → "국립현대미술관")
// 띄어쓰기·대소문자는 무시한다. 여러 낱말이면 모든 낱말이 맞아야 한다.

import type { Exhibition } from "./types";

/** 자주 쓰는 줄임말·다른 이름 → 실제 이름에 들어가는 글자 */
const ALIASES: Record<string, string[]> = {
  홍대: ["홍익대", "홍익"],
  이대: ["이화여대", "이화여자대", "이화"],
  숙대: ["숙명여대", "숙명여자대"],
  성대: ["성균관대"],
  중대: ["중앙대"],
  건대: ["건국대"],
  국민대: ["국민대학교"],
  한예종: ["한국예술종합학교"],
  서울예대: ["서울예술대"],
  과기대: ["서울과학기술대", "과학기술대"],
  서울과기대: ["서울과학기술대"],
  국현: ["국립현대미술관", "mmca"],
  국립현대: ["국립현대미술관", "mmca"],
  서울시립: ["서울시립미술관", "sema"],
  시립미술관: ["시립미술관", "sema"],
  ddp: ["동대문디자인플라자", "ddp"],
  동디플: ["동대문디자인플라자", "ddp"],
  예당: ["예술의전당"],
  예술의전당: ["예술의전당", "한가람"],
  현대갤러리: ["갤러리현대", "현대화랑"],
  을지로: ["을지로", "중구"],
  성수: ["성수", "성동구"],
  문래: ["문래", "영등포구"],
  삼청동: ["삼청로", "삼청동"],
  서촌: ["자하문로", "효자로", "필운대로", "통의동", "서촌"],
  la: ["로스앤젤레스", "losangeles"],
  엘에이: ["로스앤젤레스", "losangeles"],
  뉴욕: ["뉴욕", "newyork", "브루클린", "퀸스"],
  샌프란: ["샌프란시스코", "sanfrancisco"],
  졸전: ["졸업전", "졸업작품", "졸업전시"],
  졸업전: ["졸업전", "졸업작품", "졸업전시", "학위청구"],
};

function compact(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "");
}

/** 검색에 쓰는 칸들 (각 칸은 띄어쓰기 없앤 소문자). near = 비슷한 글자 찾기에 쓰는 칸(주소·도시는 '서울특별시 ○○대로'처럼 흔한 글자가 많아 뺀다) */
const fieldCache = new WeakMap<Exhibition, { all: string[]; near: string[] }>();
function fieldsOf(x: Exhibition): { all: string[]; near: string[] } {
  let f = fieldCache.get(x);
  if (!f) {
    const near = [x.title, x.venue, ...(x.keywords ?? [])].map(compact).filter(Boolean);
    const all = [...near, ...[x.city, x.genre, x.address ?? "", ...(x.tags ?? [])].map(compact).filter(Boolean)];
    f = { all, near };
    fieldCache.set(x, f);
  }
  return f;
}

/** t의 글자가 s 안에 순서대로, 너무 멀지 않게(글자 수 × 2 + 1칸 안) 들어 있는지 */
function nearIn(s: string, t: string): boolean {
  const chars = [...t];
  if (chars.length < 2) return false;
  const maxSpan = chars.length * 2 + 1;
  for (let start = s.indexOf(chars[0]); start !== -1; start = s.indexOf(chars[0], start + 1)) {
    let pos = start;
    let ok = true;
    for (let i = 1; i < chars.length; i++) {
      pos = s.indexOf(chars[i], pos + 1);
      if (pos === -1 || pos - start >= maxSpan) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

/** 검색어를 낱말로 나눈다 (소문자, 빈 낱말 없음) */
export function searchTerms(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * 전시가 검색어에 얼마나 맞는지: 2 = 정확히 맞음, 1 = 비슷함, 0 = 안 맞음.
 * 낱말이 하나라도 안 맞으면 0, 하나라도 '비슷함'이면 1.
 */
export function matchLevel(x: Exhibition, terms: string[]): 0 | 1 | 2 {
  if (!terms.length) return 2;
  const { all, near } = fieldsOf(x);
  let level: 1 | 2 = 2;
  for (const t of terms) {
    if (all.some((f) => f.includes(t))) continue;
    const alias = ALIASES[t];
    if (alias && all.some((f) => alias.some((a) => f.includes(a)))) continue;
    if (near.some((f) => nearIn(f, t))) {
      level = 1;
      continue;
    }
    return 0;
  }
  return level;
}

/** 정확히 맞는 전시가 이만큼 이상이면 '비슷함'은 보여 주지 않는다 (찾는 게 이미 충분히 나왔을 때 엉뚱한 결과가 섞이지 않게) */
export const NEAR_ONLY_BELOW = 5;

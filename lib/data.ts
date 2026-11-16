import type { Exhibition } from "./types";
import { SAMPLE_EXHIBITIONS } from "./sample-exhibitions";
import collected from "@/data/exhibitions.json";
import manual from "@/data/manual-exhibitions.json";

/** 원본에 섞여 있는 &lt; &middot; 같은 HTML 글자를 보통 글자로 */
function decode(s: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", middot: "·", times: "×", nbsp: " ", hellip: "…", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”" };
  let out = s;
  for (let i = 0; i < 2 && /&(#\d+|[a-z]+);/i.test(out); i++) {
    out = out.replace(/&(#\d+|[a-z]+);/gi, (m, k: string) =>
      k[0] === "#" ? String.fromCharCode(Number(k.slice(1))) : named[k.toLowerCase()] ?? m,
    );
  }
  return out;
}

function clean(x: Exhibition): Exhibition {
  return { ...x, title: decode(x.title), venue: decode(x.venue), address: x.address && decode(x.address) };
}

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

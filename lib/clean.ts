import type { Exhibition } from "./types";

/** 원본에 섞여 있는 &lt; &middot; 같은 HTML 글자를 보통 글자로 */
export function decode(s: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", middot: "·", times: "×", nbsp: " ", hellip: "…", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”" };
  let out = s;
  for (let i = 0; i < 2 && /&(#\d+|[a-z]+);/i.test(out); i++) {
    out = out.replace(/&(#\d+|[a-z]+);/gi, (m, k: string) =>
      k[0] === "#" ? String.fromCharCode(Number(k.slice(1))) : named[k.toLowerCase()] ?? m,
    );
  }
  return out;
}

export function cleanExhibition(x: Exhibition): Exhibition {
  return { ...x, title: decode(x.title), venue: decode(x.venue), address: x.address && decode(x.address) };
}

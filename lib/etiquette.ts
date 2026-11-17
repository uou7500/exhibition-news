/**
 * 방명록 에티켓: 욕설·비하 표현을 막는다.
 * 같은 규칙이 Supabase(`docs/supabase-guestbook.sql`의 has_bad_words)에도 있어
 * 앱을 거치지 않고 보내도 저장되지 않는다. 단어를 바꾸면 두 곳을 함께 고칠 것.
 */

// 띄어쓰기·기호·숫자를 지운 뒤 찾는다 (예: "시 발", "시1발")
const BAD = [
  "시발", "씨발", "씨빨", "시빨", "씨바", "시바새", "ㅅㅂ", "ㅆㅂ", "ㅅㅃ", "썅",
  "병신", "븅신", "ㅂㅅ", "ㅄ",
  "좆", "존나", "졸라", "ㅈㄴ", "ㅈ같",
  "개새끼", "개새기", "개색", "개세끼", "ㄱㅅㄲ", "새끼야",
  "지랄", "ㅈㄹ", "미친놈", "미친년", "미친새", "닥쳐", "꺼져", "엿먹",
  "fuck", "shit", "bitch", "tlqkf", "qudtls",
];
// 평범한 낱말 속에 우연히 들어간 경우 (예: 시발점)
const OK = ["시발점", "시발역", "시바견"];

function squash(s: string): string {
  let t = s.toLowerCase().replace(/[^가-힣ㄱ-ㅎㅏ-ㅣa-z]/g, "");
  for (const w of OK) t = t.split(w).join("");
  return t;
}

export function hasBadWords(...texts: string[]): boolean {
  return texts.some((s) => {
    const t = squash(s);
    return BAD.some((w) => t.includes(w));
  });
}

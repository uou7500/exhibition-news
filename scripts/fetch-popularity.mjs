#!/usr/bin/env node
// 대중픽: 전시마다 네이버 블로그에 최근 30일 동안 올라온 글 수를 세어 data/popularity.json에 저장한다.
//
// 실행: NAVER_CLIENT_ID=... NAVER_CLIENT_SECRET=... node scripts/fetch-popularity.mjs
// 키 발급: 네이버 클라우드 플랫폼 콘솔 → NAVER API HUB → 이용 신청 → Application 등록(검색 API) → 인증 정보의 Client ID / Client Secret
// 키가 없으면 아무것도 하지 않고 끝난다 (워크플로가 실패하지 않게).

import { readFile, writeFile } from "node:fs/promises";

const ID = process.env.NAVER_CLIENT_ID;
const SECRET = process.env.NAVER_CLIENT_SECRET;
if (!ID || !SECRET) {
  console.log("NAVER_CLIENT_ID / NAVER_CLIENT_SECRET이 없어 대중픽 수집을 건너뜁니다.");
  process.exit(0);
}

const EXHIBITIONS = new URL("../data/exhibitions.json", import.meta.url);
const OUT = new URL("../data/popularity.json", import.meta.url);
const WINDOW_DAYS = 30;

/** 제목에서 [갤러리명], (부제), 따옴표·괄호 기호를 걷어낸 핵심 제목 */
function coreTitle(x) {
  const t = x.title
    .replace(/\[[^\]]*\]|\([^)]*\)/g, " ")
    .replace(/[《》〈〉「」『』<>"'“”‘’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // 한글 제목에 영어 부제가 붙어 있으면 한글 부분만 (블로그 글은 보통 한글 제목만 쓴다)
  if (/[가-힣]/.test(t)) {
    const ko = t.split(" ").filter((w) => /[가-힣0-9]/.test(w)).join(" ");
    if (ko.length >= 2) return ko;
  }
  return t;
}
const squash = (s) => s.replace(/<[^>]+>/g, "").replace(/&[a-z#0-9]+;/gi, "").replace(/[\s\p{P}\p{S}]/gu, "").toLowerCase();
const venueKey = (x) => squash(x.venue.replace(/\(.*?\)|\[.*?\]/g, "")).slice(0, 6);

/** 검색어: 핵심 제목을 큰따옴표로 묶어 '정확히 그 말'이 들어간 글만 찾는다 */
function queryOf(x) {
  return `"${coreTitle(x)}"`;
}

/** 이 글이 정말 이 전시 이야기인지: 핵심 제목(공백·기호 무시)이 글 제목·요약에 들어 있어야 한다.
 *  제목이 짧거나 흔한 말이면(8글자 미만) 장소 이름도 함께 나와야 인정한다. */
function mentions(item, x) {
  const text = squash(`${item.title ?? ""} ${item.description ?? ""}`);
  const core = squash(coreTitle(x));
  if (!core || !text.includes(core)) return false;
  if (core.length < 8 && !text.includes(venueKey(x))) return false;
  return true;
}

async function search(query) {
  // 2026년부터 네이버 검색 API는 NAVER API HUB(네이버 클라우드 플랫폼)로 옮겨졌다. 주소와 헤더 이름이 바뀜.
  const url = `https://naverapihub.apigw.ntruss.com/search/v1/blog?query=${encodeURIComponent(query)}&display=100&sort=date`;
  const res = await fetch(url, { headers: { "X-NCP-APIGW-API-KEY-ID": ID, "X-NCP-APIGW-API-KEY": SECRET } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

const ymd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

async function main() {
  const all = JSON.parse(await readFile(EXHIBITIONS, "utf8"));
  const today = ymd(new Date());
  const since = ymd(new Date(Date.now() - WINDOW_DAYS * 86_400_000));
  const targets = all.filter((x) => x.endDate.replaceAll("-", "") >= today);

  const items = {};
  let fails = 0;
  for (const x of targets) {
    try {
      const r = await search(queryOf(x));
      const hits = (r.items ?? []).filter((it) => mentions(it, x));
      const recent = hits.filter((it) => String(it.postdate) >= since).length;
      items[x.id] = { recent, total: r.total ?? 0 };
    } catch (e) {
      fails++;
      if (fails <= 3) console.warn(`검색 실패 ${x.id}: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 110)); // 초당 10회 제한
  }

  await writeFile(OUT, JSON.stringify({ updatedAt: new Date().toISOString(), windowDays: WINDOW_DAYS, items }, null, 2) + "\n");
  const top = Object.entries(items).sort((a, b) => b[1].recent - a[1].recent).slice(0, 5);
  console.log(`대중픽 저장: ${Object.keys(items).length}건 (실패 ${fails}건). 상위:`, top.map(([id, v]) => `${id}=${v.recent}`).join(", "));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

#!/usr/bin/env node
// 대중픽: 전시마다 네이버 블로그에 최근 30일 동안 올라온 글 수를 세어 data/popularity.json에 저장한다.
//
// 실행: NAVER_CLIENT_ID=... NAVER_CLIENT_SECRET=... node scripts/fetch-popularity.mjs
// 키 발급: https://developers.naver.com → Application 등록 → 사용 API '검색'
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

/** 검색어: 제목에서 [갤러리명], (부제), 따옴표 등을 걷어낸다. 너무 짧으면 장소를 붙인다. */
function queryOf(x) {
  let t = x.title
    .replace(/\[[^\]]*\]|\([^)]*\)|<[^>]*>|《|》|〈|〉|「|」|『|』|"|'|“|”|‘|’/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length < 6) t = `${t} ${x.venue}`.trim();
  return `${t} 전시`;
}

async function search(query) {
  const url = `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(query)}&display=100&sort=date`;
  const res = await fetch(url, { headers: { "X-Naver-Client-Id": ID, "X-Naver-Client-Secret": SECRET } });
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
      const recent = (r.items ?? []).filter((it) => String(it.postdate) >= since).length;
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

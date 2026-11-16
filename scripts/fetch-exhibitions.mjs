#!/usr/bin/env node
// 한국문화정보원 '한눈에보는문화정보' API에서 전시만 골라 data/exhibitions.json으로 저장한다.
//
// 실행:  DATA_GO_KR_KEY=발급받은_디코딩_키 node scripts/fetch-exhibitions.mjs
// 자동 실행: .github/workflows/fetch-exhibitions.yml (매일 새벽)
//
// API 안내: https://www.data.go.kr/data/15138937/openapi.do
//          https://www.culture.go.kr/industry/apiGuideA.do
//
// ⚠️ 응답 필드 이름(title, startDate, gpsX ...)은 문서 기준이며 첫 실행에서 확인이 필요하다.
//    필드가 다르면 FIELD 매핑만 고치면 된다. 실행 시 첫 항목의 원본 필드를 로그로 남긴다.

import { readFile, writeFile } from "node:fs/promises";

const KEY = process.env.DATA_GO_KR_KEY;
if (!KEY) {
  console.error("DATA_GO_KR_KEY 환경변수가 없습니다. 공공데이터포털 마이페이지의 '일반 인증키(Decoding)'를 넣어 주세요.");
  process.exit(1);
}

const BASE = "https://apis.data.go.kr/B553457/nopenapi/rest/publicperformancedisplays";
const OUT = new URL("../data/exhibitions.json", import.meta.url);
const ROWS = 100;
const MAX_PAGES = 30;
const MAX_DETAIL_CALLS = 400; // 하루 호출 한도를 넘지 않도록 상세 조회 수를 제한
const DAYS_AHEAD = 120;

/** 이 분야(realmName)만 전시로 본다 */
const EXHIBITION_REALMS = ["미술", "전시"];

const FIELD = {
  seq: "seq",
  title: "title",
  start: "startDate",
  end: "endDate",
  place: "place",
  realm: "realmName",
  area: "area",
  sigungu: "sigungu",
  thumbnail: "thumbnail",
  lon: "gpsX",
  lat: "gpsY",
  price: "price",
  url: "url",
  address: "placeAddr",
  contents: "contents1",
};

// ---------- 작은 XML 파서 (의존성 없이) ----------
function decodeEntities(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .trim();
}
function parseItems(xml) {
  const blocks = [...xml.matchAll(/<(item|perforList)>([\s\S]*?)<\/\1>/g)].map((m) => m[2]);
  return blocks.map((b) => {
    const o = {};
    for (const m of b.matchAll(/<(\w+)>([\s\S]*?)<\/\1>/g)) o[m[1]] = decodeEntities(m[2]);
    return o;
  });
}
function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? decodeEntities(m[1]) : undefined;
}

async function call(path, params) {
  const qs = new URLSearchParams({ serviceKey: KEY, ...params });
  const res = await fetch(`${BASE}/${path}?${qs}`);
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} HTTP ${res.status}: ${text.slice(0, 200)}`);
  const code = tag(text, "resultCode");
  if (code && !["00", "0000"].includes(code)) throw new Error(`${path} 오류 ${code}: ${tag(text, "resultMsg")}`);
  return text;
}

// ---------- 정리 ----------
const ymd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
const toIso = (s) => {
  const d = String(s ?? "").replace(/\D/g, "");
  return d.length >= 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : null;
};

function parsePrice(text) {
  if (!text) return null;
  if (/무료/.test(text) && !/\d{3,}/.test(text.replace(/,/g, ""))) return 0;
  const nums = [...text.replace(/,/g, "").matchAll(/(\d{3,})\s*원/g)].map((m) => Number(m[1]));
  if (nums.length) return Math.max(...nums); // 성인 요금이 보통 가장 비싸다
  return /무료/.test(text) ? 0 : null;
}

function guessGenre(text) {
  const t = text ?? "";
  if (/사진|포토/.test(t)) return "사진";
  if (/미디어|영상|디지털|인터랙티브|XR|VR|몰입/.test(t)) return "미디어";
  if (/조각|설치/.test(t)) return "조각·설치";
  if (/공예|도자|도예|옹기|백자|섬유/.test(t)) return "공예";
  if (/디자인|건축/.test(t)) return "디자인";
  if (/회화|그림|드로잉|서예|수묵|유화|판화/.test(t)) return "회화";
  return "기타";
}

function cityOf(raw) {
  const sigungu = raw[FIELD.sigungu] ?? "";
  const area = raw[FIELD.area] ?? "";
  const metro = ["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "제주"];
  const m = metro.find((c) => area.startsWith(c));
  if (m) return m;
  return sigungu.replace(/(시|군|구)$/, "") || area || "기타";
}

function toExhibition(raw, detail) {
  const r = { ...raw, ...detail };
  const lat = Number(r[FIELD.lat]);
  const lon = Number(r[FIELD.lon]);
  const startDate = toIso(r[FIELD.start]);
  const endDate = toIso(r[FIELD.end]);
  if (!startDate || !endDate || !Number.isFinite(lat) || !Number.isFinite(lon) || lat < 33 || lat > 39 || lon < 124 || lon > 132) {
    return null; // 좌표나 날짜가 없으면 지도에 못 올린다 (다음 단계: 주소로 좌표 찾기)
  }
  const priceText = r[FIELD.price] || undefined;
  const description = r[FIELD.contents]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 600) || undefined;
  return {
    id: `culture-${r[FIELD.seq]}`,
    title: r[FIELD.title],
    venue: r[FIELD.place] || "장소 미정",
    city: cityOf(r),
    lat,
    lon,
    genre: guessGenre(`${r[FIELD.title]} ${description ?? ""}`),
    startDate,
    endDate,
    price: parsePrice(priceText),
    priceText,
    description,
    thumbnail: r[FIELD.thumbnail]?.startsWith("http") ? r[FIELD.thumbnail].replace(/^http:/, "https:") : undefined,
    url: r[FIELD.url]?.startsWith("http") ? r[FIELD.url] : undefined,
    address: r[FIELD.address] || undefined,
    source: "culture.go.kr",
  };
}

// ---------- 실행 ----------
async function main() {
  const now = new Date();
  const to = new Date(now.getTime() + DAYS_AHEAD * 86_400_000);

  // 1) 기간별 목록
  const list = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const xml = await call("period", { from: ymd(now), to: ymd(to), cPage: String(page), rows: String(ROWS) });
    const items = parseItems(xml);
    if (page === 1) {
      console.log(`전체 건수: ${tag(xml, "totalCount") ?? "알 수 없음"}`);
      if (items[0]) console.log("첫 항목 원본 필드:", Object.keys(items[0]).join(", "));
    }
    list.push(...items);
    if (items.length < ROWS) break;
  }

  // 2) 전시 분야만
  const exhibits = list.filter((r) => EXHIBITION_REALMS.some((k) => (r[FIELD.realm] ?? "").includes(k)));
  console.log(`목록 ${list.length}건 중 전시 ${exhibits.length}건`);

  // 3) 상세 정보 (가격·링크·소개). 이전에 받은 상세는 다시 부르지 않는다.
  let previous = [];
  try {
    previous = JSON.parse(await readFile(OUT, "utf8"));
  } catch {}
  const cache = new Map(previous.map((x) => [x.id, x]));

  let calls = 0;
  const result = [];
  for (const raw of exhibits) {
    const id = `culture-${raw[FIELD.seq]}`;
    const old = cache.get(id);
    let detail = {};
    if (old) {
      detail = { [FIELD.price]: old.priceText, [FIELD.url]: old.url, [FIELD.address]: old.address, [FIELD.contents]: old.description };
    } else if (calls < MAX_DETAIL_CALLS) {
      try {
        const xml = await call("detail", { seq: raw[FIELD.seq] });
        detail = parseItems(xml)[0] ?? {};
        calls++;
        await new Promise((r) => setTimeout(r, 120));
      } catch (e) {
        console.warn(`상세 조회 실패 ${id}: ${e.message}`);
      }
    }
    const x = toExhibition(raw, detail);
    if (x) result.push(x);
  }

  result.sort((a, b) => a.endDate.localeCompare(b.endDate));
  await writeFile(OUT, JSON.stringify(result, null, 2) + "\n");
  console.log(`저장 완료: ${result.length}건 (상세 조회 ${calls}회, 좌표·날짜 없어 제외 ${exhibits.length - result.length}건)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

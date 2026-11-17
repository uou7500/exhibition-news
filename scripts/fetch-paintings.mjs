#!/usr/bin/env node
// 시작 화면 제목 글자에 넣을 그림 목록을 만든다.
// 1) scripts/paintings.candidates.json의 그림을 위키미디어 공용에서 찾고
// 2) 퍼블릭 도메인으로 표시된 파일만 남긴 뒤
// 3) 이미지 색을 분석해 회색 비중(gray), 흰색 비중(white), 화려함(colorful)을 계산해
// data/paintings.json에 저장한다. 날씨에 맞는 그림은 앱이 이 값으로 고른다.
//
// 실행: npm install --no-save sharp && node scripts/fetch-paintings.mjs  (GitHub Actions에서 실행)

import { mkdir, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const UA = "exhibition-news-app/1.0 (https://github.com/uou7500/exhibition-news)";
const CANDIDATES = new URL("./paintings.candidates.json", import.meta.url);
const OUT = new URL("../data/paintings.json", import.meta.url);
// 그림 파일을 우리 사이트에 직접 둔다 (위키미디어 이미지를 바로 불러오면 휴대폰에서 막히는 경우가 있어서)
const IMG_DIR = new URL("../public/paintings/", import.meta.url);

async function api(params) {
  const url = "https://commons.wikimedia.org/w/api.php?" + new URLSearchParams({ format: "json", formatversion: "2", origin: "*", ...params });
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`commons HTTP ${res.status}`);
  return res.json();
}

const strip = (s) => String(s ?? "").replace(/<[^>]+>/g, "").trim();

async function find(c) {
  const r = await api({
    action: "query",
    generator: "search",
    gsrsearch: `${c.search} filetype:bitmap`,
    gsrnamespace: "6",
    gsrlimit: "8",
    prop: "imageinfo",
    iiprop: "url|size|extmetadata",
    iiurlwidth: "1600",
  });
  const pages = (r.query?.pages ?? []).sort((a, b) => a.index - b.index);
  const words = c.search.toLowerCase().split(/\s+/).filter((w) => w.length > 3 && !/claude|monet|henri|matisse/.test(w));
  for (const p of pages) {
    const ii = p.imageinfo?.[0];
    if (!ii || ii.width < 800) continue;
    const meta = ii.extmetadata ?? {};
    const license = strip(meta.LicenseShortName?.value);
    if (!/public domain|^pd|cc0/i.test(license)) continue;
    const name = p.title.toLowerCase();
    const hits = words.filter((w) => name.includes(w)).length;
    if (hits < Math.min(2, words.length)) continue; // 제목 단어가 파일 이름에 들어 있어야
    if (/detail|frame|museum|exhibition|photo|signature|flickr|shutter|house in/.test(name)) continue; // 전시장 사진·부분도·다른 사진 제외
    return { file: p.title, image: ii.thumburl ?? ii.url, page: ii.descriptionurl, license, width: ii.width, height: ii.height };
  }
  return null;
}

async function download(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`image HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** 가로 1280px JPEG로 줄여 public/paintings/에 저장하고 파일 이름을 돌려준다 */
async function saveLocal(buf, slug) {
  await mkdir(IMG_DIR, { recursive: true });
  const name = `${slug}.jpg`;
  await sharp(buf).resize({ width: 1280, withoutEnlargement: true }).jpeg({ quality: 80, mozjpeg: true }).toFile(new URL(name, IMG_DIR).pathname);
  return name;
}

async function colorStats(buf) {
  const { data, info } = await sharp(buf).resize(96, 96, { fit: "inside" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let gray = 0, white = 0, n = 0, satSum = 0;
  let rgSum = 0, ybSum = 0, rg2 = 0, yb2 = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const v = max, s = max === 0 ? 0 : (max - min) / max;
    if (v > 0.78 && s < 0.16) white++;
    else if (s < 0.22) gray++;
    satSum += s;
    const rg = r - g, yb = 0.5 * (r + g) - b;
    rgSum += rg; ybSum += yb; rg2 += rg * rg; yb2 += yb * yb;
    n++;
  }
  const mRg = rgSum / n, mYb = ybSum / n;
  const sd = Math.sqrt(rg2 / n - mRg * mRg + (yb2 / n - mYb * mYb));
  const mean = Math.sqrt(mRg * mRg + mYb * mYb);
  const colorful = (sd + 0.3 * mean) * 255; // Hasler–Süsstrunk 화려함 지수
  const r2 = (x) => Math.round(x * 1000) / 1000;
  return { gray: r2(gray / n), white: r2(white / n), colorful: Math.round(colorful), saturation: r2(satSum / n) };
}

async function main() {
  const cands = JSON.parse(await readFile(CANDIDATES, "utf8"));
  const out = [];
  for (const c of cands) {
    try {
      const f = await find(c);
      if (!f) {
        console.warn(`못 찾음: ${c.artist} ${c.title}`);
        continue;
      }
      const buf = await download(f.image);
      const stats = await colorStats(buf);
      const slug = f.file.replace(/^File:/, "").replace(/\.[a-z]+$/i, "").normalize("NFKD").replace(/[^\w-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 60);
      const local = await saveLocal(buf, slug);
      out.push({ id: f.file.replace(/^File:/, ""), artist: c.artist, title: c.title, year: c.year, ...f, local, stats });
      console.log(`${c.artist} 〈${c.title}〉 → ${f.file} | 회색 ${stats.gray} 흰색 ${stats.white} 화려함 ${stats.colorful}`);
      await new Promise((r) => setTimeout(r, 300));
    } catch (e) {
      console.warn(`실패: ${c.title}: ${e.message}`);
    }
  }
  await writeFile(OUT, JSON.stringify(out, null, 2) + "\n");
  console.log(`저장: ${out.length}/${cands.length}점`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

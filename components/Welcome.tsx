"use client";

// 앱을 켰을 때 처음 보이는 화면: 오늘 열리는 전시 수, 대중을 위한·예술의 미래 탭, 시작 버튼.

import { useEffect, useMemo, useRef, useState } from "react";
import InstallApp from "./InstallApp";
import type { Exhibition } from "@/lib/types";
import type { PopularityData } from "@/lib/picks";
import { FUTURE_KINDS, futureKindOf, type FutureKind } from "@/lib/future";
import { formatDate, statusOf } from "@/lib/status";
import Poster from "./Poster";
import { candidatesFor, imageSources, seoulWeatherCode, type TodayArt } from "@/lib/paintings";

type Tab = "popular" | "future";
/** 처음 화면에서 아래 버튼 위로 '대중을 위한·예술의 미래' 탭 줄이 이만큼(px) 보이게 그림 띠 줄 수·크기를 맞춘다 */
const PICKS_PEEK = 72;

/** 그림 띠 모양: 줄 수와 동그라미 크기(px). null = CSS 기본(3줄, clamp(104px,30vw,132px)) */
type BandFit = { rows: number; dot: number | null };
/**
 * 띠 높이 = 위아래 여백 24px + 0.9 × 줄 수 × 동그라미 크기 (줄끼리 10%씩 겹침).
 * 3줄 → 2줄 → 1줄 순서로, 동그라미가 너무 작아지지 않는 가장 많은 줄을 고른다.
 */
function fitBand(room: number, normal: number): BandFit {
  for (const [rows, min] of [[3, 88], [2, 80]] as const) {
    const d = Math.floor((room - 24) / (0.9 * rows));
    if (d >= normal) return { rows, dot: rows === 3 ? null : normal };
    if (d >= min) return { rows, dot: d };
  }
  const d = Math.floor((room - 24) / 0.9);
  return { rows: 1, dot: Math.max(64, Math.min(normal, d)) };
}
const WEEKDAYS = "일월화수목금토";

interface Card {
  x: Exhibition;
  rank: number;
  meta: string;
  quote?: string;
}

export default function Welcome({
  exhibitions,
  popularity,
  onPick,
  onNear,
  onBrowse,
  initialArt,
}: {
  exhibitions: Exhibition[];
  popularity: PopularityData;
  onPick: (id: string) => void;
  onNear: () => void;
  onBrowse: () => void;
  /** 빌드할 때 서울 날씨로 미리 정해 둔 오늘의 그림 (바로 보이게) */
  initialArt: TodayArt | null;
}) {
  // 날짜·진행 상태는 보는 사람의 오늘 기준이라 화면이 뜬 뒤에 계산한다
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  const [tab, setTab] = useState<Tab>("popular");

  // 첫 화면에 추천 탭이 살짝 보이도록 그림 띠의 줄 수·동그라미 크기를 화면 높이에 맞춘다
  const rootRef = useRef<HTMLDivElement>(null);
  const bandRef = useRef<HTMLDivElement>(null);
  const footRef = useRef<HTMLElement>(null);
  const [band, setBand] = useState<BandFit>({ rows: 3, dot: null });
  useEffect(() => {
    const root = rootRef.current;
    const bandEl = bandRef.current;
    const foot = footRef.current;
    if (!root || !bandEl || !foot) return;
    const fit = () => {
      // CSS 기본 크기: clamp(104px, 30vw, 132px)
      const normal = Math.min(132, Math.max(104, window.innerWidth * 0.3));
      // 띠가 쓸 수 있는 높이: 화면 - 아래 버튼 - 띠 위쪽(제목 등) - 띠 아래 간격 22px - 탭이 보일 만큼
      const room = root.clientHeight - foot.offsetHeight - bandEl.offsetTop - 22 - PICKS_PEEK;
      const next = fitBand(room, normal);
      setBand((cur) => (cur.rows === next.rows && cur.dot === next.dot ? cur : next));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(root);
    ro.observe(foot);
    if (bandEl.previousElementSibling) ro.observe(bandEl.previousElementSibling);
    return () => ro.disconnect();
  }, []);
  const [kind, setKind] = useState<FutureKind | null>(null);

  // 오늘의 그림: 서울 날씨에 맞는 색 비중의 그림을 제목 글자 안에 넣는다.
  // 화면이 열려 있는 동안 10분마다, 그리고 앱으로 돌아올 때마다 날씨를 다시 보고 바뀌었으면 그림도 바꾼다.
  const [art, setArt] = useState<TodayArt | null>(initialArt);
  useEffect(() => {
    let alive = true;
    let current = initialArt ? `${initialArt.p.id}|${initialArt.note}` : "";
    const load = (src: string) =>
      new Promise<boolean>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = src;
      });
    // 지금 날씨를 다시 확인해 그림이 달라졌을 때만 바꾼다 (같으면 아무것도 안 함 → 깜빡임 없음)
    const refresh = async () => {
      const code = await seoulWeatherCode();
      const { list, note } = candidatesFor(code, new Date());
      for (const p of list) {
        const key = `${p.id}|${note}`;
        if (key === current) return;
        for (const src of imageSources(p)) {
          if (!alive) return;
          if (await load(src)) {
            if (!alive) return;
            current = key;
            setArt({ p, src, note });
            return;
          }
        }
      }
    };
    refresh();
    const timer = setInterval(refresh, 10 * 60_000);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const byId = useMemo(() => new Map(exhibitions.map((x) => [x.id, x])), [exhibitions]);

  const openToday = useMemo(() => {
    if (!now) return null;
    return exhibitions.filter((x) => {
      const k = statusOf(x).kind;
      return k === "on" || k === "ending";
    }).length;
  }, [exhibitions, now]);

  const popular: Card[] = useMemo(() => {
    if (!now) return [];
    return Object.entries(popularity.items)
      .map(([id, v]) => ({ x: byId.get(id), v }))
      .filter((r): r is { x: Exhibition; v: { recent: number; total: number } } => {
        if (!r.x || r.v.recent <= 0) return false;
        const k = statusOf(r.x).kind;
        return k === "on" || k === "ending";
      })
      .sort((a, b) => b.v.recent - a.v.recent)
      .slice(0, 10)
      .map((r, i) => ({ x: r.x, rank: i + 1, meta: `최근 ${popularity.windowDays}일 블로그 ${r.v.recent}건` }));
  }, [popularity, byId, now]);

  // 예술의 미래: 졸업전시·실험전시·소규모 작가전. 진행 중 → 마감 가까운 순, 그다음 2주 안에 개막하는 전시
  const futureAll = useMemo(() => {
    if (!now) return [] as { x: Exhibition; k: FutureKind }[];
    const soon = new Date(now.getTime() + 14 * 86_400_000);
    return exhibitions
      .map((x) => ({ x, k: futureKindOf(x) }))
      .filter((r): r is { x: Exhibition; k: FutureKind } => {
        if (!r.k) return false;
        const st = statusOf(r.x).kind;
        if (st === "on" || st === "ending") return true;
        return st === "upcoming" && new Date(r.x.startDate) <= soon;
      })
      .sort((a, b) => {
        const ua = statusOf(a.x).kind === "upcoming" ? 1 : 0;
        const ub = statusOf(b.x).kind === "upcoming" ? 1 : 0;
        if (ua !== ub) return ua - ub;
        return (ua ? a.x.startDate.localeCompare(b.x.startDate) : a.x.endDate.localeCompare(b.x.endDate));
      });
  }, [exhibitions, now]);

  const future: Card[] = useMemo(
    () =>
      futureAll
        .filter((r) => !kind || r.k === kind)
        .slice(0, 20)
        .map((r, i) => {
          const st = statusOf(r.x);
          return { x: r.x, rank: i + 1, meta: st.kind === "upcoming" ? `${r.k} · ${st.label}` : r.k };
        }),
    [futureAll, kind],
  );

  const kindCount = (k: FutureKind) => futureAll.filter((r) => r.k === k).length;

  const cards = tab === "popular" ? popular : future;
  const dateLine = now ? `${now.getMonth() + 1}월 ${now.getDate()}일 ${WEEKDAYS[now.getDay()]}요일` : " ";

  return (
    <div ref={rootRef} className="welcome" role="dialog" aria-modal="true" aria-label="앙데팡당 시작 화면">
      <div className="w-inner">
        <header className="w-head">
          <p className="w-date">{dateLine}</p>
          {initialArt && <link rel="preload" as="image" href={initialArt.src} />}
          <h1 className={"w-brand" + (art ? " painted" : "")} style={art ? { backgroundImage: `url("${art.src}")` } : undefined}>
            앙데팡당<span className="w-year">2026</span>
          </h1>
          <p className="w-tagline">누구의 전시든, 지도 위에 평등하게</p>
          {art && (
            <p className="w-art">
              오늘의 그림 ·{" "}
              <a href={art.p.page} target="_blank" rel="noopener noreferrer">
                {art.p.artist} 〈{art.p.title}〉 {art.p.year}
              </a>
            </p>
          )}
          <p className="w-count">
            오늘 열려 있는 전시
            <b>{openToday ?? "—"}</b>
            <span>곳</span>
          </p>
        </header>

        <PatternBand ref={bandRef} rows={band.rows} dot={band.dot} day={now ? Math.floor(now.getTime() / 86400000) : 0} />

        <section className="w-picks" aria-label="추천 전시">
          <div className="w-tabs" role="tablist">
            <button role="tab" type="button" aria-selected={tab === "popular"} onClick={() => setTab("popular")}>대중을 위한</button>
            <button role="tab" type="button" aria-selected={tab === "future"} onClick={() => setTab("future")}>예술의 미래</button>
          </div>
          <p className="w-basis">
            {tab === "popular"
              ? `최근 ${popularity.windowDays}일 동안 네이버 블로그에서 가장 많이 이야기된 전시`
              : "졸업전시 · 실험전시 · 소규모 작가전"}
          </p>
          {tab === "future" && (
            <div className="w-kinds">
              <button type="button" className="chip" aria-pressed={kind === null} onClick={() => setKind(null)}>
                전체 {now ? futureAll.length : ""}
              </button>
              {FUTURE_KINDS.map((k) => (
                <button key={k} type="button" className="chip" aria-pressed={kind === k} onClick={() => setKind((c) => (c === k ? null : k))}>
                  {k} {now ? kindCount(k) : ""}
                </button>
              ))}
            </div>
          )}

          {now && cards.length === 0 ? (
            <div className="w-empty">
              {tab === "popular"
                ? "대중을 위한 전시는 하루 다섯 번 집계돼요. 첫 집계가 끝나면 여기에 나와요."
                : kind === "졸업전시"
                  ? "지금 열려 있는 졸업전시가 아직 없어요. 졸업전시는 공공데이터에 거의 올라오지 않아 하나씩 직접 추가하고 있어요."
                  : "지금 조건에 맞는 전시가 없어요."}
            </div>
          ) : (
            <ol className="w-cards">
              {cards.map((c) => (
                <li key={c.x.id}>
                  <button type="button" className="w-card" onClick={() => onPick(c.x.id)}>
                    <span className="w-poster">
                      <Poster exhibition={c.x} className="w-poster-img" />
                      {tab === "popular" && <span className="w-rank">{c.rank}</span>}
                    </span>
                    <span className="w-title">{c.x.title}</span>
                    <span className="w-venue">{c.x.venue} · {c.x.city}</span>
                    <span className="w-dates">~ {formatDate(c.x.endDate)}</span>
                    {c.quote && <span className="w-quote">“{c.quote}”</span>}
                    <span className="w-meta">{c.meta}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>

        <footer ref={footRef} className="w-actions">
          <InstallApp />
          <button type="button" className="btn" onClick={onNear}>내 주변 전시 보기</button>
          <button type="button" className="btn ghost" onClick={onBrowse}>전국 지도 둘러보기</button>
        </footer>
      </div>
    </div>
  );
}

/** 처음 화면 그림 띠: 여러 작품의 한 부분을 같은 크기 동그라미로 (누구의 작품이든 같은 크기). 날마다 순서가 돌아간다 */
const PATTERN = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11"];
function PatternBand({ day, rows: rowCount, dot, ref }: { day: number; rows: number; dot: number | null; ref: React.Ref<HTMLDivElement> }) {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const order = PATTERN.map((_, i) => PATTERN[(i + day) % PATTERN.length]);
  const rows = [order.slice(0, 4), order.slice(4, 8), [...order.slice(8, 11), order[0]]].slice(0, rowCount);
  return (
    <div ref={ref} className="w-pattern" aria-hidden="true" style={dot ? ({ "--d": `${dot}px` } as React.CSSProperties) : undefined}>
      {rows.map((row, r) => (
        <div key={r} className="w-prow">
          {row.map((n) => (
            <span key={n} className="w-dot" style={{ backgroundImage: `url("${base}/pattern/${n}.jpg")` }} />
          ))}
        </div>
      ))}
      <span className="w-credit">copyright by ehd</span>
    </div>
  );
}

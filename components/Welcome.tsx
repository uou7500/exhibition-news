"use client";

// 앱을 켰을 때 처음 보이는 화면: 오늘 열리는 전시 수, 대중픽·전문가 픽, 시작 버튼.

import { useEffect, useMemo, useState } from "react";
import type { Exhibition } from "@/lib/types";
import type { PopularityData } from "@/lib/picks";
import { FUTURE_KINDS, futureKindOf, type FutureKind } from "@/lib/future";
import { formatDate, statusOf } from "@/lib/status";
import Poster from "./Poster";

type Tab = "popular" | "future";
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
}: {
  exhibitions: Exhibition[];
  popularity: PopularityData;
  onPick: (id: string) => void;
  onNear: () => void;
  onBrowse: () => void;
}) {
  // 날짜·진행 상태는 보는 사람의 오늘 기준이라 화면이 뜬 뒤에 계산한다
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  const [tab, setTab] = useState<Tab>("popular");
  const [kind, setKind] = useState<FutureKind | null>(null);

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
    <div className="welcome" role="dialog" aria-modal="true" aria-label="앙데팡당 시작 화면">
      <div className="w-inner">
        <header className="w-head">
          <p className="w-date">{dateLine}</p>
          <h1 className="w-brand">앙데팡당<span aria-hidden="true">.</span></h1>
          <p className="w-tagline">누구의 전시든, 지도 위에 평등하게</p>
          <p className="w-count">
            오늘 열려 있는 전시
            <b>{openToday ?? "—"}</b>
            <span>곳</span>
          </p>
        </header>

        <section className="w-picks" aria-label="추천 전시">
          <div className="w-tabs" role="tablist">
            <button role="tab" type="button" aria-selected={tab === "popular"} onClick={() => setTab("popular")}>대중픽</button>
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
                ? "대중픽은 매일 새벽에 집계돼요. 첫 집계가 끝나면 여기에 순위가 나와요."
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

        <footer className="w-actions">
          <button type="button" className="btn" onClick={onNear}>내 주변 전시 보기</button>
          <button type="button" className="btn ghost" onClick={onBrowse}>전국 지도 둘러보기</button>
        </footer>
      </div>
    </div>
  );
}

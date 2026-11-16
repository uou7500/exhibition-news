"use client";

// 앱을 켰을 때 처음 보이는 화면: 오늘 열리는 전시 수, 대중픽·전문가 픽, 시작 버튼.

import { useEffect, useMemo, useState } from "react";
import type { Exhibition } from "@/lib/types";
import type { ExpertPick, PopularityData } from "@/lib/picks";
import { formatDate, statusOf } from "@/lib/status";
import Poster from "./Poster";

type Tab = "popular" | "expert";
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
  expertPicks,
  onPick,
  onNear,
  onBrowse,
}: {
  exhibitions: Exhibition[];
  popularity: PopularityData;
  expertPicks: ExpertPick[];
  onPick: (id: string) => void;
  onNear: () => void;
  onBrowse: () => void;
}) {
  // 날짜·진행 상태는 보는 사람의 오늘 기준이라 화면이 뜬 뒤에 계산한다
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  const [tab, setTab] = useState<Tab>("popular");

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

  const expert: Card[] = useMemo(() => {
    if (!now) return [];
    return expertPicks
      .map((p) => ({ p, x: byId.get(p.id) }))
      .filter((r): r is { p: ExpertPick; x: Exhibition } => !!r.x && statusOf(r.x).kind !== "over")
      .map((r, i) => ({ x: r.x, rank: i + 1, meta: r.p.role ? `${r.p.by} · ${r.p.role}` : r.p.by, quote: r.p.comment }));
  }, [expertPicks, byId, now]);

  const cards = tab === "popular" ? popular : expert;
  const dateLine = now ? `${now.getMonth() + 1}월 ${now.getDate()}일 ${WEEKDAYS[now.getDay()]}요일` : " ";

  return (
    <div className="welcome" role="dialog" aria-modal="true" aria-label="전시지도 시작 화면">
      <div className="w-inner">
        <header className="w-head">
          <p className="w-date">{dateLine}</p>
          <h1 className="w-brand">전시<span>지도</span></h1>
          <p className="w-count">
            오늘 열려 있는 전시
            <b>{openToday ?? "—"}</b>
            <span>곳</span>
          </p>
        </header>

        <section className="w-picks" aria-label="추천 전시">
          <div className="w-tabs" role="tablist">
            <button role="tab" type="button" aria-selected={tab === "popular"} onClick={() => setTab("popular")}>대중픽</button>
            <button role="tab" type="button" aria-selected={tab === "expert"} onClick={() => setTab("expert")}>전문가 픽</button>
          </div>
          <p className="w-basis">
            {tab === "popular"
              ? `최근 ${popularity.windowDays}일 동안 네이버 블로그에서 가장 많이 이야기된 전시`
              : "전문가가 직접 골라 한마디를 남긴 전시"}
          </p>

          {now && cards.length === 0 ? (
            <div className="w-empty">
              {tab === "popular"
                ? "대중픽은 매일 새벽에 집계돼요. 첫 집계가 끝나면 여기에 순위가 나와요."
                : "전문가 픽을 준비하고 있어요. 곧 추천 전시가 올라와요."}
            </div>
          ) : (
            <ol className="w-cards">
              {cards.map((c) => (
                <li key={c.x.id}>
                  <button type="button" className="w-card" onClick={() => onPick(c.x.id)}>
                    <span className="w-poster">
                      <Poster exhibition={c.x} className="w-poster-img" />
                      <span className="w-rank">{c.rank}</span>
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

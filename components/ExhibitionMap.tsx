"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Exhibition, Genre } from "@/lib/types";
import { formatDate, formatPrice, parseDate, statusOf } from "@/lib/status";
import Poster from "./Poster";
import SvgMapView from "./map/SvgMapView";
import KakaoMapView from "./map/KakaoMapView";
import { POI_LABELS, type PoiCode } from "./map/types";

const GENRES: Genre[] = ["회화", "미디어", "사진", "조각·설치", "공예", "디자인", "기타"];
const POI_CODES: PoiCode[] = ["CS2", "CE7", "SW8"];
type StatusFilter = "all" | "on" | "upcoming";

const DESKTOP = 900;
const KAKAO_KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY ?? "";

function useDesktop() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${DESKTOP}px)`);
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return desktop;
}

export default function ExhibitionMap({ exhibitions, isSample }: { exhibitions: Exhibition[]; isSample: boolean }) {
  const desktop = useDesktop();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [genres, setGenres] = useState<Set<Genre>>(new Set());
  const [freeOnly, setFreeOnly] = useState(false);
  const [poi, setPoi] = useState<Set<PoiCode>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState<{ id: string; seq: number } | null>(null);

  const selected = exhibitions.find((x) => x.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return exhibitions.filter((x) => {
      const st = statusOf(x).kind;
      if (st === "over") return false;
      if (status === "on" && !(st === "on" || st === "ending")) return false;
      if (status === "upcoming" && st !== "upcoming") return false;
      if (genres.size && !genres.has(x.genre)) return false;
      if (freeOnly && x.price !== 0) return false;
      if (q && !(x.title + x.venue + x.city + x.genre).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [exhibitions, query, status, genres, freeOnly]);

  const visible = useMemo(
    () => filtered.filter((x) => visibleIds.has(x.id)).sort((a, b) => +parseDate(a.endDate) - +parseDate(b.endDate)),
    [filtered, visibleIds],
  );

  const onVisibleChange = useCallback((ids: Set<string>) => {
    setVisibleIds((prev) => {
      if (prev.size === ids.size && [...ids].every((id) => prev.has(id))) return prev;
      return ids;
    });
  }, []);

  const select = useCallback((id: string) => {
    setSelectedId(id);
    setListOpen(false);
  }, []);

  const openFromList = (id: string) => {
    select(id);
    setFocus((f) => ({ id, seq: (f?.seq ?? 0) + 1 }));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedId(null);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  const toggle = <T,>(set: React.Dispatch<React.SetStateAction<Set<T>>>, v: T) =>
    set((prev) => {
      const n = new Set(prev);
      if (n.has(v)) n.delete(v);
      else n.add(v);
      return n;
    });

  const mapProps = {
    items: filtered,
    selectedId,
    onSelect: select,
    onVisibleChange,
    focus,
    desktop,
    detailOpen: !!selected,
    poi,
  };

  return (
    <div className="app">
      {KAKAO_KEY ? <KakaoMapView appKey={KAKAO_KEY} {...mapProps} /> : <SvgMapView {...mapProps} />}

      <div className="top">
        <div className="bar">
          <div className="brand">전시<span>지도</span></div>
          <label className="search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-4-4" />
            </svg>
            <input id="q" type="search" placeholder="전시명, 미술관, 도시 검색" aria-label="검색" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
        </div>
        <div className="chips">
          {([["all", "전체"], ["on", "진행 중"], ["upcoming", "개막 예정"]] as [StatusFilter, string][]).map(([k, l]) => (
            <button key={k} className="chip" aria-pressed={status === k} onClick={() => setStatus(k)}>{l}</button>
          ))}
          <span className="sep" />
          <button className="chip free" aria-pressed={freeOnly} onClick={() => setFreeOnly((v) => !v)}>무료만</button>
          <span className="sep" />
          {GENRES.map((g) => (
            <button key={g} className="chip" aria-pressed={genres.has(g)} onClick={() => toggle(setGenres, g)}>{g}</button>
          ))}
        </div>
        {KAKAO_KEY && (
          <div className="chips poi-chips" aria-label="주변 장소 표시">
            <span className="chips-label">주변</span>
            {POI_CODES.map((c) => (
              <button key={c} className={`chip poi-chip poi-chip-${c}`} aria-pressed={poi.has(c)} onClick={() => toggle(setPoi, c)}>
                {POI_LABELS[c]}
              </button>
            ))}
          </div>
        )}
      </div>

      <section className={"list" + (listOpen ? " open" : "")}>
        <button className="list-head" type="button" aria-expanded={listOpen} onClick={() => setListOpen((v) => !v)}>
          <span className="grab" />
          <span className="list-title">
            <h2>지도에 보이는 전시</h2>
            <small>{visible.length}개 / 전체 {filtered.length}개</small>
          </span>
        </button>
        <div className="items">
          {visible.length === 0 ? (
            <div className="empty">이 화면 안에는 조건에 맞는 전시가 없어요.<br />지도를 축소하거나 필터를 바꿔 보세요.</div>
          ) : (
            visible.map((x) => {
              const st = statusOf(x);
              return (
                <button key={x.id} className={"item" + (x.id === selectedId ? " sel" : "")} onClick={() => openFromList(x.id)}>
                  <Poster exhibition={x} className="thumb" />
                  <span className="t">
                    <h3>{x.title}</h3>
                    <p>
                      {st.kind === "ending" ? <span className="tag end">{st.label}</span> : st.kind === "upcoming" ? <span className="tag up">{st.label}</span> : <span className="tag">{x.genre}</span>}
                      {x.venue} · {x.city}
                    </p>
                    <p>{formatDate(x.startDate)} – {formatDate(x.endDate)}</p>
                  </span>
                  <span className={"price" + (x.price === 0 ? " free" : "")}>{formatPrice(x.price)}</span>
                </button>
              );
            })
          )}
          {isSample && <div className="note">지금은 화면 확인용 예시 데이터가 표시돼요. 공공데이터 수집이 시작되면 실제 전시로 바뀝니다.</div>}
        </div>
      </section>

      <div className={"scrim" + (selected && !desktop ? " show" : "")} onClick={() => setSelectedId(null)} />
      <aside className={"detail" + (selected ? " show" : "")} aria-live="polite">
        {selected && <Detail x={selected} onClose={() => setSelectedId(null)} />}
      </aside>
    </div>
  );
}

function Detail({ x, onClose }: { x: Exhibition; onClose: () => void }) {
  const st = statusOf(x);
  const directions = `https://map.kakao.com/link/to/${encodeURIComponent(x.venue)},${x.lat},${x.lon}`;
  return (
    <>
      <button className="d-close" type="button" aria-label="닫기" onClick={onClose}>×</button>
      <div className="d-scroll">
        <div className="poster"><Poster key={x.id} exhibition={x} className="poster-img" /></div>
        <div className="d-body">
          <div>
            <span className={"tag" + (st.kind === "ending" ? " end" : st.kind === "upcoming" ? " up" : "")}>{st.label}</span>
            <span className="tag">{x.genre}</span>
            <h2>{x.title}</h2>
            <div className="d-venue">{x.venue} · {x.city}</div>
          </div>
          <dl className="facts">
            <dt>기간</dt><dd>{formatDate(x.startDate)} – {formatDate(x.endDate)}</dd>
            {x.hours && (<><dt>관람 시간</dt><dd>{x.hours}</dd></>)}
            <dt>관람료</dt><dd>{x.price !== null && x.priceText ? x.priceText : formatPrice(x.price)}</dd>
            <dt>장소</dt><dd>{x.address ?? x.venue}</dd>
          </dl>
          {x.description && <p className="desc">{x.description}</p>}
        </div>
      </div>
      <div className="cta">
        <a className="btn ghost" href={directions} target="_blank" rel="noopener noreferrer">길찾기</a>
        {x.url ? (
          <a className="btn" href={x.url} target="_blank" rel="noopener noreferrer">
            {x.price ? "예매하기" : "전시 안내 보기"}
          </a>
        ) : (
          <button className="btn" disabled>{x.price === 0 ? "무료 관람 · 예매 없이 입장" : "예매 링크 준비 중"}</button>
        )}
      </div>
    </>
  );
}

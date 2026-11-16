"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Exhibition, Genre } from "@/lib/types";
import { formatDate, formatPrice, parseDate, statusOf } from "@/lib/status";
import { KAKAO_MAP_KEY } from "@/lib/config";
import { RADIUS_STEPS, distanceM, formatDistance, radiusLabel, type MyLocation } from "@/lib/geo";
import Poster from "./Poster";
import SvgMapView from "./map/SvgMapView";
import KakaoMapView from "./map/KakaoMapView";
import { POI_LABELS, type PoiCode } from "./map/types";

const GENRES: Genre[] = ["회화", "미디어", "사진", "조각·설치", "공예", "디자인", "기타"];
const POI_CODES: PoiCode[] = ["CS2", "CE7", "SW8"];
type StatusFilter = "all" | "on" | "upcoming";

const DESKTOP = 900;
const KAKAO_KEY = KAKAO_MAP_KEY;

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
  const [myLoc, setMyLoc] = useState<MyLocation | null>(null);
  const [radius, setRadius] = useState<number | null>(null);
  const [locateSeq, setLocateSeq] = useState(0);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);

  const selected = exhibitions.find((x) => x.id === selectedId) ?? null;

  const baseFiltered = useMemo(() => {
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

  // 내 위치에서 각 전시까지 거리(미터)
  const dist = useMemo(() => {
    const m = new Map<string, number>();
    if (myLoc) for (const x of exhibitions) m.set(x.id, distanceM(myLoc.lat, myLoc.lon, x.lat, x.lon));
    return m;
  }, [exhibitions, myLoc]);

  const inRadius = !!(myLoc && radius);
  const filtered = useMemo(
    () => (myLoc && radius ? baseFiltered.filter((x) => (dist.get(x.id) ?? Infinity) <= radius) : baseFiltered),
    [baseFiltered, myLoc, radius, dist],
  );

  // 목록: 반경을 고르면 반경 안 전체를 가까운 순으로, 아니면 지도 화면 안 전시를
  const visible = useMemo(() => {
    const arr = inRadius ? [...filtered] : filtered.filter((x) => visibleIds.has(x.id));
    if (myLoc) return arr.sort((a, b) => (dist.get(a.id) ?? 0) - (dist.get(b.id) ?? 0));
    return arr.sort((a, b) => +parseDate(a.endDate) - +parseDate(b.endDate));
  }, [filtered, visibleIds, inRadius, myLoc, dist]);

  // ----- 내 위치 -----
  const locate = (preferred?: number) => {
    if (!("geolocation" in navigator)) {
      setLocError("이 브라우저에서는 위치를 확인할 수 없어요.");
      return;
    }
    setLocating(true);
    setLocError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy };
        setMyLoc(loc);
        setLocating(false);
        let r = preferred ?? radius;
        if (r == null) {
          // 전시가 3개 이상 들어오는 가장 작은 반경을 고른다
          const ds = baseFiltered.map((x) => distanceM(loc.lat, loc.lon, x.lat, x.lon));
          r = RADIUS_STEPS.find((step) => ds.filter((d) => d <= step).length >= 3) ?? RADIUS_STEPS[RADIUS_STEPS.length - 1];
        }
        setRadius(r);
        setLocateSeq((n) => n + 1);
        setListOpen(true);
      },
      (err) => {
        setLocating(false);
        setLocError(
          err.code === err.PERMISSION_DENIED
            ? "위치 권한이 꺼져 있어요. 아이폰·아이패드는 설정 → 개인정보 보호 및 보안 → 위치 서비스 → Safari 웹 사이트에서 허용해 주세요."
            : err.code === err.TIMEOUT
              ? "위치를 찾는 데 시간이 너무 걸려요. 잠시 후 다시 눌러 주세요."
              : "지금은 위치를 확인할 수 없어요. 잠시 후 다시 시도해 주세요.",
        );
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    );
  };

  const chooseRadius = (r: number) => {
    if (!myLoc) {
      locate(r);
      return;
    }
    setRadius((cur) => (cur === r ? null : r));
    setLocateSeq((n) => n + 1);
  };

  useEffect(() => {
    if (!locError) return;
    const t = setTimeout(() => setLocError(null), 7000);
    return () => clearTimeout(t);
  }, [locError]);

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
    myLoc,
    radius,
    locateSeq,
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
        <div className="chips radius-chips" aria-label="내 위치 반경">
          <span className="chips-label">내 위치</span>
          {RADIUS_STEPS.map((r) => (
            <button key={r} className="chip radius-chip" aria-pressed={radius === r && !!myLoc} onClick={() => chooseRadius(r)}>
              {radiusLabel(r)}
            </button>
          ))}
          {KAKAO_KEY && (
            <>
              <span className="sep" />
              <span className="chips-label">주변</span>
              {POI_CODES.map((c) => (
                <button key={c} className={`chip poi-chip poi-chip-${c}`} aria-pressed={poi.has(c)} onClick={() => toggle(setPoi, c)}>
                  {POI_LABELS[c]}
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      <button
        type="button"
        className={"locate" + (myLoc ? " on" : "") + (locating ? " busy" : "") + (listOpen ? " lifted" : "")}
        aria-label="내 위치로 이동"
        onClick={() => locate()}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="4" fill={myLoc ? "currentColor" : "none"} />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" />
          <circle cx="12" cy="12" r="8" />
        </svg>
      </button>
      {locError && <div className="map-msg" role="alert">{locError}</div>}

      <section className={"list" + (listOpen ? " open" : "")}>
        <button className="list-head" type="button" aria-expanded={listOpen} onClick={() => setListOpen((v) => !v)}>
          <span className="grab" />
          <span className="list-title">
            <h2>{inRadius && radius ? `내 위치 ${radiusLabel(radius)} 안 전시` : myLoc ? "내 주변 전시" : "지도에 보이는 전시"}</h2>
            <small>{inRadius ? `${visible.length}개 · 가까운 순` : `${visible.length}개 / 전체 ${filtered.length}개`}</small>
          </span>
        </button>
        <div className="items">
          {visible.length === 0 ? (
            <div className="empty">
              {inRadius && radius ? (
                <>내 위치 {radiusLabel(radius)} 안에는 조건에 맞는 전시가 없어요.<br />위쪽에서 반경을 더 넓혀 보세요.</>
              ) : (
                <>이 화면 안에는 조건에 맞는 전시가 없어요.<br />지도를 축소하거나 필터를 바꿔 보세요.</>
              )}
            </div>
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
                      {dist.has(x.id) && <span className="dist">{formatDistance(dist.get(x.id)!)}</span>}
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
        {selected && <Detail x={selected} distance={dist.get(selected.id)} onClose={() => setSelectedId(null)} />}
      </aside>
    </div>
  );
}

function Detail({ x, distance, onClose }: { x: Exhibition; distance?: number; onClose: () => void }) {
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
            <div className="d-venue">
              {x.venue} · {x.city}
              {distance !== undefined && <> · 내 위치에서 {formatDistance(distance)}</>}
            </div>
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

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Exhibition, Genre } from "@/lib/types";
import { formatDate, formatPrice, parseDate, statusOf } from "@/lib/status";
import { KAKAO_MAP_KEY } from "@/lib/config";
import { RADIUS_STEPS, distanceM, formatDistance, radiusLabel, type MyLocation } from "@/lib/geo";
import Poster from "./Poster";
import Welcome from "./Welcome";
import type { PopularityData } from "@/lib/picks";
import type { Space } from "@/lib/spaces";
import { futureKindOf } from "@/lib/future";
import SvgMapView from "./map/SvgMapView";
import KakaoMapView from "./map/KakaoMapView";
import { POI_LABELS, type PoiCode } from "./map/types";

const GENRES: Genre[] = ["회화", "미디어", "사진", "조각·설치", "공예", "디자인", "기타"];
const POI_CODES: PoiCode[] = ["CS2", "CE7", "SW8"];
type StatusFilter = "all" | "on" | "upcoming";

const DESKTOP = 900;
const KAKAO_KEY = KAKAO_MAP_KEY;

/** 카카오맵 길찾기 주소. 출발지를 알면 출발지까지 넣는다. */
function directionsUrl(x: Exhibition, from: MyLocation | null): string {
  const to = `${encodeURIComponent(x.venue)},${x.lat},${x.lon}`;
  if (!from) return `https://map.kakao.com/link/to/${to}`;
  return `https://map.kakao.com/link/from/${encodeURIComponent("내 위치")},${from.lat},${from.lon}/to/${to}`;
}

/** 현재 위치 한 번 가져오기 */
function getPosition(): Promise<MyLocation> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("unsupported"));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      reject,
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    );
  });
}

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

export default function ExhibitionMap({
  exhibitions,
  isSample,
  popularity,
  spaces,
}: {
  exhibitions: Exhibition[];
  isSample: boolean;
  popularity: PopularityData;
  spaces: Space[];
}) {
  const desktop = useDesktop();
  const [query, setQuery] = useState("");
  // null = 아무것도 고르지 않음 (전체와 같은 결과)
  const [status, setStatus] = useState<StatusFilter | null>(null);
  const [genres, setGenres] = useState<Set<Genre>>(new Set());
  const [freeOnly, setFreeOnly] = useState(false);
  const [futureOnly, setFutureOnly] = useState(false);
  const [showSpaces, setShowSpaces] = useState(true);
  const shownSpaces = useMemo(() => (showSpaces ? spaces : []), [showSpaces, spaces]);
  const [poi, setPoi] = useState<Set<PoiCode>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  // 시작 화면: 앱을 열 때마다 한 번 (같은 탭에서 새로고침하면 다시 안 나옴)
  const [showWelcome, setShowWelcome] = useState(true);
  useEffect(() => {
    try {
      if (sessionStorage.getItem("welcome-dismissed")) setShowWelcome(false);
    } catch {}
  }, []);
  const dismissWelcome = () => {
    setShowWelcome(false);
    try {
      sessionStorage.setItem("welcome-dismissed", "1");
    } catch {}
  };
  const listRef = useRef<HTMLElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const [sheetH, setSheetH] = useState(0);
  const swipe = useRef<{ y: number; moved: boolean } | null>(null);
  const skipClick = useRef(false);
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
      if (futureOnly && !futureKindOf(x)) return false;
      if (q && !(x.title + x.venue + x.city + x.genre).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [exhibitions, query, status, genres, freeOnly, futureOnly]);

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

  // 목록: 조건(카테고리·검색·무료 등)에 맞는 전시 전체. 반경을 고르면 그 안으로 좁힌다.
  // 내 위치를 알면 가까운 순, 모르면 마감이 가까운 순.
  const visible = useMemo(() => {
    const arr = [...filtered];
    if (myLoc) return arr.sort((a, b) => (dist.get(a.id) ?? 0) - (dist.get(b.id) ?? 0));
    return arr.sort((a, b) => +parseDate(a.endDate) - +parseDate(b.endDate));
  }, [filtered, myLoc, dist]);
  const hasFilter = !!query.trim() || (status !== null && status !== "all") || genres.size > 0 || freeOnly || futureOnly;

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

  // 목록 시트 높이를 재서 내 위치 버튼을 시트 바로 위에 둔다
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSheetH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 지도를 끌면 열린 목록을 내린다
  const onMapDrag = useCallback(() => setListOpen(false), []);

  // 목록 손잡이: 누르면 열고 닫기, 위로 밀면 열기, 아래로 밀면 닫기
  const headDown = (e: React.PointerEvent) => {
    swipe.current = { y: e.clientY, moved: false };
  };
  const headUp = (e: React.PointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const dy = e.clientY - s.y;
    if (Math.abs(dy) > 24) {
      setListOpen(dy < 0);
      skipClick.current = true;
    }
  };
  const headClick = () => {
    if (skipClick.current) {
      skipClick.current = false;
      return;
    }
    setListOpen((v) => !v);
  };

  // ----- 상세 창: 아래로 끌어서 닫기 (휴대폰) -----
  const hasSelection = selectedId !== null;
  useEffect(() => {
    const el = detailRef.current;
    if (!el || desktop || !hasSelection) return;
    let startY = 0;
    let dy = 0;
    let dragging = false;
    let armed = false;

    const onStart = (e: TouchEvent) => {
      if ((e.target as HTMLElement).closest(".lightbox, .cta")) return;
      // 창의 어느 곳이든 아래로 끌면 닫는다 (글을 읽던 중이어도)
      armed = true;
      startY = e.touches[0].clientY;
      dy = 0;
      dragging = false;
    };
    const onMove = (e: TouchEvent) => {
      if (!armed) return;
      const d = e.touches[0].clientY - startY;
      if (!dragging && d > 6) {
        dragging = true;
        el.style.transition = "none";
      }
      if (!dragging) return;
      dy = Math.max(0, d);
      e.preventDefault();
      el.style.transform = `translateY(${dy}px)`;
    };
    const onEnd = () => {
      if (!dragging) return;
      dragging = false;
      el.style.transition = "";
      if (dy > Math.min(140, el.offsetHeight * 0.22)) {
        el.style.transform = "translateY(105%)";
        setTimeout(() => {
          el.style.transform = "";
          setSelectedId(null);
        }, 240);
      } else {
        el.style.transform = "";
      }
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
      el.style.transform = "";
      el.style.transition = "";
    };
  }, [desktop, hasSelection]);

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
    onMapDrag,
    spaces: shownSpaces,
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
            <button key={k} className="chip" aria-pressed={status === k} onClick={() => setStatus((cur) => (cur === k ? null : k))}>{l}</button>
          ))}
          <span className="sep" />
          <button className="chip free" aria-pressed={freeOnly} onClick={() => setFreeOnly((v) => !v)}>무료만</button>
          <button className="chip future" aria-pressed={futureOnly} onClick={() => setFutureOnly((v) => !v)}>예술의 미래</button>
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
              {spaces.length > 0 && (
                <button className="chip space-chip" aria-pressed={showSpaces} onClick={() => setShowSpaces((v) => !v)}>
                  독립공간
                </button>
              )}
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
        className={"locate" + (myLoc ? " on" : "") + (locating ? " busy" : "")}
        style={!desktop && sheetH ? { bottom: sheetH + 14 } : undefined}
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

      {showWelcome && (
        <Welcome
          exhibitions={exhibitions}
          popularity={popularity}
          onPick={(id) => {
            dismissWelcome();
            openFromList(id);
          }}
          onNear={() => {
            dismissWelcome();
            locate();
          }}
          onBrowse={dismissWelcome}
        />
      )}

      <section ref={listRef} className={"list" + (listOpen ? " open" : "")}>
        <button
          className="list-head"
          type="button"
          aria-expanded={listOpen}
          aria-label={listOpen ? "목록 내리기" : "목록 올리기"}
          onPointerDown={headDown}
          onPointerUp={headUp}
          onPointerCancel={() => {
            swipe.current = null;
          }}
          onClick={headClick}
        >
          <span className="grab" />
          <span className="list-title">
            <h2>{inRadius && radius ? `내 위치 ${radiusLabel(radius)} 안 전시` : hasFilter ? "조건에 맞는 전시" : "전국 전시"}</h2>
            <small>
              {`${visible.length}개 · ${myLoc ? "가까운 순" : "마감 임박 순"}`}
              <span className="list-toggle">{listOpen ? "접기 ▾" : "펼치기 ▴"}</span>
            </small>
          </span>
        </button>
        <div className="items">
          {visible.length === 0 ? (
            <div className="empty">
              {inRadius && radius ? (
                <>내 위치 {radiusLabel(radius)} 안에는 조건에 맞는 전시가 없어요.<br />위쪽에서 반경을 더 넓혀 보세요.</>
              ) : (
                <>조건에 맞는 전시가 없어요.<br />카테고리나 검색어를 바꿔 보세요.</>
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
      <aside ref={detailRef} className={"detail" + (selected ? " show" : "")} aria-live="polite">
        {selected && <Detail x={selected} distance={dist.get(selected.id)} myLoc={myLoc} onLocated={setMyLoc} onClose={() => setSelectedId(null)} />}
      </aside>
    </div>
  );
}

function Detail({ x, distance, myLoc, onLocated, onClose }: {
  x: Exhibition;
  distance?: number;
  myLoc: MyLocation | null;
  onLocated: (loc: MyLocation) => void;
  onClose: () => void;
}) {
  const st = statusOf(x);
  const [finding, setFinding] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  // 다른 전시로 바뀌면 크게 보기를 닫는다
  useEffect(() => setZoomed(false), [x.id]);

  // 크게 보기 중에는 Esc가 크게 보기만 닫게 한다
  useEffect(() => {
    if (!zoomed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      setZoomed(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [zoomed]);

  // 내 위치를 모르면 누르는 순간 위치를 확인해 출발지로 넣는다.
  // 팝업 차단을 피하려고 새 창을 먼저 열고, 위치를 받은 뒤 주소를 채운다.
  const openDirections = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (myLoc) return; // 링크에 이미 출발지가 들어 있다
    e.preventDefault();
    const win = window.open("", "_blank");
    setFinding(true);
    getPosition()
      .then((loc) => {
        onLocated(loc);
        return directionsUrl(x, loc);
      })
      .catch(() => directionsUrl(x, null))
      .then((url) => {
        setFinding(false);
        if (win) win.location.href = url;
        else window.location.href = url;
      });
  };
  return (
    <>
      <div className="d-grab" aria-hidden="true"><span /></div>
      <button className="d-close" type="button" aria-label="닫기" onClick={onClose}>×</button>
      <div className="d-scroll">
        {x.thumbnail ? (
          <div className="poster has-img">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="poster-bg" src={x.thumbnail} alt="" aria-hidden="true" />
            <button type="button" className="poster-link" onClick={() => setZoomed(true)} aria-label="포스터 크게 보기">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="poster-full" src={x.thumbnail} alt={`${x.title} 포스터`} />
              <span className="poster-zoom-hint" aria-hidden="true">크게 보기</span>
            </button>
          </div>
        ) : (
          <div className="poster"><Poster key={x.id} exhibition={x} className="poster-img" /></div>
        )}
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
          {x.description ? (
            <p className="desc">{x.description}</p>
          ) : (
            <p className="desc-empty">
              이 전시는 소개글이 제공되지 않았어요.
              {x.url ? " 아래 '전시 안내 보기'에서 자세한 내용을 볼 수 있어요." : ""}
            </p>
          )}
        </div>
      </div>
      <div className="cta">
        <a className="btn ghost" href={directionsUrl(x, myLoc)} target="_blank" rel="noopener noreferrer" onClick={openDirections} aria-busy={finding}>
          {finding ? "위치 확인 중…" : "길찾기"}
        </a>
        {x.url ? (
          <a className="btn" href={x.url} target="_blank" rel="noopener noreferrer">
            {x.price ? "예매하기" : "전시 안내 보기"}
          </a>
        ) : (
          <button className="btn" disabled>{x.price === 0 ? "무료 관람 · 예매 없이 입장" : "예매 링크 준비 중"}</button>
        )}
      </div>
      {zoomed && x.thumbnail && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={`${x.title} 포스터`} onClick={() => setZoomed(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={x.thumbnail} alt={`${x.title} 포스터`} onClick={(e) => e.stopPropagation()} />
          <button type="button" className="lightbox-close" aria-label="닫기" onClick={() => setZoomed(false)} autoFocus>
            ×
          </button>
          <p className="lightbox-hint">두 손가락으로 확대할 수 있어요 · 바깥을 누르면 닫혀요</p>
        </div>
      )}
    </>
  );
}

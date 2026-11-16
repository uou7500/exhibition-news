"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Exhibition, Genre } from "@/lib/types";
import { formatDate, formatPrice, parseDate, statusOf } from "@/lib/status";
import { CITY_LABELS, DMZ_PATH, JEJU, LAND_PATH, MAP_HEIGHT, MAP_WIDTH, project } from "@/lib/korea-map";
import Poster from "./Poster";

const GENRES: Genre[] = ["회화", "미디어", "사진", "조각·설치", "공예", "디자인", "기타"];
type StatusFilter = "all" | "on" | "upcoming";
interface View { s: number; tx: number; ty: number }

const DESKTOP = 900;

export default function ExhibitionMap({ exhibitions, isSample }: { exhibitions: Exhibition[]; isSample: boolean }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ s: 1, tx: 0, ty: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [genres, setGenres] = useState<Set<Genre>>(new Set());
  const [freeOnly, setFreeOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);

  const desktop = size.w >= DESKTOP;
  const selected = exhibitions.find((x) => x.id === selectedId) ?? null;

  // ----- 크기와 첫 화면 맞춤 -----
  const fit = useCallback((w: number, h: number) => {
    const isDesk = w >= DESKTOP;
    const L = isDesk ? 400 : 0;
    const T = isDesk ? 20 : 110;
    const B = isDesk ? 20 : 200;
    const aw = w - L - 60;
    const ah = h - T - B;
    const s = Math.max(0.3, Math.min(aw / MAP_WIDTH, ah / MAP_HEIGHT));
    setView({ s, tx: L + (w - L - MAP_WIDTH * s) / 2, ty: T + (ah - MAP_HEIGHT * s) / 2 });
  }, []);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    let first = true;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setSize({ w, h });
      if (first && w > 0) {
        fit(w, h);
        first = false;
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  const zoomAt = useCallback((cx: number, cy: number, f: number) => {
    setView((v) => {
      const s = Math.max(0.5, Math.min(80, v.s * f));
      return { s, tx: cx - (cx - v.tx) * (s / v.s), ty: cy - (cy - v.ty) * (s / v.s) };
    });
  }, []);

  // ----- 드래그·핀치·휠 -----
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const pointers = new Map<number, [number, number]>();
    let pinch: { d: number; mx: number; my: number } | null = null;

    const down = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      pinch = null;
      el.classList.add("dragging");
    };
    const move = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
      const rect = el.getBoundingClientRect();
      if (pointers.size === 1) {
        const dx = e.clientX - prev[0];
        const dy = e.clientY - prev[1];
        setView((v) => ({ ...v, tx: v.tx + dx, ty: v.ty + dy }));
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        const mx = (a[0] + b[0]) / 2 - rect.left;
        const my = (a[1] + b[1]) / 2 - rect.top;
        if (pinch) {
          const p = pinch;
          setView((v) => {
            const tx = v.tx + mx - p.mx;
            const ty = v.ty + my - p.my;
            const s = Math.max(0.5, Math.min(80, v.s * (d / p.d)));
            return { s, tx: mx - (mx - tx) * (s / v.s), ty: my - (my - ty) * (s / v.s) };
          });
        }
        pinch = { d, mx, my };
      }
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      pinch = null;
      if (!pointers.size) el.classList.remove("dragging");
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.0018));
    };
    const dbl = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, 2);
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("dblclick", dbl);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("dblclick", dbl);
    };
  }, [zoomAt]);

  // ----- 필터 -----
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

  const toScreen = useCallback(
    (x: Exhibition): [number, number] => {
      const [px, py] = project(x.lat, x.lon);
      return [view.tx + px * view.s, view.ty + py * view.s];
    },
    [view],
  );

  // ----- 마커 묶기 -----
  const groups = useMemo(() => {
    const pts = filtered.map((x) => ({ x, p: toScreen(x) }));
    const radius = view.s > 14 ? 0 : 34;
    const used = new Set<number>();
    const out: { x: Exhibition; p: [number, number] }[][] = [];
    pts.forEach((a, i) => {
      if (used.has(i)) return;
      const g = [a];
      used.add(i);
      if (radius) {
        pts.forEach((b, j) => {
          if (used.has(j)) return;
          if (Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1]) < radius) {
            g.push(b);
            used.add(j);
          }
        });
      }
      out.push(g);
    });
    return out;
  }, [filtered, toScreen, view.s]);

  // ----- 화면 안 목록 -----
  const visible = useMemo(() => {
    const L = desktop ? 384 : 0;
    return filtered
      .filter((x) => {
        const [sx, sy] = toScreen(x);
        return sx > L && sx < size.w && sy > 0 && sy < size.h;
      })
      .sort((a, b) => +parseDate(a.endDate) - +parseDate(b.endDate));
  }, [filtered, toScreen, desktop, size]);

  const openDetail = (id: string, fly: boolean) => {
    const x = exhibitions.find((e) => e.id === id);
    if (!x) return;
    setSelectedId(id);
    setListOpen(false);
    if (fly) {
      const s = Math.max(viewRef.current.s, 18);
      const [px, py] = project(x.lat, x.lon);
      const cx = desktop ? (400 + (size.w - 430)) / 2 + 15 : size.w / 2;
      const cy = desktop ? size.h / 2 : size.h * 0.22;
      setView({ s, tx: cx - px * s, ty: cy - py * s });
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSelectedId(null);
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  const center = (): [number, number] => (desktop ? [(size.w + 400) / 2, size.h / 2] : [size.w / 2, size.h * 0.42]);

  const toggleGenre = (g: Genre) =>
    setGenres((prev) => {
      const n = new Set(prev);
      if (n.has(g)) n.delete(g);
      else n.add(g);
      return n;
    });

  return (
    <div className="app">
      <svg ref={svgRef} className="map" aria-label="대한민국 전시 지도">
        <rect x="-5000" y="-5000" width="10000" height="10000" fill="var(--sea)" />
        <g transform={`translate(${view.tx},${view.ty}) scale(${view.s})`}>
          <path d={LAND_PATH} fill="var(--land)" stroke="var(--coast)" strokeWidth={1.2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          <ellipse {...JEJU} fill="var(--land)" stroke="var(--coast)" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
          <path d={DMZ_PATH} fill="none" stroke="var(--coast)" strokeWidth={1.2} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        </g>
      </svg>

      <div className="overlay">
        {view.s < 6 &&
          CITY_LABELS.map(([name, lat, lon, dy]) => {
            const [px, py] = project(lat, lon);
            return (
              <div key={name} className="city" style={{ left: view.tx + px * view.s, top: view.ty + py * view.s + dy }}>
                {name}
              </div>
            );
          })}
        {groups.map((g) => {
          if (g.length === 1) {
            const { x, p } = g[0];
            const st = statusOf(x).kind;
            const cls = ["mk", x.price === 0 ? "free" : "", st === "upcoming" ? "soon" : "", x.id === selectedId ? "sel" : ""].join(" ");
            return (
              <button key={x.id} className={cls} style={{ left: p[0], top: p[1] }} aria-label={`${x.title}, ${x.venue}`} onClick={() => openDetail(x.id, false)}>
                <span className="pin"><i /></span>
                {(view.s > 5 || x.id === selectedId) && <span className="lab">{x.title}</span>}
              </button>
            );
          }
          const cx = g.reduce((s, a) => s + a.p[0], 0) / g.length;
          const cy = g.reduce((s, a) => s + a.p[1], 0) / g.length;
          const sz = 30 + Math.min(18, g.length * 3);
          return (
            <button key={g.map((a) => a.x.id).join("|")} className="cl" style={{ left: cx, top: cy, width: sz, height: sz }} aria-label={`전시 ${g.length}개, 확대해서 보기`} onClick={() => zoomAt(cx, cy, 2.6)}>
              {g.length}
            </button>
          );
        })}
      </div>

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
            <button key={g} className="chip" aria-pressed={genres.has(g)} onClick={() => toggleGenre(g)}>{g}</button>
          ))}
        </div>
      </div>

      <div className={"zoom" + (selected && desktop ? " shifted" : "")}>
        <button type="button" aria-label="확대" onClick={() => zoomAt(...center(), 1.8)}>+</button>
        <button type="button" aria-label="축소" onClick={() => zoomAt(...center(), 1 / 1.8)}>−</button>
        <button type="button" className="home" aria-label="전국 보기" onClick={() => fit(size.w, size.h)}>전국</button>
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
                <button key={x.id} className={"item" + (x.id === selectedId ? " sel" : "")} onClick={() => openDetail(x.id, true)}>
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

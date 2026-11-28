"use client";

// 카카오 키가 없을 때 쓰는 임시 지도 (해안선 윤곽만 있음).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Exhibition } from "@/lib/types";
import { statusOf } from "@/lib/status";
import { futureKindOf } from "@/lib/future";
import { CITY_LABELS, DMZ_PATH, JEJU, LAND_PATH, MAP_HEIGHT, MAP_WIDTH, project } from "@/lib/korea-map";
import type { MapViewProps } from "./types";

interface View { s: number; tx: number; ty: number }

export default function SvgMapView({ items, selectedId, onSelect, onVisibleChange, focus, desktop, detailOpen, myLoc, radius, locateSeq, onMapDrag, route }: MapViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ s: 1, tx: 0, ty: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const dragRef = useRef(onMapDrag);
  dragRef.current = onMapDrag;

  const fit = useCallback((w: number, h: number) => {
    const isDesk = w >= 900;
    const L = isDesk ? 400 : 0;
    const T = isDesk ? 20 : 110;
    const B = isDesk ? 20 : 200;
    const ah = h - T - B;
    const s = Math.max(0.3, Math.min((w - L - 60) / MAP_WIDTH, ah / MAP_HEIGHT));
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

  // 드래그·핀치·휠
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
      dragRef.current();
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

  const toScreen = useCallback(
    (x: Exhibition): [number, number] => {
      const [px, py] = project(x.lat, x.lon);
      return [view.tx + px * view.s, view.ty + py * view.s];
    },
    [view],
  );

  // 화면 안 전시 알려주기
  useEffect(() => {
    const L = desktop ? 384 : 0;
    const ids = new Set<string>();
    for (const x of items) {
      const [sx, sy] = toScreen(x);
      if (sx > L && sx < size.w && sy > 0 && sy < size.h) ids.add(x.id);
    }
    onVisibleChange(ids);
  }, [items, toScreen, size, desktop, onVisibleChange]);

  // 목록에서 고른 전시로 이동
  useEffect(() => {
    if (!focus) return;
    const x = items.find((e) => e.id === focus.id);
    if (!x) return;
    const { w, h } = sizeRef.current;
    const s = Math.max(viewRef.current.s, 18);
    const [px, py] = project(x.lat, x.lon);
    const cx = desktop ? (400 + (w - 430)) / 2 + 15 : w / 2;
    const cy = desktop ? h / 2 : h * 0.22;
    setView({ s, tx: cx - px * s, ty: cy - py * s });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.seq]);

  // 내 위치·반경으로 지도 맞추기
  useEffect(() => {
    if (!myLoc) return;
    const { w, h } = sizeRef.current;
    const [px, py] = project(myLoc.lat, myLoc.lon);
    const L = desktop ? 400 : 0;
    const T = desktop ? 40 : 170;
    const B = desktop ? 40 : 210;
    const cx = L + (w - L) / 2;
    const cy = T + (h - T - B) / 2;
    let s = 40;
    if (radius) {
      const rUnits = (radius / 111_320) * 125;
      s = Math.max(0.5, Math.min(400, Math.min(w - L - 48, h - T - B) / (2 * rUnits)));
    }
    setView({ s, tx: cx - px * s, ty: cy - py * s });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locateSeq, radius]);

  // 전시 도우미 동선에 지도 맞추기
  useEffect(() => {
    if (!route || route.stops.length < 2) return;
    const { w, h } = sizeRef.current;
    const pts = route.stops.map((x) => project(x.lat, x.lon));
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const L = desktop ? 420 : 40;
    const R = desktop ? 440 : 40;
    const T = desktop ? 80 : 190;
    const B = desktop ? 60 : 290;
    const bw = Math.max(0.02, Math.max(...xs) - Math.min(...xs));
    const bh = Math.max(0.02, Math.max(...ys) - Math.min(...ys));
    const s = Math.max(0.5, Math.min(400, (w - L - R) / bw, (h - T - B) / bh));
    const cx = L + (w - L - R) / 2;
    const cy = T + (h - T - B) / 2;
    const mx = (Math.max(...xs) + Math.min(...xs)) / 2;
    const my = (Math.max(...ys) + Math.min(...ys)) / 2;
    setView({ s, tx: cx - mx * s, ty: cy - my * s });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.seq]);

  // 동선을 그리는 동안: 동선 전시는 크게, 나머지는 작고 흐리게
  const routeOrder = useMemo(() => (route && route.stops.length > 1 ? route.stops.map((x) => x.id) : []), [route]);
  const onRoute = useMemo(() => new Set(routeOrder), [routeOrder]);

  const groups = useMemo(() => {
    const pts = items.map((x) => ({ x, p: toScreen(x) }));
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
  }, [items, toScreen, view.s]);

  const center = (): [number, number] => (desktop ? [(size.w + 400) / 2, size.h / 2] : [size.w / 2, size.h * 0.42]);

  return (
    <>
      <svg ref={svgRef} className="map" aria-label="대한민국 전시 지도">
        <rect x="-5000" y="-5000" width="10000" height="10000" fill="var(--sea)" />
        <g transform={`translate(${view.tx},${view.ty}) scale(${view.s})`}>
          <path d={LAND_PATH} fill="var(--land)" stroke="var(--coast)" strokeWidth={1.2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          <ellipse {...JEJU} fill="var(--land)" stroke="var(--coast)" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
          <path d={DMZ_PATH} fill="none" stroke="var(--coast)" strokeWidth={1.2} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          {route && route.stops.length > 1 && (
            <polyline
              points={route.stops.map((x) => project(x.lat, x.lon).join(",")).join(" ")}
              fill="none"
              stroke="#7b2ff7"
              strokeWidth={4}
              strokeDasharray="6 6"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {myLoc && radius && (() => {
            const [mx, my] = project(myLoc.lat, myLoc.lon);
            return <circle cx={mx} cy={my} r={(radius / 111_320) * 125} fill="var(--accent)" fillOpacity={0.07} stroke="var(--accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" />;
          })()}
        </g>
      </svg>

      <div className="overlay">
        {myLoc && (() => {
          const [mx, my] = project(myLoc.lat, myLoc.lon);
          return <div className="me-dot svg" style={{ left: view.tx + mx * view.s, top: view.ty + my * view.s }} aria-label="내 위치" />;
        })()}
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
            const cls = ["mk", x.price === 0 ? "free" : "", st === "upcoming" ? "soon" : "", x.id === selectedId ? "sel" : "", onRoute.has(x.id) ? "on-route" : onRoute.size ? "dim" : ""].join(" ");
            return (
              <button key={x.id} className={cls} style={{ left: p[0], top: p[1] }} aria-label={`${x.title}, ${x.venue}`} onClick={() => onSelect(x.id)}>
                <span className="pin"><i>{onRoute.has(x.id) ? routeOrder.indexOf(x.id) + 1 : null}</i></span>
                {(onRoute.size ? onRoute.has(x.id) : view.s > 5 || x.id === selectedId) && <span className="lab">{x.title}</span>}
                {futureKindOf(x) && <span className="mk-star" aria-hidden="true" />}
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

      {route && route.stops.length > 1 && (
        <div className="overlay">
          {route.stops.map((x, i) => {
            // 핀이 보이는 전시는 핀 안에 번호가 있다 → 핀이 없는 전시만 번호를 따로 띄운다
            if (items.some((it) => it.id === x.id)) return null;
            const [px, py] = project(x.lat, x.lon);
            const same = route.stops.slice(0, i).filter((p) => Math.abs(p.lat - x.lat) < 1e-4 && Math.abs(p.lon - x.lon) < 1e-4).length;
            return (
              <button
                key={x.id}
                type="button"
                className="route-num svg"
                style={{ left: view.tx + px * view.s + same * 28, top: view.ty + py * view.s - 44 }}
                aria-label={`${i + 1}번째: ${x.title}`}
                onClick={() => onSelect(x.id)}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
      )}

      <div className={"zoom" + (detailOpen && desktop ? " shifted" : "")}>
        <button type="button" aria-label="확대" onClick={() => zoomAt(...center(), 1.8)}>+</button>
        <button type="button" aria-label="축소" onClick={() => zoomAt(...center(), 1 / 1.8)}>−</button>
        <button type="button" className="home" aria-label="전국 보기" onClick={() => fit(size.w, size.h)}>전국</button>
      </div>
    </>
  );
}

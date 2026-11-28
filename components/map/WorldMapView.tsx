"use client";

// 해외(지금은 미국 서부) 전시 지도. 카카오맵은 한국 밖 지도가 거의 그려지지 않아 따로 쓴다.
// Leaflet(지도 라이브러리)을 unpkg에서 불러오고, 바탕 지도는 OpenStreetMap(무료, 출처 표시 필수).
// 주변 장소·독립공간·동선은 국내 지도에만 있다.

import { useEffect, useRef, useState } from "react";
import type { Exhibition } from "@/lib/types";
import { statusOf } from "@/lib/status";
import type { MapViewProps } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window { L?: any }
}

const LEAFLET_VER = "1.9.4";
/** 미국 서부 전체가 보이는 범위 (남서쪽, 북동쪽) */
const US_WEST: [[number, number], [number, number]] = [[32.4, -124.8], [48.2, -116.5]];
const DETAIL_ZOOM = 15;
const LABEL_ZOOM = 11;

let leafletPromise: Promise<any> | null = null;
function loadLeaflet(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.L?.map) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = `https://unpkg.com/leaflet@${LEAFLET_VER}/dist/leaflet.css`;
    document.head.appendChild(css);
    const s = document.createElement("script");
    s.src = `https://unpkg.com/leaflet@${LEAFLET_VER}/dist/leaflet.js`;
    s.async = true;
    s.onload = () => (window.L?.map ? resolve(window.L) : reject(new Error("세계 지도를 불러오지 못했어요.")));
    s.onerror = () => {
      leafletPromise = null;
      reject(new Error("세계 지도를 불러오지 못했어요."));
    };
    document.head.appendChild(s);
  });
  return leafletPromise;
}

function pinElement(x: Exhibition): HTMLButtonElement {
  const st = statusOf(x).kind;
  const el = document.createElement("button");
  el.type = "button";
  el.className = ["mk", "k", x.price === 0 ? "free" : "", st === "upcoming" ? "soon" : ""].join(" ").trim();
  el.setAttribute("aria-label", `${x.title}, ${x.venue}`);
  const pin = document.createElement("span");
  pin.className = "pin";
  pin.appendChild(document.createElement("i"));
  const lab = document.createElement("span");
  lab.className = "lab";
  lab.textContent = x.title;
  el.append(pin, lab);
  return el;
}

export default function WorldMapView({ items, selectedId, onSelect, onVisibleChange, focus, desktop, detailOpen, myLoc, radius, locateSeq, onMapDrag }: MapViewProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const pinsRef = useRef(new Map<string, { marker: any; el: HTMLButtonElement }>());
  const meRef = useRef<{ dot: any; circle: any } | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(5);

  const latest = useRef({ items, onSelect, onVisibleChange, desktop, onMapDrag });
  latest.current = { items, onSelect, onVisibleChange, desktop, onMapDrag };

  function reportVisible() {
    const map = mapRef.current;
    if (!map) return;
    const b = map.getBounds();
    const ids = new Set<string>();
    for (const x of latest.current.items) if (b.contains([x.lat, x.lon])) ids.add(x.id);
    latest.current.onVisibleChange(ids);
  }

  // ----- 지도 만들기 -----
  useEffect(() => {
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !boxRef.current || mapRef.current) return;
        const map = L.map(boxRef.current, { zoomControl: false, attributionControl: true, worldCopyJump: true });
        map.attributionControl.setPrefix(false);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
        }).addTo(map);
        map.fitBounds(US_WEST);
        layerRef.current = L.layerGroup().addTo(map);
        map.on("dragstart", () => latest.current.onMapDrag());
        map.on("moveend zoomend", () => {
          setZoom(map.getZoom());
          reportVisible();
        });
        mapRef.current = map;
        setZoom(map.getZoom());
        setReady(true);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      meRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 화면 크기가 바뀌면 지도 다시 맞추기
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => mapRef.current?.invalidateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ----- 전시 핀 -----
  useEffect(() => {
    if (!ready) return;
    const L = window.L;
    const layer = layerRef.current;
    const pins = pinsRef.current;
    layer.clearLayers();
    pins.clear();
    for (const x of items) {
      const el = pinElement(x);
      const icon = L.divIcon({ html: el, className: "wmk", iconSize: [0, 0], iconAnchor: [0, 0] });
      const marker = L.marker([x.lat, x.lon], { icon, keyboard: false, title: x.title, riseOnHover: true });
      marker.on("click", () => latest.current.onSelect(x.id));
      marker.addTo(layer);
      pins.set(x.id, { marker, el });
    }
    reportVisible();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, items]);

  // 선택한 핀 강조
  useEffect(() => {
    pinsRef.current.forEach(({ marker, el }, id) => {
      const on = id === selectedId;
      el.classList.toggle("sel", on);
      marker.setZIndexOffset(on ? 1000 : 0);
    });
  }, [selectedId, items, ready]);

  // 확대하면 핀 이름표 보이기
  useEffect(() => {
    boxRef.current?.classList.toggle("show-labels", zoom >= LABEL_ZOOM);
  }, [zoom]);

  // ----- 목록에서 고른 전시로 이동 -----
  useEffect(() => {
    if (!ready || !focus) return;
    const x = latest.current.items.find((e) => e.id === focus.id);
    const map = mapRef.current;
    if (!x || !map) return;
    const z = Math.max(map.getZoom(), DETAIL_ZOOM);
    if (latest.current.desktop) {
      map.setView([x.lat, x.lon], z);
      return;
    }
    // 휴대폰은 아래쪽 상세 시트에 가리지 않게 핀을 화면 위쪽에 둔다
    const h = boxRef.current?.clientHeight ?? 0;
    const p = map.project([x.lat, x.lon], z).add([0, h * 0.28]);
    map.setView(map.unproject(p, z), z);
  }, [ready, focus?.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  // ----- 내 위치 표시와 반경 원 -----
  useEffect(() => {
    if (!ready) return;
    const L = window.L;
    const map = mapRef.current;
    if (meRef.current) {
      meRef.current.dot.remove();
      meRef.current.circle?.remove();
      meRef.current = null;
    }
    if (!myLoc) return;
    const el = document.createElement("div");
    el.className = "me-dot";
    el.setAttribute("aria-label", "내 위치");
    const dot = L.marker([myLoc.lat, myLoc.lon], {
      icon: L.divIcon({ html: el, className: "wmk", iconSize: [0, 0], iconAnchor: [0, 0] }),
      interactive: false,
      zIndexOffset: 2000,
    }).addTo(map);
    const circle = radius
      ? L.circle([myLoc.lat, myLoc.lon], { radius, color: "#0071e3", weight: 2, opacity: 0.85, fillColor: "#0071e3", fillOpacity: 0.07, interactive: false }).addTo(map)
      : null;
    meRef.current = { dot, circle };
  }, [ready, myLoc, radius]);

  // 내 위치 버튼을 누르면 내 위치(반경)로 맞춘다
  useEffect(() => {
    if (!ready || !locateSeq || !myLoc) return;
    const map = mapRef.current;
    if (meRef.current?.circle) map.fitBounds(meRef.current.circle.getBounds(), { padding: [24, 24] });
    else map.setView([myLoc.lat, myLoc.lon], 13);
  }, [ready, locateSeq]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoomBy = (d: number) => mapRef.current?.setZoom(mapRef.current.getZoom() + d);
  const home = () => mapRef.current?.fitBounds(US_WEST);

  return (
    <>
      <div ref={boxRef} className="kmap wmap" aria-label="미국 서부 전시 지도" />
      {error && <div className="map-msg">{error} 잠시 후 새로고침해 주세요.</div>}
      <div className={"zoom" + (detailOpen && desktop ? " shifted" : "")}>
        <button type="button" aria-label="확대" onClick={() => zoomBy(1)}>+</button>
        <button type="button" aria-label="축소" onClick={() => zoomBy(-1)}>−</button>
        <button type="button" className="home" aria-label="미국 서부 전체 보기" onClick={home}>전체</button>
      </div>
    </>
  );
}

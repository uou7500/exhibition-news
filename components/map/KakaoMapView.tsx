"use client";

// 카카오맵 지도. NEXT_PUBLIC_KAKAO_MAP_KEY(카카오 JavaScript 키)가 있을 때만 쓰인다.
// SDK 문서: https://apis.map.kakao.com/web/documentation/

import { useEffect, useRef, useState } from "react";
import type { Exhibition } from "@/lib/types";
import { statusOf } from "@/lib/status";
import { POI_LABELS, type MapViewProps, type PoiCode } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window { kakao?: any }
}

const KOREA_CENTER = { lat: 36.35, lon: 127.85 };
const KOREA_LEVEL = 13;
const DETAIL_LEVEL = 4; // 이 정도로 확대하면 골목 도로와 상점 이름이 보인다
const POI_MAX_LEVEL = 4; // 주변 장소는 이 레벨 이하(더 확대)에서만 찾는다

let sdkPromise: Promise<any> | null = null;
function loadKakao(appKey: string): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.kakao?.maps?.LatLng) return Promise.resolve(window.kakao);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&autoload=false&libraries=services,clusterer`;
    s.async = true;
    s.onload = () => {
      if (!window.kakao?.maps) return reject(new Error("카카오맵 SDK를 불러오지 못했어요."));
      window.kakao.maps.load(() => resolve(window.kakao));
    };
    s.onerror = () => {
      sdkPromise = null;
      reject(new Error("카카오맵 SDK를 불러오지 못했어요."));
    };
    document.head.appendChild(s);
  });
  return sdkPromise;
}

function pinElement(x: Exhibition, onClick: () => void): HTMLButtonElement {
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
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return el;
}

export default function KakaoMapView({ appKey, items, selectedId, onSelect, onVisibleChange, focus, desktop, detailOpen, poi }: MapViewProps & { appKey: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const clustererRef = useRef<any>(null);
  const pinsRef = useRef(new Map<string, { overlay: any; el: HTMLButtonElement }>());
  const poiOverlaysRef = useRef<any[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(KOREA_LEVEL);

  // 최신 콜백·값을 이벤트 핸들러에서 쓰기 위한 ref
  const latest = useRef({ items, onSelect, onVisibleChange, desktop, poi });
  latest.current = { items, onSelect, onVisibleChange, desktop, poi };

  // ----- 지도 만들기 -----
  useEffect(() => {
    let cancelled = false;
    loadKakao(appKey)
      .then((kakao) => {
        if (cancelled || !boxRef.current) return;
        const map = new kakao.maps.Map(boxRef.current, {
          center: new kakao.maps.LatLng(KOREA_CENTER.lat, KOREA_CENTER.lon),
          level: KOREA_LEVEL,
        });
        mapRef.current = map;
        clustererRef.current = new kakao.maps.MarkerClusterer({
          map,
          averageCenter: true,
          minLevel: 7,
          gridSize: 56,
          minClusterSize: 2,
          styles: [
            {
              width: "40px", height: "40px", lineHeight: "34px", borderRadius: "50%",
              background: "#1d2430", color: "#fff", border: "3px solid #fff",
              textAlign: "center", fontWeight: "600", fontSize: "14px",
              boxShadow: "0 2px 8px rgba(0,0,0,.3)",
            },
          ],
        });
        kakao.maps.event.addListener(map, "idle", () => {
          setLevel(map.getLevel());
          reportVisible();
        });
        setReady(true);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appKey]);

  // 화면 크기가 바뀌면 지도 다시 맞추기
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => mapRef.current?.relayout());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  function reportVisible() {
    const map = mapRef.current;
    if (!map) return;
    const bounds = map.getBounds();
    const kakao = window.kakao;
    const ids = new Set<string>();
    for (const x of latest.current.items) {
      if (bounds.contain(new kakao.maps.LatLng(x.lat, x.lon))) ids.add(x.id);
    }
    latest.current.onVisibleChange(ids);
  }

  // ----- 전시 핀 -----
  useEffect(() => {
    if (!ready) return;
    const kakao = window.kakao;
    const clusterer = clustererRef.current;
    const pins = pinsRef.current;
    clusterer.clear();
    pins.clear();
    const overlays = items.map((x) => {
      const el = pinElement(x, () => latest.current.onSelect(x.id));
      const overlay = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(x.lat, x.lon),
        content: el,
        xAnchor: 0.5,
        yAnchor: 1,
        clickable: true,
        zIndex: 3,
      });
      pins.set(x.id, { overlay, el });
      return overlay;
    });
    clusterer.addMarkers(overlays);
    reportVisible();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, items]);

  // 선택한 핀 강조
  useEffect(() => {
    pinsRef.current.forEach(({ overlay, el }, id) => {
      const on = id === selectedId;
      el.classList.toggle("sel", on);
      overlay.setZIndex(on ? 10 : 3);
    });
  }, [selectedId, items, ready]);

  // 확대 정도에 따라 핀 이름표 보이기
  useEffect(() => {
    boxRef.current?.classList.toggle("show-labels", level <= 6);
  }, [level]);

  // ----- 목록에서 고른 전시로 이동 -----
  useEffect(() => {
    if (!ready || !focus) return;
    const x = latest.current.items.find((e) => e.id === focus.id);
    const map = mapRef.current;
    if (!x || !map) return;
    const kakao = window.kakao;
    const target = new kakao.maps.LatLng(x.lat, x.lon);
    if (map.getLevel() > DETAIL_LEVEL) map.setLevel(DETAIL_LEVEL);
    map.setCenter(target);
    // 모바일은 아래쪽 상세 시트에 가리지 않게 핀을 화면 위쪽에 둔다
    if (!latest.current.desktop) {
      const proj = map.getProjection();
      const p = proj.pointFromCoords(target);
      const h = boxRef.current?.clientHeight ?? 0;
      map.setCenter(proj.coordsFromPoint(new kakao.maps.Point(p.x, p.y + h * 0.28)));
    }
  }, [ready, focus?.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  // ----- 주변 장소 (편의점·카페·지하철역) -----
  useEffect(() => {
    if (!ready) return;
    const kakao = window.kakao;
    const map = mapRef.current;
    const places = new kakao.maps.services.Places(map);
    let stamp = 0;

    const clear = () => {
      poiOverlaysRef.current.forEach((o) => o.setMap(null));
      poiOverlaysRef.current = [];
    };

    const search = () => {
      const codes = [...latest.current.poi];
      const my = ++stamp;
      clear();
      if (!codes.length || map.getLevel() > POI_MAX_LEVEL) return;
      for (const code of codes) {
        places.categorySearch(
          code,
          (data: any[], status: string) => {
            if (my !== stamp || status !== kakao.maps.services.Status.OK) return;
            for (const p of data) {
              const el = document.createElement("a");
              el.className = `poi poi-${code}`;
              el.href = p.place_url;
              el.target = "_blank";
              el.rel = "noopener noreferrer";
              el.title = `${p.place_name} (${POI_LABELS[code as PoiCode]})`;
              const dot = document.createElement("span");
              dot.className = "poi-dot";
              dot.textContent = code === "CS2" ? "편" : code === "CE7" ? "카" : "역";
              const name = document.createElement("span");
              name.className = "poi-name";
              name.textContent = p.place_name;
              el.append(dot, name);
              const o = new kakao.maps.CustomOverlay({
                position: new kakao.maps.LatLng(Number(p.y), Number(p.x)),
                content: el,
                xAnchor: 0.5,
                yAnchor: 0.5,
                clickable: true,
                zIndex: 1,
              });
              o.setMap(map);
              poiOverlaysRef.current.push(o);
            }
          },
          { useMapBounds: true },
        );
      }
    };

    search();
    kakao.maps.event.addListener(map, "idle", search);
    return () => {
      kakao.maps.event.removeListener(map, "idle", search);
      clear();
    };
  }, [ready, poi]);

  // ----- 확대·축소 버튼 -----
  const zoomBy = (d: number) => {
    const map = mapRef.current;
    if (map) map.setLevel(Math.max(1, Math.min(14, map.getLevel() + d)), { animate: true });
  };
  const home = () => {
    const map = mapRef.current;
    if (!map) return;
    map.setLevel(KOREA_LEVEL);
    map.setCenter(new window.kakao.maps.LatLng(KOREA_CENTER.lat, KOREA_CENTER.lon));
  };

  return (
    <>
      <div ref={boxRef} className="kmap" aria-label="전시 지도" />
      {error && <div className="map-msg">{error} 잠시 후 새로고침해 주세요.</div>}
      {ready && poi.size > 0 && level > POI_MAX_LEVEL && (
        <div className="map-hint">더 확대하면 {[...poi].map((c) => POI_LABELS[c]).join(" · ")} 위치가 보여요</div>
      )}
      <div className={"zoom" + (detailOpen && desktop ? " shifted" : "")}>
        <button type="button" aria-label="확대" onClick={() => zoomBy(-1)}>+</button>
        <button type="button" aria-label="축소" onClick={() => zoomBy(1)}>−</button>
        <button type="button" className="home" aria-label="전국 보기" onClick={home}>전국</button>
      </div>
    </>
  );
}

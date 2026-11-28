"use client";

// 카카오맵 지도. NEXT_PUBLIC_KAKAO_MAP_KEY(카카오 JavaScript 키)가 있을 때만 쓰인다.
// SDK 문서: https://apis.map.kakao.com/web/documentation/

import { useEffect, useRef, useState } from "react";
import type { Exhibition } from "@/lib/types";
import { statusOf } from "@/lib/status";
import { futureKindOf } from "@/lib/future";
import { radiusBounds } from "@/lib/geo";
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

/** '예술의 미래' 전시 핀 위 작은 주황 별 */
function starElement(): HTMLSpanElement {
  const s = document.createElement("span");
  s.className = "mk-star";
  s.setAttribute("aria-hidden", "true");
  s.textContent = "★";
  return s;
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
  if (futureKindOf(x)) el.append(starElement());
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return el;
}

export default function KakaoMapView({ appKey, items, selectedId, onSelect, onVisibleChange, focus, desktop, detailOpen, poi, myLoc, radius, locateSeq, onMapDrag, spaces, route, popularIds }: MapViewProps & { appKey: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const clustererRef = useRef<any>(null);
  const pinsRef = useRef(new Map<string, { overlay: any; el: HTMLButtonElement }>());
  const poiOverlaysRef = useRef<any[]>([]);
  const meRef = useRef<{ dot: any; circle: any } | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(KOREA_LEVEL);

  // 최신 콜백·값을 이벤트 핸들러에서 쓰기 위한 ref
  const latest = useRef({ items, onSelect, onVisibleChange, desktop, poi, onMapDrag });
  latest.current = { items, onSelect, onVisibleChange, desktop, poi, onMapDrag };

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
        kakao.maps.event.addListener(map, "dragstart", () => latest.current.onMapDrag());
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
    // 직접 넣은 전시는 주소로 다시 찾은 좌표를 이 기기에 저장해 둔다 → 저장된 좌표가 있으면 처음부터 그 자리에 만든다
    const cachedPos = (x: Exhibition): [number, number] | null => {
      if (x.source !== "manual" || !x.address) return null;
      try {
        const hit = localStorage.getItem(`addr-geo:${x.address}`);
        if (!hit) return null;
        const [lat, lon] = hit.split(",").map(Number);
        return lat && lon ? [lat, lon] : null;
      } catch {
        return null;
      }
    };
    const overlays = items.map((x) => {
      const el = pinElement(x, () => latest.current.onSelect(x.id));
      const pos = cachedPos(x) ?? [x.lat, x.lon];
      const overlay = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(pos[0], pos[1]),
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

    // 직접 넣은 전시는 좌표가 캠퍼스 단위 근사값일 수 있어, 주소로 정확한 위치를 다시 찾는다 (저장된 좌표가 없는 것만).
    // 핀을 옮길 때마다 묶음을 다시 계산하면 앱이 멈추므로, 묶음 다시 계산은 잠깐 모았다가 한 번만 한다.
    const geocoder = new kakao.maps.services.Geocoder();
    let redrawTimer: ReturnType<typeof setTimeout> | null = null;
    const redrawSoon = () => {
      if (redrawTimer) return;
      redrawTimer = setTimeout(() => {
        redrawTimer = null;
        clusterer.redraw();
      }, 250);
    };
    for (const x of items) {
      if (x.source !== "manual" || !x.address || cachedPos(x)) continue;
      const pin = pins.get(x.id);
      if (!pin) continue;
      const key = `addr-geo:${x.address}`;
      const move = (lat: number, lon: number) => {
        pin.overlay.setPosition(new kakao.maps.LatLng(lat, lon));
        redrawSoon();
      };
      geocoder.addressSearch(x.address, (res: any[], status: string) => {
        if (status !== kakao.maps.services.Status.OK || !res[0]) return;
        const lat = Number(res[0].y);
        const lon = Number(res[0].x);
        try {
          localStorage.setItem(key, `${lat},${lon}`);
        } catch {}
        move(lat, lon);
      });
    }
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

  // '대중을 위한' 상위 10개: 이름표 노란 테두리
  useEffect(() => {
    pinsRef.current.forEach(({ el }, id) => el.classList.toggle("pop", !!popularIds?.has(id)));
  }, [popularIds, items, ready]);

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

  // ----- 내 위치 표시와 반경 원 -----
  useEffect(() => {
    if (!ready) return;
    const kakao = window.kakao;
    const map = mapRef.current;
    if (!meRef.current) {
      const el = document.createElement("div");
      el.className = "me-dot";
      el.setAttribute("aria-label", "내 위치");
      meRef.current = {
        dot: new kakao.maps.CustomOverlay({ content: el, xAnchor: 0.5, yAnchor: 0.5, zIndex: 20 }),
        circle: new kakao.maps.Circle({
          center: new kakao.maps.LatLng(KOREA_CENTER.lat, KOREA_CENTER.lon),
          radius: 1000,
          strokeWeight: 2, strokeColor: "#0071e3", strokeOpacity: 0.85, strokeStyle: "solid",
          fillColor: "#0071e3", fillOpacity: 0.07,
        }),
      };
    }
    const { dot, circle } = meRef.current;
    if (!myLoc) {
      dot.setMap(null);
      circle.setMap(null);
      return;
    }
    const center = new kakao.maps.LatLng(myLoc.lat, myLoc.lon);
    dot.setPosition(center);
    dot.setMap(map);
    if (radius) {
      circle.setPosition(center);
      circle.setRadius(radius);
      circle.setMap(map);
    } else {
      circle.setMap(null);
    }
  }, [ready, myLoc, radius]);

  // 내 위치 버튼이나 반경을 바꾸면 지도를 그 범위에 맞춘다
  useEffect(() => {
    if (!ready || !myLoc) return;
    const kakao = window.kakao;
    const map = mapRef.current;
    const isDesk = latest.current.desktop;
    if (radius) {
      const b = radiusBounds(myLoc.lat, myLoc.lon, radius);
      const bounds = new kakao.maps.LatLngBounds(new kakao.maps.LatLng(b.south, b.west), new kakao.maps.LatLng(b.north, b.east));
      // 위: 검색·필터 영역, 아래: 목록 시트(모바일), 왼쪽: 목록 패널(데스크톱)
      map.setBounds(bounds, isDesk ? 40 : 170, 40, isDesk ? 40 : 210, isDesk ? 420 : 24);
    } else {
      map.setLevel(5);
      map.setCenter(new kakao.maps.LatLng(myLoc.lat, myLoc.lon));
    }
  }, [ready, locateSeq, radius]); // eslint-disable-line react-hooks/exhaustive-deps

  // ----- 독립공간 핀 -----
  useEffect(() => {
    if (!ready) return;
    const kakao = window.kakao;
    const map = mapRef.current;
    const places = new kakao.maps.services.Places();
    const overlays: any[] = [];
    let alive = true;

    const place = (s: (typeof spaces)[number], lat: number, lon: number) => {
      if (!alive) return;
      const el = document.createElement("a");
      el.className = "space-pin";
      el.href = s.instagram || s.url || "#";
      el.target = "_blank";
      el.rel = "noopener noreferrer";
      el.title = s.note ? `${s.name} — ${s.note}` : s.name;
      const mark = document.createElement("span");
      mark.className = "space-mark";
      const name = document.createElement("span");
      name.className = "space-name";
      name.textContent = s.name;
      el.append(mark, name);
      const o = new kakao.maps.CustomOverlay({ position: new kakao.maps.LatLng(lat, lon), content: el, xAnchor: 0.5, yAnchor: 0.5, clickable: true, zIndex: 2 });
      o.setMap(map);
      overlays.push(o);
    };

    for (const s of spaces) {
      if (s.lat && s.lon) {
        place(s, s.lat, s.lon);
        continue;
      }
      const key = `space-geo:${s.id}:${s.search ?? s.name}`;
      try {
        const hit = localStorage.getItem(key);
        if (hit) {
          const [lat, lon] = hit.split(",").map(Number);
          if (lat && lon) {
            place(s, lat, lon);
            continue;
          }
        }
      } catch {}
      places.keywordSearch(s.search ?? s.name, (data: any[], status: string) => {
        if (status !== kakao.maps.services.Status.OK) return;
        // 엉뚱한 곳을 찍지 않도록, 동네 글자(area)가 주소에 있는 결과만 쓴다
        const d = data.find((p) => !s.area || `${p.address_name} ${p.road_address_name}`.includes(s.area!));
        if (!d) return;
        const lat = Number(d.y);
        const lon = Number(d.x);
        try {
          localStorage.setItem(key, `${lat},${lon}`);
        } catch {}
        place(s, lat, lon);
      });
    }
    return () => {
      alive = false;
      overlays.forEach((o) => o.setMap(null));
    };
  }, [ready, spaces]);

  // ----- 전시 도우미 동선: 번호 + 점선 -----
  useEffect(() => {
    if (!ready || !route || route.stops.length < 2) return;
    const kakao = window.kakao;
    const map = mapRef.current;
    // 직접 넣은 전시는 핀과 같은 자리(주소로 다시 찾은 좌표)를 쓴다
    const pos = route.stops.map((x) => {
      if (x.source === "manual" && x.address) {
        try {
          const hit = localStorage.getItem(`addr-geo:${x.address}`);
          if (hit) {
            const [lat, lon] = hit.split(",").map(Number);
            if (lat && lon) return new kakao.maps.LatLng(lat, lon);
          }
        } catch {}
      }
      return new kakao.maps.LatLng(x.lat, x.lon);
    });
    const line = new kakao.maps.Polyline({
      path: pos,
      strokeWeight: 4,
      strokeColor: "#7b2ff7",
      strokeOpacity: 0.85,
      strokeStyle: "shortdash",
    });
    line.setMap(map);
    // 핀이 있는 전시는 핀 안에 번호를 넣고(아래 효과), 핀이 없는 전시(필터로 숨은 전시)만 따로 번호를 띄운다
    const nums = route.stops.flatMap((x, i) => {
      if (pinsRef.current.has(x.id)) return [];
      const el = document.createElement("button");
      el.type = "button";
      el.className = "route-num";
      el.textContent = String(i + 1);
      el.setAttribute("aria-label", `${i + 1}번째: ${x.title}`);
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        latest.current.onSelect(x.id);
      });
      // 같은 건물에 두 곳이면 번호가 겹치지 않게 살짝 옆으로
      const same = route.stops.slice(0, i).filter((p) => Math.abs(p.lat - x.lat) < 1e-4 && Math.abs(p.lon - x.lon) < 1e-4).length;
      const o = new kakao.maps.CustomOverlay({ position: pos[i], content: el, xAnchor: 0.5 - same * 1.1, yAnchor: 2.1, clickable: true, zIndex: 15 });
      o.setMap(map);
      return [o];
    });
    const bounds = new kakao.maps.LatLngBounds();
    pos.forEach((p: any) => bounds.extend(p));
    const isDesk = latest.current.desktop;
    // 위: 검색·필터, 아래: 목록 시트 + 대화창 띠(모바일), 왼쪽: 목록 패널, 오른쪽: 대화창(데스크톱)
    map.setBounds(bounds, isDesk ? 80 : 190, isDesk ? 440 : 50, isDesk ? 60 : 290, isDesk ? 420 : 50);
    return () => {
      line.setMap(null);
      nums.forEach((o) => o.setMap(null));
    };
  }, [ready, route?.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  // 동선을 그리는 동안: 동선 전시는 크게(보라 핀·이름표), 나머지 핀·독립공간은 작고 흐리게
  const routeKey = route && route.stops.length > 1 ? route.stops.map((x) => x.id).join("|") : "";
  useEffect(() => {
    if (!ready) return;
    const order = routeKey ? routeKey.split("|") : [];
    const on = new Set(order);
    boxRef.current?.classList.toggle("routing", on.size > 0);
    pinsRef.current.forEach(({ overlay, el }, id) => {
      const r = on.has(id);
      el.classList.toggle("on-route", r);
      const dot = el.querySelector(".pin i");
      if (dot) dot.textContent = r ? String(order.indexOf(id) + 1) : "";
      overlay.setZIndex(id === selectedId ? 10 : !on.size ? 3 : r ? 9 : 1);
    });
  }, [ready, routeKey, items, selectedId]);

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

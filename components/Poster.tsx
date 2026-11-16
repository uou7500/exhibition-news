"use client";

import { useEffect, useRef } from "react";
import type { Exhibition } from "@/lib/types";

// 썸네일이 없는 전시에 쓰는 장르별 생성 포스터.
const PALETTES: Record<string, string[]> = {
  회화: ["#e9e2d0", "#1f2a44", "#c8553d", "#f2b134"],
  미디어: ["#0b0f1e", "#36f1cd", "#5a5cff", "#f0f0f0"],
  사진: ["#d9d9d6", "#232323", "#7d7d7a", "#ffffff"],
  "조각·설치": ["#cfd6db", "#22313f", "#8a9ba8", "#e7ecef"],
  공예: ["#efe6d8", "#5b3a29", "#b98b5e", "#ffffff"],
  디자인: ["#f4f4f0", "#e63946", "#1d3557", "#f1c40f"],
  기타: ["#e6e8ef", "#2f37c9", "#9aa6b5", "#ffffff"],
};

function hash(s: string): number {
  let h = 7;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 2147483647;
  return h || 1;
}

function rng(seed: number) {
  let a = seed % 2147483647;
  return () => {
    a = (a * 16807) % 2147483647;
    return (a & 0xffff) / 0x10000;
  };
}

function draw(c: CanvasRenderingContext2D, x: Exhibition, w: number, h: number) {
  const r = rng(hash(x.id));
  const P = PALETTES[x.genre] ?? PALETTES["기타"];
  c.fillStyle = P[0];
  c.fillRect(0, 0, w, h);
  switch (x.genre) {
    case "회화":
      for (let i = 0; i < 7; i++) {
        c.strokeStyle = P[1 + (i % 3)];
        c.globalAlpha = 0.85;
        c.lineWidth = w * (0.05 + r() * 0.12);
        c.lineCap = "round";
        c.beginPath();
        const y = h * r();
        c.moveTo(-10, y);
        c.bezierCurveTo(w * 0.3, y + h * (r() - 0.5) * 0.6, w * 0.7, y + h * (r() - 0.5) * 0.6, w + 10, y + h * (r() - 0.5) * 0.3);
        c.stroke();
      }
      break;
    case "미디어":
      for (let i = 0; i < h; i += 4) {
        c.fillStyle = i % 12 === 0 ? P[2] : P[0];
        c.fillRect(0, i, w, 2);
      }
      for (let i = 0; i < 5; i++) {
        c.fillStyle = P[1 + (i % 2)];
        c.globalAlpha = 0.8;
        c.fillRect(w * r(), h * r(), w * (0.2 + r() * 0.5), h * 0.04);
      }
      break;
    case "사진":
      for (let i = 0; i < 4; i++) {
        c.fillStyle = P[1 + (i % 3)];
        c.globalAlpha = 0.9;
        c.fillRect(w * r() * 0.6, h * r() * 0.7, w * (0.35 + r() * 0.4), h * (0.25 + r() * 0.35));
      }
      break;
    case "조각·설치":
      for (let i = 0; i < 4; i++) {
        const R = w * (0.12 + r() * 0.22);
        const cx = w * (0.2 + r() * 0.6);
        const cy = h * (0.25 + r() * 0.55);
        c.globalAlpha = 0.25;
        c.fillStyle = P[1];
        c.beginPath();
        c.ellipse(cx + R * 0.3, cy + R * 0.9, R, R * 0.25, 0, 0, 7);
        c.fill();
        c.globalAlpha = 1;
        c.fillStyle = P[1 + (i % 3)];
        c.beginPath();
        c.arc(cx, cy, R, 0, 7);
        c.fill();
      }
      break;
    case "공예": {
      const cx = w * (0.3 + r() * 0.4);
      for (let i = 8; i > 0; i--) {
        c.fillStyle = P[i % 2 ? 2 : 3];
        c.globalAlpha = 0.9;
        c.beginPath();
        c.ellipse(cx, h * 0.55, w * 0.06 * i, h * 0.05 * i, 0, 0, 7);
        c.fill();
      }
      break;
    }
    default:
      for (let i = 0; i < 4; i++) {
        c.fillStyle = P[1 + (i % 3)];
        c.fillRect(Math.floor(r() * 4) * (w / 4), Math.floor(r() * 5) * (h / 5), (w / 4) * (1 + Math.floor(r() * 2)), (h / 5) * (1 + Math.floor(r() * 2)));
      }
  }
  c.globalAlpha = 1;
}

export default function Poster({ exhibition, className }: { exhibition: Exhibition; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv || exhibition.thumbnail) return;
    const w = cv.clientWidth || 52;
    const h = cv.clientHeight || 66;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = w * dpr;
    cv.height = h * dpr;
    const c = cv.getContext("2d");
    if (!c) return;
    c.scale(dpr, dpr);
    draw(c, exhibition, w, h);
  }, [exhibition]);

  if (exhibition.thumbnail) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={className} src={exhibition.thumbnail} alt="" loading="lazy" />;
  }
  return <canvas ref={ref} className={className} aria-hidden="true" />;
}

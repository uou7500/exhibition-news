import type { Exhibition } from "./types";

const DAY = 86_400_000;

export function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function today(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function formatDate(s: string): string {
  return s.replaceAll("-", ".");
}

export function formatPrice(p: number | null): string {
  if (p === null) return "가격 정보 없음";
  if (p === 0) return "무료";
  return p.toLocaleString("ko-KR") + "원";
}

export type StatusKind = "on" | "ending" | "upcoming" | "over";

export function statusOf(x: Exhibition, now = today()): { kind: StatusKind; label: string } {
  const s = parseDate(x.startDate);
  const e = parseDate(x.endDate);
  if (e < now) return { kind: "over", label: "종료" };
  if (s > now) return { kind: "upcoming", label: `개막 D-${Math.round((+s - +now) / DAY)}` };
  const left = Math.round((+e - +now) / DAY);
  if (left <= 10) return { kind: "ending", label: left === 0 ? "오늘 종료" : `종료 D-${left}` };
  return { kind: "on", label: "진행 중" };
}

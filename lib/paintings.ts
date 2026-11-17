import paintings from "@/data/paintings.json";

/**
 * 시작 화면 제목 '앙데팡당' 글자 안에 넣는 오늘의 그림.
 * scripts/fetch-paintings.mjs가 8개 분류(흐림·비·눈·화창·봄·여름·가을·겨울)마다 10장씩,
 * 퍼블릭 도메인 그림만 골라 data/paintings.json과 public/paintings/(가로 720px 사본)에 저장한다.
 */
export type Category = "흐림" | "비" | "눈" | "화창" | "봄" | "여름" | "가을" | "겨울";

export interface Painting {
  id: string;
  category: Category;
  artist: string;
  title: string;
  year: string;
  /** 위키미디어 원본 이미지 주소 (예비용) */
  image: string;
  /** 우리 사이트에 저장한 사본 파일 이름 (public/paintings/) */
  local?: string;
  page: string;
  license: string;
  stats: { gray: number; white: number; colorful: number; saturation: number };
}

export interface TodayArt {
  p: Painting;
  src: string;
  /** 화면에 보일 설명. 예: "오늘 서울 비 → 비 오는 날의 그림" */
  note: string;
}

const ALL = paintings as Painting[];

/** 한국 날짜 기준 계절 */
function seasonOf(now: Date): Category {
  const m = new Date(now.getTime() + 9 * 3_600_000).getUTCMonth() + 1;
  if (m >= 3 && m <= 5) return "봄";
  if (m >= 6 && m <= 8) return "여름";
  if (m >= 9 && m <= 11) return "가을";
  return "겨울";
}

/** 날씨 코드(WMO) → 고를 분류. 비·흐림·눈은 그 날씨 그림, 맑은 날은 '화창'과 지금 계절 그림 */
export function categoriesFor(code: number | null, now: Date): { cats: Category[]; weather: string } {
  const season = seasonOf(now);
  if (code === null) return { cats: ["화창", season], weather: "" };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { cats: ["눈"], weather: "눈" };
  if (code >= 95) return { cats: ["비"], weather: "뇌우" };
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return { cats: ["비"], weather: "비" };
  if (code === 45 || code === 48) return { cats: ["흐림"], weather: "안개" };
  if (code === 3) return { cats: ["흐림"], weather: "흐림" };
  return { cats: ["화창", season], weather: code === 2 ? "구름 조금" : "맑음" };
}

/** 오늘(한국 날짜)의 그림부터 시작하는 후보 순서. 같은 날에는 같은 그림, 날마다 번갈아 가며 */
export function paintingsFor(cats: Category[], now: Date): Painting[] {
  const list = ALL.filter((p) => cats.includes(p.category));
  if (!list.length) return [];
  const kstDay = Math.floor((now.getTime() + 9 * 3_600_000) / 86_400_000);
  const start = kstDay % list.length;
  return [...list.slice(start), ...list.slice(0, start)];
}

/** 그림을 불러올 주소들: 우리 사이트 사본 → 위키미디어 원본 */
export function imageSources(p: Painting): string[] {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return [...(p.local ? [`${base}/paintings/${p.local}`] : []), p.image];
}

function noteFor(weather: string, cats: Category[]): string {
  const what = cats.length > 1 ? `화창한 날·${cats[1]} 그림` : `${cats[0]} 그림`;
  return weather ? `오늘 서울 ${weather} → ${what}` : what;
}

/** 날씨 코드로 오늘의 그림 하나 (사본 주소 기준). 빌드할 때 미리 정해 두는 데 쓴다. */
export function todayArt(code: number | null, now: Date): TodayArt | null {
  const { cats, weather } = categoriesFor(code, now);
  const p = paintingsFor(cats, now)[0];
  if (!p) return null;
  return { p, src: imageSources(p)[0], note: noteFor(weather, cats) };
}

/** 같은 날씨 분류의 후보를 차례로 (앞 그림을 못 불러오면 다음 그림) */
export function candidatesFor(code: number | null, now: Date): { list: Painting[]; note: string } {
  const { cats, weather } = categoriesFor(code, now);
  return { list: paintingsFor(cats, now), note: noteFor(weather, cats) };
}

/** 서울 현재 날씨 (키가 필요 없는 Open-Meteo). 6초 넘게 걸리면 포기 */
export async function seoulWeatherCode(): Promise<number | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(
      "https://api.open-meteo.com/v1/forecast?latitude=37.5665&longitude=126.978&current=weather_code&timezone=Asia%2FSeoul",
      { signal: ctrl.signal, cache: "no-store" },
    );
    clearTimeout(t);
    if (!res.ok) return null;
    const j = await res.json();
    return typeof j?.current?.weather_code === "number" ? j.current.weather_code : null;
  } catch {
    return null;
  }
}

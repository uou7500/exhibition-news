import paintings from "@/data/paintings.json";

/** 시작 화면 제목 글자에 넣는 그림 (모네·마티스, 퍼블릭 도메인). scripts/fetch-paintings.mjs가 만든다. */
export interface Painting {
  id: string;
  artist: string;
  title: string;
  year: string;
  image: string;
  page: string;
  license: string;
  stats: { gray: number; white: number; colorful: number; saturation: number };
}

export type Mood = "gray" | "white" | "colorful";

export const MOOD_LABEL: Record<Mood, string> = {
  gray: "회색이 많은 그림",
  white: "흰색이 많은 그림",
  colorful: "알록달록한 그림",
};

/** Open-Meteo 날씨 코드 → 그림 분위기 (WMO 코드) */
export function moodOf(code: number): { mood: Mood; weather: string } {
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { mood: "white", weather: "눈" };
  if (code >= 95) return { mood: "gray", weather: "뇌우" };
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return { mood: "gray", weather: "비" };
  if (code === 45 || code === 48) return { mood: "gray", weather: "안개" };
  if (code === 3) return { mood: "gray", weather: "흐림" };
  if (code === 2) return { mood: "colorful", weather: "구름 조금" };
  return { mood: "colorful", weather: "맑음" };
}

/** 분위기에 맞는 후보: 색 비중 점수가 높은 순으로 몇 점 */
function pool(mood: Mood): Painting[] {
  const all = paintings as Painting[];
  const score = (p: Painting) => {
    const { gray, white, colorful } = p.stats;
    if (mood === "white") return white + 0.5 * gray - colorful / 100;
    if (mood === "gray") return gray - colorful / 100;
    return colorful;
  };
  const list = mood === "gray" ? all.filter((p) => p.stats.white < 0.25) : all;
  return [...list].sort((a, b) => score(b) - score(a)).slice(0, mood === "white" ? 4 : mood === "gray" ? 5 : 6);
}

/** 오늘(한국 날짜) 기준으로 후보 중 하나. 같은 날에는 같은 그림, 날마다 번갈아 가며 */
export function paintingFor(mood: Mood, now: Date): Painting | null {
  const list = pool(mood);
  if (!list.length) return null;
  const kstDay = Math.floor((now.getTime() + 9 * 3_600_000) / 86_400_000);
  return list[kstDay % list.length];
}

/** 서울 현재 날씨 (키가 필요 없는 Open-Meteo) */
export async function seoulWeatherCode(): Promise<number | null> {
  try {
    const res = await fetch("https://api.open-meteo.com/v1/forecast?latitude=37.5665&longitude=126.978&current=weather_code&timezone=Asia%2FSeoul");
    if (!res.ok) return null;
    const j = await res.json();
    return typeof j?.current?.weather_code === "number" ? j.current.weather_code : null;
  } catch {
    return null;
  }
}

// 전시 도우미(AI 대화) — 지금은 화면 미리보기 단계.
// 실제 AI는 아직 연결하지 않았고, 이 파일의 간단한 규칙으로 앱 안의 전시 목록에서 찾아 답한다.
// 나중에 Supabase(서버)를 거쳐 AI에 묻게 되면 askAssistant()만 바꾸면 된다. 화면(components/Assistant.tsx)은 그대로 쓴다.
//
// 원칙: 전시에 점수·순위를 매기지 않는다(앙데팡당). 조건에 맞는 전시를 찾아 주는 안내만 한다.
//       내 위치는 보내지 않는다. 동네 이름으로만 묻는다.

import type { Exhibition, Genre } from "./types";
import { parseDate, statusOf, today } from "./status";
import { futureKindOf } from "./future";
import { distanceM } from "./geo";
import type { PopularityData } from "./picks";

export interface AssistantReply {
  text: string;
  /** 답에 붙여 보여 줄 전시 id (최대 5개) */
  ids: string[];
  /** 조건에 맞는 전시 전체 수 (ids보다 많을 수 있음) */
  total: number;
  /** 카드에 덧붙일 한 줄 (예: "최근 30일 블로그 12건") */
  notes?: Record<string, string>;
  /** true면 ids가 동선 순서(1→2→3)이다. 지도에 선으로 이어 보여 줄 수 있다. */
  route?: boolean;
  /** 답에 작은 전시(예술의 미래)가 없을 때 덧붙이는 가까운 작은 전시 하나 */
  extra?: { id: string; note: string };
}

/** 대화를 시작할 때 보여 줄 예시 질문 */
export const SUGGESTIONS = [
  "이번 주말 성수에서 볼 만한 전시",
  "토요일 을지로 3곳 동선 짜줘",
  "요즘 많이 이야기되는 전시",
  "무료로 볼 수 있는 사진전",
  "곧 끝나는 졸업전시",
];

const GENRE_WORDS: [RegExp, Genre][] = [
  [/사진/, "사진"],
  [/회화|그림|페인팅|드로잉|동양화|서양화|판화/, "회화"],
  [/미디어|영상|비디오|디지털|사운드/, "미디어"],
  [/조각|설치/, "조각·설치"],
  [/공예|도자|도예|금속|유리|섬유|주얼리/, "공예"],
  [/디자인|포스터|타이포/, "디자인"],
];

/** '인기'를 묻는 말 → '대중을 위한' 탭과 같은 기준(최근 블로그 언급 수)으로 답한다. 좋고 나쁨의 순위가 아니다. */
const POPULAR = /인기|화제|핫한|핫플|뜨는|많이\s?(가|찾|보|이야기|언급)|사람\s?많|유명한|대중/;

/** 동선(여러 곳을 이어 보기)을 묻는 말 */
const ROUTE = /동선|코스|루트|돌아보|둘러보|투어|순서대로|(\d|두|세|서너|네|다섯)\s*(곳|군데)/;

/** 점수·순위를 묻는 말 */
const RANKING = /최고|1위|일위|순위|랭킹|제일 좋|가장 좋|베스트|best|top|평점|별점|몇 점/i;

/** 지역으로 보지 않을 낱말 (조사·흔한 말) */
const STOP = new Set([
  "이번", "주말", "오늘", "내일", "요즘", "지금", "다음", "주", "곧", "끝나는", "끝나", "마감", "열리는", "하는", "볼", "만한", "만한것",
  "전시", "전시회", "전시들", "있어", "있나", "있나요", "있을까", "있을까요", "알려줘", "알려", "추천", "추천해줘", "찾아줘", "보여줘", "어디",
  "무료", "무료로", "공짜", "볼수", "수", "있는", "근처", "주변", "쪽", "에서", "에", "의", "좀", "뭐", "뭐가", "같은", "졸업", "졸업전", "졸업전시",
  "가장", "제일", "동선", "코스", "루트", "짜줘", "짜", "돌아보기", "둘러보기", "토요일", "일요일", "곳", "군데", "세곳", "두곳", "네곳", "인기", "인기있는", "인기가", "화제", "화제의", "핫한", "뜨는", "요즘", "많이", "이야기되는", "사람", "이번주", "유명한",
  "실험", "실험전시", "작가전", "개인전", "독립공간", "개막", "예정", "새로", "새로운", "그리고", "또는", "랑", "하고", "가볼", "가볼만한", "곳",
]);

function stripParticle(w: string): string {
  return w.replace(/(에서|으로|에는|에도|근처|주변|쪽|에|로|의|은|는|이|가|을|를|도)$/u, "");
}

/** 흔히 부르는 동네 이름 → 주소·장소에 들어 있는 글자 */
const PLACE_ALIASES: Record<string, string[]> = {
  홍대: ["홍익", "서교동", "와우산로", "어울마당로", "잔다리로"],
  대학로: ["혜화", "동숭", "종로구 대학로"],
  을지로: ["을지로", "충무로", "수표로"],
  삼청동: ["삼청", "팔판", "북촌로"],
  이태원: ["이태원", "한남", "보광"],
  해방촌: ["해방촌", "신흥로", "용산동2가"],
};

function placeMatch(word: string): string[] | null {
  return PLACE_ALIASES[word] ?? null;
}

function weekendRange(now: Date): [Date, Date] {
  const d = new Date(now);
  const day = d.getDay(); // 0=일
  const toSat = day === 0 ? -1 : 6 - day;
  const sat = new Date(d);
  sat.setDate(d.getDate() + toSat);
  const sun = new Date(sat);
  sun.setDate(sat.getDate() + 1);
  return [sat, sun];
}

function openDuring(x: Exhibition, from: Date, to: Date): boolean {
  return parseDate(x.startDate) <= to && parseDate(x.endDate) >= from;
}

/** '예술의 미래'(졸업·실험·소규모 작가전)에 드는 작은 전시인지 */
const BIG_VENUE = /미술관|박물관|국립|시립|도립|군립|문화재단|아트센터|예술의전당|문화예술회관|문화회관|기념관|DDP|플라자|백화점|호텔/;
function isSmall(x: Exhibition): boolean {
  return futureKindOf(x) !== null && !BIG_VENUE.test(x.venue);
}

/** 같은 건물(장소 이름이 같거나 50m 안)인지 — 지도에서 핀이 겹치는 곳 */
function samePlace(a: Exhibition, b: Exhibition): boolean {
  return a.venue === b.venue || distanceM(a.lat, a.lon, b.lat, b.lon) < 50;
}

/** 걷는 거리 어림: 직선거리 × 1.3, 분속 67m(시속 약 4km) */
function walk(m: number): { m: number; min: number } {
  const road = Math.round(m * 1.3);
  return { m: road, min: Math.max(1, Math.round(road / 67)) };
}

function walkText(m: number): string {
  if (m < 30) return "다음 곳은 같은 건물이에요";
  const w = walk(m);
  const d = w.m >= 1000 ? `${(w.m / 1000).toFixed(1)}km` : `${Math.round(w.m / 10) * 10}m`;
  return w.min > 40 ? `다음 곳까지 약 ${d} · 대중교통 추천` : `다음 곳까지 걸어서 약 ${w.min}분 (${d})`;
}

const d = (a: Exhibition, b: Exhibition) => distanceM(a.lat, a.lon, b.lat, b.lon);

/**
 * 동선 고르기: 서로 다른 장소 n곳을 잇는 길 중 걷는 거리 합이 가장 짧은 것을 찾는다(출발점·순서 모두 비교).
 * - 같은 건물(이름이 같거나 50m 안)의 전시는 한 장소로 묶는다. 대표는 작은 전시 → 일찍 끝나는 전시 순.
 *   같은 건물의 다른 전시는 카드 설명에 '같은 건물에 하나 더'로 알려 준다.
 * - 한 구간은 4km 안에서만 (다른 도시로 건너뛰지 않게).
 * - must가 있으면 그 조건(예: 물어본 동네 주소)에 맞는 장소가 하나 이상 들어가야 한다.
 * 가지치기 탐색(지금까지 길이가 이미 최단보다 길면 그만 봄)이라 후보가 수십 곳이어도 금방 끝난다.
 * 거리가 거의 같은(100m 안) 길이 여럿이면 작은 전시가 더 많이 든 길을 고른다.
 */
function planRoute(cands: Exhibition[], n: number, must: (x: Exhibition) => boolean = () => true): Exhibition[] {
  // 1) 장소로 묶기
  const order = [...cands].sort(
    (a, b) => Number(isSmall(b)) - Number(isSmall(a)) || +parseDate(a.endDate) - +parseDate(b.endDate),
  );
  const places: Exhibition[] = [];
  for (const x of order) if (!places.some((p) => samePlace(p, x))) places.push(x);
  const m = Math.min(places.length, 60);
  const P = places.slice(0, m);
  if (m === 0) return [];
  const k = Math.min(n, m);
  // 2) 거리표와 '가까운 순' 이웃 목록
  const D = P.map((a) => P.map((b) => d(a, b)));
  const near = D.map((row) => row.map((_, j) => j).sort((i, j) => row[i] - row[j]));
  const smallCount = (path: number[]) => path.filter((i) => isSmall(P[i])).length;
  let best: number[] = [];
  let bestLen = Infinity;
  let steps = 0;
  const used = new Array<boolean>(m).fill(false);
  const path: number[] = [];
  const dfs = (len: number) => {
    if (++steps > 400_000) return; // 혹시 모를 과부하 방지 (그때까지 찾은 최단을 쓴다)
    if (path.length === k) {
      if (!path.some((i) => must(P[i]))) return;
      const sc = smallCount(path);
      const bsc = smallCount(best);
      if (len < bestLen - 100 || (len <= bestLen + 100 && sc > bsc) || (len < bestLen && sc >= bsc)) {
        bestLen = len;
        best = [...path];
      }
      return;
    }
    const last = path[path.length - 1];
    for (const j of near[last]) {
      if (used[j]) continue;
      const leg = D[last][j];
      if (leg > 4000) break; // 이웃은 가까운 순 → 이후는 모두 4km 넘음
      if (len + leg > bestLen + 100) break; // 더 가 봐야 최단보다 길다
      used[j] = true;
      path.push(j);
      dfs(len + leg);
      path.pop();
      used[j] = false;
    }
  };
  for (let s = 0; s < m; s++) {
    used[s] = true;
    path.push(s);
    dfs(0);
    path.pop();
    used[s] = false;
  }
  if (best.length) return best.map((i) => P[i]);
  // n곳을 이을 수 없으면 한 곳 줄여서 다시
  return k > 1 ? planRoute(cands, k - 1, must) : [];
}

/** 답에 작은 전시가 하나도 없을 때, 가까이 있는 작은 전시 하나를 찾는다 */
function smallNearby(shown: Exhibition[], pool: Exhibition[]): Exhibition | null {
  if (!shown.length || shown.some(isSmall)) return null;
  const ids = new Set(shown.map((x) => x.id));
  const anchor = shown[0];
  const c = pool
    .filter((x) => isSmall(x) && !ids.has(x.id))
    .map((x) => ({ x, m: Math.min(...shown.map((s) => d(s, x))) }))
    .filter((r) => r.m <= 5000)
    .sort((a, b) => a.m - b.m || d(anchor, a.x) - d(anchor, b.x));
  return c[0]?.x ?? null;
}

/** 같은 전시가 공공데이터와 직접 넣은 자료에 두 번 들어 있을 때 하나만 남긴다 (직접 넣은 쪽 우선) */
function dedupe(xs: Exhibition[]): Exhibition[] {
  const norm = (t: string) => t.replace(/개인전|초대전|기획전|展|전시회?/g, "").replace(/[^가-힣a-z0-9]/gi, "").toLowerCase();
  const kept: { x: Exhibition; n: string }[] = [];
  const order = [...xs].sort((a, b) => (a.source === "manual" ? 0 : 1) - (b.source === "manual" ? 0 : 1));
  const keep = new Set<string>();
  for (const x of order) {
    const n = norm(x.title);
    const dup = kept.some((k) => n.length >= 4 && k.n.length >= 4 && (k.n.includes(n) || n.includes(k.n)) && d(k.x, x) < 3000);
    if (dup) continue;
    kept.push({ x, n });
    keep.add(x.id);
  }
  return xs.filter((x) => keep.has(x.id));
}

const COUNT_WORDS: Record<string, number> = { 두: 2, 세: 3, 서너: 3, 네: 4, 다섯: 5 };

/**
 * 미리보기용 답변. 실제 AI가 아니라 낱말로 조건을 알아듣고 앱 안의 전시 목록에서 찾는다.
 */
export function previewAnswer(question: string, all: Exhibition[], popularity?: PopularityData): AssistantReply {
  const q = question.trim();
  const now = today();
  const conds: string[] = [];
  const open = dedupe(all.filter((x) => statusOf(x, now).kind !== "over"));
  let list = open;
  const popularAsked = POPULAR.test(q);
  const routeAsked = ROUTE.test(q);
  // '인기 순위'처럼 물으면 인기(언급 수)로 답하고, '최고·가장 좋은'처럼 좋고 나쁨을 물을 때만 순위를 거절한다
  const rankingAsked = !popularAsked && RANKING.test(q);

  // 무료
  if (/무료|공짜|돈 안|free/i.test(q)) {
    list = list.filter((x) => x.price === 0);
    conds.push("무료");
  }
  // 장르
  const genre = GENRE_WORDS.find(([re]) => re.test(q))?.[1];
  if (genre) {
    list = list.filter((x) => x.genre === genre);
    conds.push(genre);
  }
  // 예술의 미래 분류
  let kindAsked = true;
  if (/졸업|졸전|학위/.test(q)) {
    list = list.filter((x) => futureKindOf(x) === "졸업전시");
    conds.push("졸업전시");
  } else if (/실험|신진|청년/.test(q)) {
    list = list.filter((x) => futureKindOf(x) === "실험전시");
    conds.push("실험전시");
  } else if (/작가전|개인전/.test(q)) {
    list = list.filter((x) => futureKindOf(x) === "작가전");
    conds.push("작가전");
  } else if (/독립|대안|작은 (공간|전시)|소규모/.test(q)) {
    list = list.filter(isSmall);
    conds.push("예술의 미래");
  } else kindAsked = false;

  // 날짜: 고른 날(들)에 열려 있는지. 동선은 날을 말하지 않으면 오늘로 본다.
  let dayOk: (x: Exhibition) => boolean = () => true;
  let dayLabel = "";
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const [sat, sun] = weekendRange(now);
  if (/토요일/.test(q)) {
    dayOk = (x) => openDuring(x, sat, sat);
    dayLabel = "토요일";
  } else if (/일요일/.test(q)) {
    dayOk = (x) => openDuring(x, sun, sun);
    dayLabel = "일요일";
  } else if (/주말/.test(q)) {
    dayOk = routeAsked ? (x) => openDuring(x, sat, sat) : (x) => openDuring(x, sat, sun);
    dayLabel = routeAsked ? "이번 토요일" : "이번 주말";
  } else if (/내일/.test(q)) {
    dayOk = (x) => openDuring(x, tomorrow, tomorrow);
    dayLabel = "내일";
  } else if (/오늘|지금/.test(q) || routeAsked) {
    dayOk = (x) => openDuring(x, now, now);
    dayLabel = "오늘";
  }
  if (dayLabel) {
    list = list.filter(dayOk);
    conds.push(dayLabel);
  }
  let sortByEnd = true;
  if (/곧 끝|끝나|마감|막바지|놓치/.test(q)) {
    list = list.filter((x) => statusOf(x, now).kind === "ending");
    conds.push("곧 끝나는");
  } else if (!routeAsked && /개막|곧 열|새로|다음 주|예정/.test(q)) {
    list = list.filter((x) => statusOf(x, now).kind === "upcoming");
    conds.push("개막 예정");
    sortByEnd = false;
  }
  // 지역: 남은 낱말 중 전시의 도시·장소·주소에 들어 있는 것
  // '을지로·종로·대학로'처럼 '로'로 끝나는 동네가 있어, 낱말을 그대로 먼저 보고 안 맞으면 조사를 떼어 본다
  const words = q
    .replace(/[?!.,~·《》「」"'()]/g, " ")
    .split(/\s+/)
    .flatMap((w) => [w, stripParticle(w)])
    .filter((w) => w.length >= 2 && !STOP.has(w) && !/^\d+곳$/.test(w) && !GENRE_WORDS.some(([re]) => re.test(w)) && !RANKING.test(w));
  const where = (x: Exhibition) => `${x.city} ${x.venue} ${x.address ?? ""}`;
  const place = words.find((w) => placeMatch(w) || all.some((x) => where(x).includes(w)));
  const placeKeys = place ? placeMatch(place) ?? [place] : null;
  const inPlace = (x: Exhibition) => !placeKeys || placeKeys.some((k) => where(x).includes(k));
  const beforePlace = list;
  if (place) {
    list = list.filter(inPlace);
    conds.unshift(place);
  }
  // 작은 전시 후보: 같은 날·같은 동네 조건만 따른다 (장르·무료 조건은 풀어서 더 넓게)
  // 날을 말하지 않았으면 오늘 열려 있는 곳만 (아직 안 연 전시를 '가까이 있어요'라고 하지 않게)
  const smallDay = dayLabel ? dayOk : (x: Exhibition) => openDuring(x, now, now);
  const smallPool = open.filter((x) => smallDay(x) && inPlace(x));
  const withSmall = (reply: AssistantReply, shown: Exhibition[]): AssistantReply => {
    if (kindAsked) return reply;
    const s = smallNearby(shown, smallPool.length ? smallPool : open.filter(smallDay));
    if (!s) return reply;
    const m = Math.min(...shown.map((x) => d(x, s)));
    return { ...reply, extra: { id: s.id, note: `가까이 있는 작은 전시도 있어요 · ${walk(m).min <= 40 ? `걸어서 약 ${walk(m).min}분` : `약 ${(walk(m).m / 1000).toFixed(1)}km`}` } };
  };

  // ----- 동선 짜기 -----
  if (routeAsked) {
    if (!place) {
      return {
        text: "어느 동네에서 돌아볼까요? 동네와 날짜, 곳 수를 함께 말씀해 주세요. 예: '토요일 을지로 3곳 동선 짜줘'",
        ids: [],
        total: 0,
      };
    }
    const num = q.match(/(\d)\s*(곳|군데|개)/)?.[1];
    const word = Object.keys(COUNT_WORDS).find((k) => new RegExp(`${k}\\s*(곳|군데)`).test(q));
    const n = Math.min(5, Math.max(2, num ? Number(num) : word ? COUNT_WORDS[word] : 3));
    let route = planRoute(list, n);
    let widened = false;
    // 그 동네 주소만으로 곳 수가 모자라면, 동네 전시에서 출발해 1.5km 안의 옆 동네 전시까지 넓혀 채운다
    if (route.length < n && list.length) {
      const near = beforePlace.filter((x) => list.some((p) => d(p, x) <= 1500));
      const wider = planRoute(near, n, inPlace);
      if (wider.length > route.length) {
        route = wider;
        widened = true;
      }
    }
    if (route.length < 2) {
      return {
        text: `'${conds.join(" · ")}' 조건으로는 이어서 볼 전시가 ${route.length ? "한 곳뿐이에요" : "없어요"}. 날짜나 동네를 바꿔 다시 물어봐 주세요.`,
        ids: route.map((x) => x.id),
        total: route.length,
      };
    }

    const inRoute = new Set(route.map((x) => x.id));
    /** 동선 장소마다, 같은 건물에서 그날 함께 볼 수 있는 다른 전시 */
    const alsoHere = (x: Exhibition) => (widened ? beforePlace : list).filter((o) => !inRoute.has(o.id) && samePlace(o, x));
    let total = 0;
    const notes: Record<string, string> = {};
    route.forEach((x, i) => {
      const next = route[i + 1];
      const tag = isSmall(x) ? "작은 전시 · " : "";
      if (next) {
        const m = d(x, next);
        total += m;
        notes[x.id] = `${tag}${walkText(m)}`;
      } else notes[x.id] = `${tag}마지막 곳`;
      const more = alsoHere(x);
      if (more.length) notes[x.id] += ` · 같은 건물에 전시 ${more.length}개 더 (${more[0].title.slice(0, 18)}${more[0].title.length > 18 ? "…" : ""}${more.length > 1 ? " 등" : ""})`;
    });
    const w = walk(total);
    const short =
      route.length < n
        ? ` 4km 안에서 이어 볼 수 있는 장소가 ${route.length}곳뿐이라 그만큼만 묶었어요.`
        : widened
          ? ` ${place} 주소만으로는 장소가 모자라서, 바로 옆 동네 전시도 넣었어요.`
          : "";
    return withSmall(
      {
        text: `'${conds.join(" · ")}' ${route.length}곳 동선이에요. 걷는 거리가 가장 짧아지도록 장소와 순서를 골랐어요 (모두 합쳐 약 ${w.m >= 1000 ? `${(w.m / 1000).toFixed(1)}km` : `${w.m}m`}).${short}\n관람 시간과 쉬는 날은 전시마다 달라서, 가기 전에 각 전시 안내를 확인해 주세요.`,
        ids: route.map((x) => x.id),
        total: list.length,
        notes,
        route: true,
      },
      route,
    );
  }

  // ----- 인기: 지금 열려 있는 전시 중 최근 블로그 언급이 많은 순서 (시작 화면 '대중을 위한' 탭과 같은 기준) -----
  if (popularAsked) {
    const pop = popularity?.items ?? {};
    const days = popularity?.windowDays ?? 30;
    list = list
      .filter((x) => statusOf(x, now).kind !== "upcoming" && (pop[x.id]?.recent ?? 0) > 0)
      .sort((a, b) => (pop[b.id]?.recent ?? 0) - (pop[a.id]?.recent ?? 0));
    const label = conds.length ? `'${conds.join(" · ")}' 조건에서 ` : "";
    const week = /이번\s?주|일주일|오늘/.test(q) ? `이번 주만 따로 세지는 않아서 최근 ${days}일 기준이에요. ` : "";
    const basis = `앙데팡당은 전시의 좋고 나쁨에 순위를 매기지 않아요. 대신 최근 ${days}일 동안 네이버 블로그에서 많이 이야기된 전시를 알려 드릴게요. ${week}`.trim();
    if (!list.length) {
      return {
        text: `${basis}\n${label}블로그 글이 집계된 전시를 찾지 못했어요.${popularity?.updatedAt ? "" : " 아직 첫 집계 전이에요."}`,
        ids: [],
        total: 0,
      };
    }
    const shown = list.slice(0, 5);
    return withSmall(
      {
        text: `${basis}\n${label}지금 열려 있는 전시 중 이야기가 많은 ${shown.length}곳이에요.`,
        ids: shown.map((x) => x.id),
        total: list.length,
        notes: Object.fromEntries(shown.map((x) => [x.id, `최근 ${days}일 블로그 ${pop[x.id]?.recent ?? 0}건`])),
      },
      shown,
    );
  }

  if (!conds.length) {
    return {
      text: rankingAsked
        ? "앙데팡당은 전시에 점수나 순위를 매기지 않아요. 대신 동네·날짜·장르를 알려 주시면 조건에 맞는 전시를 모두 찾아 드릴게요."
        : "지금은 미리보기라 동네, 날짜(오늘·이번 주말), 장르(사진·회화 등), 무료, 졸업전시, 인기, 동선 같은 말만 알아들어요. 예: '이번 주말 성수 무료 전시', '토요일 을지로 3곳 동선'",
      ids: [],
      total: 0,
    };
  }

  list.sort((a, b) =>
    sortByEnd ? +parseDate(a.endDate) - +parseDate(b.endDate) : +parseDate(a.startDate) - +parseDate(b.startDate),
  );
  const label = conds.join(" · ");
  const lead = rankingAsked ? "앙데팡당은 전시에 순위를 매기지 않아요. 대신 조건에 맞는 전시를 모두 보여 드릴게요.\n" : "";
  if (!list.length) {
    return {
      text: `${lead}'${label}' 조건에 맞는 전시를 찾지 못했어요. 조건을 하나 줄여서 다시 물어봐 주세요.`,
      ids: [],
      total: 0,
    };
  }
  const shown = list.slice(0, 5);
  const order = sortByEnd ? "끝나는 날이 가까운 순서" : "여는 날이 가까운 순서";
  const more = list.length > shown.length ? ` 그중 ${shown.length}곳을 ${order}로 보여 드릴게요.` : ` ${order}로 보여 드릴게요.`;
  return withSmall(
    {
      text: `${lead}'${label}' 조건으로 찾아보니 ${list.length}곳이 있어요.${more}`,
      ids: shown.map((x) => x.id),
      total: list.length,
    },
    shown,
  );
}

/** 지금은 미리보기(서버 없음). AI를 연결하면 여기서 서버에 묻는다. */
export const assistantLive = false;

export async function askAssistant(question: string, all: Exhibition[], popularity?: PopularityData): Promise<AssistantReply> {
  // 실제로 생각하는 듯한 짧은 멈춤 (화면 흐름 확인용)
  await new Promise((r) => setTimeout(r, 650 + Math.random() * 500));
  return previewAnswer(question, all, popularity);
}

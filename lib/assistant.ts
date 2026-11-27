// 전시 도우미(AI 대화) — 지금은 화면 미리보기 단계.
// 실제 AI는 아직 연결하지 않았고, 이 파일의 간단한 규칙으로 앱 안의 전시 목록에서 찾아 답한다.
// 나중에 Supabase(서버)를 거쳐 AI에 묻게 되면 askAssistant()만 바꾸면 된다. 화면(components/Assistant.tsx)은 그대로 쓴다.
//
// 원칙: 전시에 점수·순위를 매기지 않는다(앙데팡당). 조건에 맞는 전시를 찾아 주는 안내만 한다.
//       내 위치는 보내지 않는다. 동네 이름으로만 묻는다.

import type { Exhibition, Genre } from "./types";
import { parseDate, statusOf, today } from "./status";
import { futureKindOf } from "./future";
import type { PopularityData } from "./picks";

export interface AssistantReply {
  text: string;
  /** 답에 붙여 보여 줄 전시 id (최대 5개) */
  ids: string[];
  /** 조건에 맞는 전시 전체 수 (ids보다 많을 수 있음) */
  total: number;
  /** 카드에 덧붙일 한 줄 (예: "최근 30일 블로그 12건") */
  notes?: Record<string, string>;
}

/** 대화를 시작할 때 보여 줄 예시 질문 */
export const SUGGESTIONS = [
  "이번 주말 성수에서 볼 만한 전시",
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

/** 점수·순위를 묻는 말 */
const RANKING = /최고|1위|일위|순위|랭킹|제일 좋|가장 좋|베스트|best|top|평점|별점|몇 점/i;

/** 지역으로 보지 않을 낱말 (조사·흔한 말) */
const STOP = new Set([
  "이번", "주말", "오늘", "내일", "요즘", "지금", "다음", "주", "곧", "끝나는", "끝나", "마감", "열리는", "하는", "볼", "만한", "만한것",
  "전시", "전시회", "전시들", "있어", "있나", "있나요", "있을까", "있을까요", "알려줘", "알려", "추천", "추천해줘", "찾아줘", "보여줘", "어디",
  "무료", "무료로", "공짜", "볼수", "수", "있는", "근처", "주변", "쪽", "에서", "에", "의", "좀", "뭐", "뭐가", "같은", "졸업", "졸업전", "졸업전시",
  "가장", "제일", "인기", "인기있는", "인기가", "화제", "화제의", "핫한", "뜨는", "요즘", "많이", "이야기되는", "사람", "이번주", "유명한",
  "실험", "실험전시", "작가전", "개인전", "독립공간", "개막", "예정", "새로", "새로운", "그리고", "또는", "랑", "하고", "가볼", "가볼만한", "곳",
]);

function stripParticle(w: string): string {
  return w.replace(/(에서|으로|에는|에도|근처|주변|쪽|에|로|의|은|는|이|가|을|를|도)$/u, "");
}

/** 흔히 부르는 동네 이름 → 주소·장소에 들어 있는 글자 */
const PLACE_ALIASES: Record<string, string[]> = {
  홍대: ["홍익", "서교동", "와우산로", "어울마당로", "잔다리로"],
  대학로: ["혜화", "동숭", "대학로"],
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

/**
 * 미리보기용 답변. 실제 AI가 아니라 낱말로 조건을 알아듣고 앱 안의 전시 목록에서 찾는다.
 */
export function previewAnswer(question: string, all: Exhibition[], popularity?: PopularityData): AssistantReply {
  const q = question.trim();
  const now = today();
  const conds: string[] = [];
  let list = all.filter((x) => statusOf(x, now).kind !== "over");
  const popularAsked = POPULAR.test(q);
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
  if (/졸업|졸전|학위/.test(q)) {
    list = list.filter((x) => futureKindOf(x) === "졸업전시");
    conds.push("졸업전시");
  } else if (/실험|신진|청년/.test(q)) {
    list = list.filter((x) => futureKindOf(x) === "실험전시");
    conds.push("실험전시");
  } else if (/작가전|개인전/.test(q)) {
    list = list.filter((x) => futureKindOf(x) === "작가전");
    conds.push("작가전");
  } else if (/독립|대안|작은 공간|소규모/.test(q)) {
    list = list.filter((x) => futureKindOf(x) !== null);
    conds.push("예술의 미래");
  }
  // 날짜
  let sortByEnd = true;
  if (/주말/.test(q)) {
    const [sat, sun] = weekendRange(now);
    list = list.filter((x) => openDuring(x, sat, sun));
    conds.push("이번 주말");
  } else if (/오늘|지금/.test(q)) {
    list = list.filter((x) => openDuring(x, now, now));
    conds.push("오늘");
  } else if (/내일/.test(q)) {
    const t = new Date(now);
    t.setDate(now.getDate() + 1);
    list = list.filter((x) => openDuring(x, t, t));
    conds.push("내일");
  }
  if (/곧 끝|끝나|마감|막바지|놓치/.test(q)) {
    list = list.filter((x) => statusOf(x, now).kind === "ending");
    conds.push("곧 끝나는");
  } else if (/개막|곧 열|새로|다음 주|예정/.test(q)) {
    list = list.filter((x) => statusOf(x, now).kind === "upcoming");
    conds.push("개막 예정");
    sortByEnd = false;
  }
  // 지역: 남은 낱말 중 전시의 도시·장소·주소에 들어 있는 것
  const words = q
    .replace(/[?!.,~·《》「」"'()]/g, " ")
    .split(/\s+/)
    .map(stripParticle)
    .filter((w) => w.length >= 2 && !STOP.has(w) && !GENRE_WORDS.some(([re]) => re.test(w)) && !RANKING.test(w));
  const where = (x: Exhibition) => `${x.city} ${x.venue} ${x.address ?? ""}`;
  const place = words.find((w) => placeMatch(w) || all.some((x) => where(x).includes(w)));
  if (place) {
    const keys = placeMatch(place) ?? [place];
    list = list.filter((x) => keys.some((k) => where(x).includes(k)));
    conds.unshift(place);
  }

  // 인기: 지금 열려 있는 전시 중 최근 블로그 언급이 많은 순서 (시작 화면 '대중을 위한' 탭과 같은 기준)
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
    return {
      text: `${basis}\n${label}지금 열려 있는 전시 중 이야기가 많은 ${shown.length}곳이에요.`,
      ids: shown.map((x) => x.id),
      total: list.length,
      notes: Object.fromEntries(shown.map((x) => [x.id, `최근 ${days}일 블로그 ${pop[x.id]?.recent ?? 0}건`])),
    };
  }

  if (!conds.length) {
    return {
      text: rankingAsked
        ? "앙데팡당은 전시에 점수나 순위를 매기지 않아요. 대신 동네·날짜·장르를 알려 주시면 조건에 맞는 전시를 모두 찾아 드릴게요."
        : "지금은 미리보기라 동네, 날짜(오늘·이번 주말), 장르(사진·회화 등), 무료, 졸업전시, 인기 같은 말만 알아들어요. 예: '이번 주말 성수 무료 전시'",
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
  return {
    text: `${lead}'${label}' 조건으로 찾아보니 ${list.length}곳이 있어요.${more}`,
    ids: shown.map((x) => x.id),
    total: list.length,
  };
}

/** 지금은 미리보기(서버 없음). AI를 연결하면 여기서 서버에 묻는다. */
export const assistantLive = false;

export async function askAssistant(question: string, all: Exhibition[], popularity?: PopularityData): Promise<AssistantReply> {
  // 실제로 생각하는 듯한 짧은 멈춤 (화면 흐름 확인용)
  await new Promise((r) => setTimeout(r, 650 + Math.random() * 500));
  return previewAnswer(question, all, popularity);
}

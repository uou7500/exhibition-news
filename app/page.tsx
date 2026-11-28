import ExhibitionMap from "@/components/ExhibitionMap";
import { getExhibitions, getOverseas } from "@/lib/data";
import { getPopularity } from "@/lib/picks";
import { getSpaces } from "@/lib/spaces";
import { seoulWeatherCode, todayArt } from "@/lib/paintings";

export default async function Home() {
  const { items, isSample } = getExhibitions();
  // 오늘의 그림을 빌드할 때 서울 날씨로 미리 정해 페이지에 넣는다 → 앱을 열자마자 그림이 보인다.
  // (사이트는 하루 5번 데이터 갱신 때마다 다시 빌드되고, 화면에서도 10분마다 날씨를 다시 확인한다)
  const initialArt = todayArt(await seoulWeatherCode(), new Date());
  return (
    <ExhibitionMap
      exhibitions={items}
      overseas={getOverseas()}
      isSample={isSample}
      popularity={getPopularity()}
      spaces={getSpaces()}
      initialArt={initialArt}
    />
  );
}

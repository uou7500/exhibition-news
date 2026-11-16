import ExhibitionMap from "@/components/ExhibitionMap";
import { getExhibitions } from "@/lib/data";
import { getExpertPicks, getPopularity } from "@/lib/picks";

export default function Home() {
  const { items, isSample } = getExhibitions();
  return <ExhibitionMap exhibitions={items} isSample={isSample} popularity={getPopularity()} expertPicks={getExpertPicks()} />;
}

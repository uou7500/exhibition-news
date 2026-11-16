import ExhibitionMap from "@/components/ExhibitionMap";
import { getExhibitions } from "@/lib/data";
import { getPopularity } from "@/lib/picks";
import { getSpaces } from "@/lib/spaces";

export default function Home() {
  const { items, isSample } = getExhibitions();
  return <ExhibitionMap exhibitions={items} isSample={isSample} popularity={getPopularity()} spaces={getSpaces()} />;
}

import ExhibitionMap from "@/components/ExhibitionMap";
import { getExhibitions } from "@/lib/data";

export default function Home() {
  const { items, isSample } = getExhibitions();
  return <ExhibitionMap exhibitions={items} isSample={isSample} />;
}

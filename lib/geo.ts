/** 두 지점 사이 거리(미터) */
export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** 350 → "350m", 1234 → "1.2km", 23456 → "23km" */
export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m / 10) * 10}m`;
  if (m < 10_000) return `${(m / 1000).toFixed(1)}km`;
  return `${Math.round(m / 1000)}km`;
}

/** 탐색 반경 단계(미터) */
export const RADIUS_STEPS = [200, 500, 1000, 3000, 5000, 10_000, 30_000];

export function radiusLabel(m: number): string {
  return m < 1000 ? `${m}m` : `${m / 1000}km`;
}

/** 반경 원을 감싸는 위경도 범위 */
export function radiusBounds(lat: number, lon: number, r: number) {
  const dLat = r / 111_320;
  const dLon = r / (111_320 * Math.cos((lat * Math.PI) / 180));
  return { south: lat - dLat, north: lat + dLat, west: lon - dLon, east: lon + dLon };
}

export interface MyLocation {
  lat: number;
  lon: number;
  /** 정확도(미터) */
  accuracy: number;
}

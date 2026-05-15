import type { Climb, Point } from '../types';

export function stitch(climbs: Climb[]): Point[] {
  if (climbs.length === 0) return [];

  const result: Point[] = climbs[0].points.map((p) => ({ ...p }));

  for (let i = 1; i < climbs.length; i++) {
    const prev = result[result.length - 1];
    const next = climbs[i].points;
    const first = next[0];

    const dLat = prev.lat - first.lat;
    const dLon = prev.lon - first.lon;
    const dEle = prev.ele - first.ele;

    for (let j = 1; j < next.length; j++) {
      result.push({
        lat: next[j].lat + dLat,
        lon: next[j].lon + dLon,
        ele: next[j].ele + dEle,
      });
    }
  }

  return result;
}

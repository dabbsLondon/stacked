import type { Climb, Point } from '../types';
import { haversine, makeClimb } from './gpx';

export function cumulativeDistances(points: Point[]): number[] {
  const cum: number[] = [0];
  let d = 0;
  for (let i = 1; i < points.length; i++) {
    d += haversine(points[i - 1], points[i]);
    cum.push(d);
  }
  return cum;
}

export function extractSlice(
  source: Climb,
  kmStart: number,
  kmEnd: number,
  name: string,
): Climb {
  const startM = Math.max(0, kmStart * 1000);
  const endM = Math.max(startM, kmEnd * 1000);
  const cum = cumulativeDistances(source.points);

  // Find first / last point index inside the range. We include the GPX points
  // that fall within [startM, endM] and interpolate an endpoint at each edge so
  // the slice spans exactly the requested distance.
  const pts = source.points;
  const slice: Point[] = [];

  // Leading interpolated point if startM falls strictly between two samples.
  const startInterp = interpolatePoint(pts, cum, startM);
  if (startInterp) slice.push(startInterp);

  for (let i = 0; i < pts.length; i++) {
    if (cum[i] > startM && cum[i] < endM) {
      slice.push({ ...pts[i] });
    }
  }

  const endInterp = interpolatePoint(pts, cum, endM);
  if (endInterp) slice.push(endInterp);

  // Guard: degenerate selection. Return a copy of the nearest point as a
  // single-point slice; makeClimb will throw downstream if too short.
  if (slice.length < 2 && pts.length > 0) {
    const idx = nearestIndex(cum, startM);
    slice.length = 0;
    slice.push({ ...pts[idx] });
    const next = Math.min(pts.length - 1, idx + 1);
    if (next !== idx) slice.push({ ...pts[next] });
  }

  return makeClimb(name, slice);
}

function interpolatePoint(
  pts: Point[],
  cum: number[],
  targetM: number,
): Point | null {
  if (pts.length === 0) return null;
  if (targetM <= cum[0]) return { ...pts[0] };
  if (targetM >= cum[cum.length - 1]) return { ...pts[pts.length - 1] };
  // Find the segment that brackets targetM.
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= targetM) lo = mid;
    else hi = mid;
  }
  const d0 = cum[lo];
  const d1 = cum[hi];
  const t = (targetM - d0) / Math.max(1, d1 - d0);
  const a = pts[lo];
  const b = pts[hi];
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lon: a.lon + (b.lon - a.lon) * t,
    ele: a.ele + (b.ele - a.ele) * t,
  };
}

function nearestIndex(cum: number[], targetM: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < cum.length; i++) {
    const d = Math.abs(cum[i] - targetM);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

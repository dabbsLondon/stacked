import type { Bridge, Climb, Point } from '../types';

export interface PlanSegment {
  kind: 'climb' | 'bridge';
  startIdx: number; // index of first point of this segment in plan.points
  endIdx: number; // index of last point (inclusive). Adjacent segments share endpoints.
  climb?: Climb;
  climbIdx?: number;
  bridge?: Bridge;
  bridgeIdx?: number;
}

export interface StitchPlan {
  points: Point[];
  segments: PlanSegment[];
}

export function buildStitch(
  climbs: Climb[],
  bridges: (Bridge | null)[] = [],
): StitchPlan {
  if (climbs.length === 0) return { points: [], segments: [] };

  const points: Point[] = climbs[0].points.map((p) => ({ ...p }));
  const segments: PlanSegment[] = [
    {
      kind: 'climb',
      startIdx: 0,
      endIdx: points.length - 1,
      climb: climbs[0],
      climbIdx: 0,
    },
  ];

  for (let i = 1; i < climbs.length; i++) {
    const bridge = bridges[i - 1] ?? null;
    const anchorBefore = points[points.length - 1];

    if (bridge && bridge.lengthKm > 0) {
      const bridgeStart = points.length - 1; // shared with prev climb's last point
      const generated = generateBridgePoints(
        anchorBefore,
        climbs[i - 1],
        bridge,
      );
      for (const p of generated) points.push(p);
      segments.push({
        kind: 'bridge',
        startIdx: bridgeStart,
        endIdx: points.length - 1,
        bridge,
        bridgeIdx: i - 1,
      });
    }

    const next = climbs[i].points;
    const first = next[0];
    const anchor = points[points.length - 1];
    const dLat = anchor.lat - first.lat;
    const dLon = anchor.lon - first.lon;
    const dEle = anchor.ele - first.ele;

    const climbStart = points.length - 1; // shared with bridge end (or prev climb end)
    for (let j = 1; j < next.length; j++) {
      points.push({
        lat: next[j].lat + dLat,
        lon: next[j].lon + dLon,
        ele: next[j].ele + dEle,
      });
    }
    segments.push({
      kind: 'climb',
      startIdx: climbStart,
      endIdx: points.length - 1,
      climb: climbs[i],
      climbIdx: i,
    });
  }

  return { points, segments };
}

// Convenience wrapper. Existing callers that only need the stitched points.
export function stitch(
  climbs: Climb[],
  bridges: (Bridge | null)[] = [],
): Point[] {
  return buildStitch(climbs, bridges).points;
}

function generateBridgePoints(
  prev: Point,
  prevClimb: Climb,
  bridge: Bridge,
): Point[] {
  const totalM = bridge.lengthKm * 1000;
  const stepM = 25;
  const N = Math.max(1, Math.round(totalM / stepM));
  const bearing = lastBearing(prevClimb);
  const totalEleChange = (bridge.gradient / 100) * totalM;
  const out: Point[] = [];
  for (let k = 1; k <= N; k++) {
    const t = k / N;
    const distM = totalM * t;
    const { dLat, dLon } = offsetLatLon(prev.lat, bearing, distM);
    out.push({
      lat: prev.lat + dLat,
      lon: prev.lon + dLon,
      ele: prev.ele + totalEleChange * t,
    });
  }
  return out;
}

function lastBearing(climb: Climb): number {
  const pts = climb.points;
  if (pts.length < 2) return 0;
  const a = pts[pts.length - 2];
  const b = pts[pts.length - 1];
  return Math.atan2(b.lon - a.lon, b.lat - a.lat);
}

function offsetLatLon(
  lat: number,
  bearing: number,
  distM: number,
): { dLat: number; dLon: number } {
  const dLat = (distM * Math.cos(bearing)) / 111000;
  const lonScale = 111000 * Math.cos((lat * Math.PI) / 180);
  const dLon = lonScale === 0 ? 0 : (distM * Math.sin(bearing)) / lonScale;
  return { dLat, dLon };
}

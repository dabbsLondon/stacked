import type { Bridge, Climb } from '../types';
import type { StitchPlan } from './stitch';
import { haversine } from './gpx';

export const BUCKET_M = 200;

// The bar buckets are 200m so they read cleanly on the chart, but real climbs
// often have short steep kickers that average out at that resolution.
// For section min/max we sweep at several short window sizes and take the
// extreme across all of them — a brief 20m at 25% registers on the 20m sweep,
// a sustained 50m at 18% registers on the 50m sweep, and we surface whichever
// is steeper.
const PEAK_WINDOWS_M = [20, 30, 50];

export interface Segment {
  kind: 'climb' | 'bridge';
  name: string;
  segmentIdx: number; // index into profile.segments
  climbIdx?: number;
  bridge?: Bridge;
  startIdx: number;
  endIdx: number;
  startKm: number;
  endKm: number;
  distanceKm: number;
  ascentM: number;
  avgGradient: number;
  minGradient: number;
  maxGradient: number;
}

export interface Bucket {
  segmentIdx: number;
  kind: 'climb' | 'bridge';
  kmStart: number;
  kmEnd: number;
  eleStart: number;
  eleEnd: number;
  gradient: number;
  startIdx: number;
  endIdx: number;
}

export interface Profile {
  xs: number[];
  ys: number[];
  segments: Segment[];
  buckets: Bucket[];
}

// Convenience: build a profile straight from climbs (+ optional bridges) via
// stitch's plan. Old callers that pass (points, climbs) still work via the
// fromPointsAndClimbs shim below for backwards compatibility.
export function buildProfileFromPlan(plan: StitchPlan): Profile {
  if (plan.points.length < 2 || plan.segments.length === 0) {
    return { xs: [0], ys: [0], segments: [], buckets: [] };
  }

  const xs: number[] = [0];
  const ys: number[] = [plan.points[0].ele];
  const cumDistM: number[] = [0];
  let dist = 0;
  for (let i = 1; i < plan.points.length; i++) {
    dist += haversine(plan.points[i - 1], plan.points[i]);
    cumDistM.push(dist);
    xs.push(dist / 1000);
    ys.push(plan.points[i].ele);
  }

  const buckets: Bucket[] = [];
  const segments: Segment[] = [];

  for (let s = 0; s < plan.segments.length; s++) {
    const ps = plan.segments[s];
    const segStartM = cumDistM[ps.startIdx];
    const segEndM = cumDistM[ps.endIdx];
    const segDistKm = (segEndM - segStartM) / 1000;

    let cursorM = segStartM;
    let cursorIdx = ps.startIdx;

    while (cursorM < segEndM - 1) {
      const targetM = Math.min(cursorM + BUCKET_M, segEndM);
      let endIdxLocal = cursorIdx;
      while (endIdxLocal < ps.endIdx && cumDistM[endIdxLocal] < targetM) {
        endIdxLocal++;
      }
      const eleA = sampleEle(cumDistM, ys, cursorM);
      const eleB = sampleEle(cumDistM, ys, targetM);
      const dx = targetM - cursorM;
      const dy = eleB - eleA;
      const gradient = dx > 0 ? (dy / dx) * 100 : 0;
      buckets.push({
        segmentIdx: s,
        kind: ps.kind,
        kmStart: cursorM / 1000,
        kmEnd: targetM / 1000,
        eleStart: eleA,
        eleEnd: eleB,
        gradient,
        startIdx: cursorIdx,
        endIdx: endIdxLocal,
      });
      cursorM = targetM;
      cursorIdx = endIdxLocal;
    }

    const { min: minG, max: maxG } = peakGradients(
      cumDistM,
      ys,
      segStartM,
      segEndM,
    );

    // Stats: use the underlying climb's pre-computed ascent/avg for accuracy,
    // or compute from the points for bridges.
    let ascentM = 0;
    let avgGradient = 0;
    let name: string;
    if (ps.kind === 'climb' && ps.climb) {
      ascentM = ps.climb.ascentM;
      avgGradient = ps.climb.avgGradient;
      name = ps.climb.name;
    } else {
      // Bridge — compute from synthesised points
      for (let i = ps.startIdx + 1; i <= ps.endIdx; i++) {
        const d = plan.points[i].ele - plan.points[i - 1].ele;
        if (d > 0) ascentM += d;
      }
      const lenKm = segDistKm;
      avgGradient = lenKm > 0 ? ascentM / (lenKm * 10) : 0;
      const grad = ps.bridge?.gradient ?? 0;
      const tag = grad > 0.1 ? 'ramp' : grad < -0.1 ? 'valley' : 'flat';
      name = `bridge · ${tag}`;
    }

    segments.push({
      kind: ps.kind,
      segmentIdx: s,
      climbIdx: ps.climbIdx,
      bridge: ps.bridge,
      name,
      startIdx: ps.startIdx,
      endIdx: ps.endIdx,
      startKm: segStartM / 1000,
      endKm: segEndM / 1000,
      distanceKm: segDistKm,
      ascentM,
      avgGradient,
      minGradient: minG,
      maxGradient: maxG,
    });
  }

  return { xs, ys, segments, buckets };
}

// Backwards-compat: build a profile from a points array and a list of climbs
// (single-segment / no-bridge). Used by cut mode where there's no plan.
export function buildProfile(
  points: { ele: number; lat: number; lon: number }[],
  climbs: Climb[],
): Profile {
  if (points.length < 2 || climbs.length === 0) {
    return { xs: [0], ys: [0], segments: [], buckets: [] };
  }
  // Synthesise a plan: one climb segment spanning all points, treating the
  // climbs[] as the per-climb breakdown for index ranges.
  let startIdx = 0;
  const ps: StitchPlan['segments'] = [];
  for (let i = 0; i < climbs.length; i++) {
    const c = climbs[i];
    const endIdx = Math.min(startIdx + c.points.length - 1, points.length - 1);
    ps.push({
      kind: 'climb',
      startIdx,
      endIdx,
      climb: c,
      climbIdx: i,
    });
    startIdx = endIdx;
  }
  return buildProfileFromPlan({ points: points as StitchPlan['points'], segments: ps });
}

export function sampleEle(
  cumDistM: number[],
  ele: number[],
  targetM: number,
): number {
  if (targetM <= cumDistM[0]) return ele[0];
  if (targetM >= cumDistM[cumDistM.length - 1]) return ele[ele.length - 1];
  let lo = 0;
  let hi = cumDistM.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cumDistM[mid] <= targetM) lo = mid;
    else hi = mid;
  }
  const d0 = cumDistM[lo];
  const d1 = cumDistM[hi];
  const t = (targetM - d0) / Math.max(1, d1 - d0);
  return ele[lo] + (ele[hi] - ele[lo]) * t;
}

function peakGradients(
  cumDistM: number[],
  ele: number[],
  startM: number,
  endM: number,
): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  const span = endM - startM;
  if (span <= 0) return { min: 0, max: 0 };

  for (const baseWin of PEAK_WINDOWS_M) {
    const win = Math.min(baseWin, Math.max(15, span / 4));
    const step = Math.max(5, win / 3);
    for (let m = startM; m + win <= endM + 1e-6; m += step) {
      const eA = sampleEle(cumDistM, ele, m);
      const eB = sampleEle(cumDistM, ele, m + win);
      const g = ((eB - eA) / win) * 100;
      if (g < min) min = g;
      if (g > max) max = g;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 0 };
  return { min, max };
}

export function gradColor(g: number): string {
  if (g < -1) return '#7dd3fc';
  if (g < 1) return '#3a3a40';
  if (g < 3) return '#fde68a';
  if (g < 5) return '#facc15';
  if (g < 7) return '#fb923c';
  if (g < 9) return '#f97316';
  if (g < 11) return '#ef4444';
  if (g < 13) return '#dc2626';
  if (g < 16) return '#991b1b';
  return '#7f1d1d';
}

export function lineColor(g: number): string {
  if (g < -1) return '#bae6fd';
  if (g < 1) return '#9ca3af';
  if (g < 3) return '#fef3c7';
  if (g < 5) return '#fde047';
  if (g < 7) return '#fdba74';
  if (g < 9) return '#fb923c';
  if (g < 11) return '#f87171';
  if (g < 13) return '#ef4444';
  if (g < 16) return '#dc2626';
  return '#b91c1c';
}

// Bridge segments are rendered teal regardless of their synthesised gradient.
export const BRIDGE_COLOR = '#5eead4';
export const BRIDGE_LINE_COLOR = '#a7f3d0';

export function bucketColor(b: Bucket): string {
  return b.kind === 'bridge' ? BRIDGE_COLOR : gradColor(b.gradient);
}

export function bucketLineColor(b: Bucket): string {
  return b.kind === 'bridge' ? BRIDGE_LINE_COLOR : lineColor(b.gradient);
}

// Climb difficulty category — shared between the admin/library view and any
// summary widgets that show per-project distribution.
export type ClimbCategory = 'epic' | 'steep' | 'long' | 'mild';

export function categorizeClimb(
  distanceKm: number,
  maxGradient: number,
  ascentM: number,
): ClimbCategory {
  if (maxGradient >= 15) return 'epic'; // wall-style steep ramp
  if (maxGradient >= 12 && ascentM >= 150) return 'epic'; // brutal short climbs
  if (distanceKm >= 5 && maxGradient >= 12) return 'epic'; // sustained brutal
  if (ascentM >= 500) return 'epic'; // serious vertical regardless of grade
  if (distanceKm >= 10 && maxGradient >= 8) return 'epic'; // marathon climbs
  if (maxGradient >= 10) return 'steep';
  if (distanceKm >= 5) return 'long';
  return 'mild';
}

export const CATEGORY_COLORS: Record<ClimbCategory, string> = {
  epic: '#dc2626',
  steep: '#f97316',
  long: '#facc15',
  mild: '#5eead4',
};

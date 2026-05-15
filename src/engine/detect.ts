import type { Climb } from '../types';
import { haversine } from './gpx';

const STEP_M = 50; // sampling step
const WINDOW_M = 100; // gradient smoothing window
const ENTRY_GRADIENT = 5; // % — must hit this to seed a climb
const CONTINUE_GRADIENT = 2; // % — sample counts as continuing if at least this
const MIN_ASCENT = 50; // m — total ascent threshold

// Two acceptance bands — short-and-steep OR long-and-shallow both qualify.
const SHORT_MIN_LENGTH = 500; // m
const SHORT_MIN_AVG = 4; // %
const LONG_MIN_LENGTH = 3000; // m
const LONG_MIN_AVG = 2.5; // %

const FLAT_GAP_M = 400; // m — non-climbing run allowed inside a climb
const DESCENT_TOLERANCE = -3; // % — mild descents inside still count as gap
const BACK_EXTEND_M = 1500; // m — extend the start backwards through the ramp-up

const MERGE_GAP_M = 1000; // m — fuse climbs separated by less than this
const MERGE_MAX_DROP = 60; // m — ...if the dip between them is shallower

function passesThresholds(lengthM: number, ascentM: number, avg: number): boolean {
  if (ascentM < MIN_ASCENT) return false;
  if (lengthM >= SHORT_MIN_LENGTH && avg >= SHORT_MIN_AVG) return true;
  if (lengthM >= LONG_MIN_LENGTH && avg >= LONG_MIN_AVG) return true;
  return false;
}

export interface DetectedClimb {
  kmStart: number;
  kmEnd: number;
  ascentM: number;
  avgGradient: number;
}

export function detectClimbs(source: Climb): DetectedClimb[] {
  const pts = source.points;
  if (pts.length < 10) return [];

  const cum: number[] = new Array(pts.length);
  cum[0] = 0;
  for (let i = 1; i < pts.length; i++) {
    cum[i] = cum[i - 1] + haversine(pts[i - 1], pts[i]);
  }
  const total = cum[cum.length - 1];
  if (total < SHORT_MIN_LENGTH) return [];

  const N = Math.floor(total / STEP_M) + 1;
  const sampleM = new Array<number>(N);
  const sampleEle = new Array<number>(N);
  const sampleGrad = new Array<number>(N);

  for (let i = 0; i < N; i++) {
    const m = i * STEP_M;
    sampleM[i] = m;
    sampleEle[i] = interpEle(cum, pts, m);
    const a = Math.max(0, m - WINDOW_M / 2);
    const b = Math.min(total, m + WINDOW_M / 2);
    const eA = interpEle(cum, pts, a);
    const eB = interpEle(cum, pts, b);
    const dist = b - a;
    sampleGrad[i] = dist > 0 ? ((eB - eA) / dist) * 100 : 0;
  }

  const GAP_SAMPLES = Math.ceil(FLAT_GAP_M / STEP_M);
  const raw: DetectedClimb[] = [];

  let i = 0;
  while (i < N) {
    // Seed the scan only when a sample hits the entry threshold.
    if (sampleGrad[i] < ENTRY_GRADIENT) {
      i++;
      continue;
    }
    const seedIdx = i;
    let lastGood = i;
    let maxEleIdx = i; // index of the highest elevation seen so far in this climb
    let maxEle = sampleEle[i];
    let gap = 0;
    while (i < N) {
      const g = sampleGrad[i];
      if (sampleEle[i] > maxEle) {
        maxEle = sampleEle[i];
        maxEleIdx = i;
      }
      if (g >= CONTINUE_GRADIENT) {
        lastGood = i;
        gap = 0;
      } else if (g >= DESCENT_TOLERANCE) {
        gap++;
        if (gap > GAP_SAMPLES) break;
      } else {
        break; // strong descent — climb really has ended
      }
      i++;
    }

    // End of the climb is the highest point reached, not the last climbing
    // sample (so plateaus / brief dips at the top still land on the summit).
    const endIdx = Math.max(lastGood, maxEleIdx);

    // Extend the start backwards through the ramp-up — capture the gentle
    // bottom of the climb that didn't yet hit the 5% entry threshold. Walk
    // back while elevation is still descending (or flat), bounded by
    // BACK_EXTEND_M.
    let startIdx = seedIdx;
    while (
      startIdx > 0 &&
      sampleM[seedIdx] - sampleM[startIdx - 1] <= BACK_EXTEND_M &&
      sampleEle[startIdx - 1] < sampleEle[startIdx]
    ) {
      startIdx--;
    }

    const segStart = sampleM[startIdx];
    const segEnd = sampleM[endIdx];
    const length = segEnd - segStart;
    const ascent = sampleEle[endIdx] - sampleEle[startIdx];
    const avgGradient = length > 0 ? (ascent / length) * 100 : 0;

    if (length > 0 && passesThresholds(length, ascent, avgGradient)) {
      raw.push({
        kmStart: segStart / 1000,
        kmEnd: segEnd / 1000,
        ascentM: ascent,
        avgGradient,
      });
    }
    i = endIdx + 1;
  }

  // Merge pass — combine adjacent climbs that are close together and don't
  // drop much in the gap (false summits, brief flats, kinks within an effort).
  const merged: DetectedClimb[] = [];
  for (const c of raw) {
    const last = merged[merged.length - 1];
    if (last) {
      const gapM = (c.kmStart - last.kmEnd) * 1000;
      const eleAtLastEnd = interpEle(cum, pts, last.kmEnd * 1000);
      const eleAtCurrStart = interpEle(cum, pts, c.kmStart * 1000);
      const dropInGap = eleAtLastEnd - eleAtCurrStart;
      if (gapM <= MERGE_GAP_M && dropInGap <= MERGE_MAX_DROP) {
        const eleStart = interpEle(cum, pts, last.kmStart * 1000);
        const eleEnd = interpEle(cum, pts, c.kmEnd * 1000);
        const newAscent = eleEnd - eleStart;
        const newLengthM = (c.kmEnd - last.kmStart) * 1000;
        const newAvg = newLengthM > 0 ? (newAscent / newLengthM) * 100 : 0;
        if (passesThresholds(newLengthM, newAscent, newAvg)) {
          merged[merged.length - 1] = {
            kmStart: last.kmStart,
            kmEnd: c.kmEnd,
            ascentM: Math.max(0, newAscent),
            avgGradient: newAvg,
          };
          continue;
        }
      }
    }
    merged.push(c);
  }

  return merged;
}

function interpEle(
  cum: number[],
  pts: { ele: number }[],
  m: number,
): number {
  if (m <= cum[0]) return pts[0].ele;
  if (m >= cum[cum.length - 1]) return pts[pts.length - 1].ele;
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= m) lo = mid;
    else hi = mid;
  }
  const t = (m - cum[lo]) / Math.max(1, cum[hi] - cum[lo]);
  return pts[lo].ele + (pts[hi].ele - pts[lo].ele) * t;
}

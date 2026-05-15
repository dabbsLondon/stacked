import { describe, expect, it } from 'vitest';
import {
  BRIDGE_COLOR,
  BUCKET_M,
  bucketColor,
  bucketLineColor,
  buildProfile,
  buildProfileFromPlan,
  gradColor,
  lineColor,
  sampleEle,
} from './profile';
import { buildStitch } from './stitch';
import { makeClimb } from './gpx';
import type { Climb } from '../types';

function ramp(count: number, dEle: number, name = 'r'): Climb {
  const points = Array.from({ length: count }, (_, i) => ({
    lat: 54 + 0.0001 * i, // ~11m per step
    lon: -2,
    ele: 100 + dEle * i,
  }));
  return makeClimb(name, points);
}

describe('sampleEle', () => {
  it('returns the boundary value when outside the range', () => {
    const cum = [0, 100, 200];
    const ele = [10, 15, 20];
    expect(sampleEle(cum, ele, -10)).toBe(10);
    expect(sampleEle(cum, ele, 300)).toBe(20);
  });

  it('interpolates linearly between samples', () => {
    const cum = [0, 100];
    const ele = [10, 20];
    expect(sampleEle(cum, ele, 50)).toBeCloseTo(15);
  });
});

describe('gradColor / lineColor', () => {
  it('returns a teal-ish colour for descents and red for steep ramps', () => {
    expect(gradColor(-3)).toBe('#7dd3fc');
    expect(gradColor(15)).toBe('#991b1b');
    expect(gradColor(25)).toBe('#7f1d1d');
  });

  it('lineColor returns a brighter shade for the ridge', () => {
    expect(lineColor(-3)).toBe('#bae6fd');
    expect(lineColor(0)).toBe('#9ca3af');
    expect(lineColor(8)).toBe('#fb923c');
  });

  it('walks the threshold ladder', () => {
    expect(gradColor(0)).toBe('#3a3a40');
    expect(gradColor(2)).toBe('#fde68a');
    expect(gradColor(4)).toBe('#facc15');
    expect(gradColor(6)).toBe('#fb923c');
    expect(gradColor(8)).toBe('#f97316');
    expect(gradColor(10)).toBe('#ef4444');
    expect(gradColor(12)).toBe('#dc2626');
  });
});

describe('buildProfile', () => {
  it('produces empty profile for empty inputs', () => {
    const prof = buildProfile([], []);
    expect(prof.segments).toEqual([]);
    expect(prof.buckets).toEqual([]);
  });

  it('builds buckets and segments for a single climb', () => {
    const c = ramp(80, 1); // ~80*11=880m, +79m
    const prof = buildProfile(c.points, [c]);
    expect(prof.segments).toHaveLength(1);
    expect(prof.segments[0].kind).toBe('climb');
    expect(prof.buckets.length).toBeGreaterThan(0);
    // Buckets are 200m wide.
    for (const b of prof.buckets) {
      const widthKm = b.kmEnd - b.kmStart;
      expect(widthKm * 1000).toBeLessThanOrEqual(BUCKET_M + 1);
    }
  });

  it('reports min / max gradient per segment', () => {
    const c = ramp(80, 1);
    const prof = buildProfile(c.points, [c]);
    const seg = prof.segments[0];
    expect(seg.maxGradient).toBeGreaterThanOrEqual(seg.avgGradient - 1);
    expect(seg.minGradient).toBeLessThanOrEqual(seg.maxGradient + 0.001);
  });
});

describe('buildProfileFromPlan', () => {
  it('tags bridge buckets so they render teal', () => {
    const a = ramp(40, 1, 'a');
    const b = ramp(40, 1, 'b');
    const plan = buildStitch(
      [a, b],
      [{ id: 'br', lengthKm: 1, gradient: 0 }],
    );
    const prof = buildProfileFromPlan(plan);
    const bridgeBuckets = prof.buckets.filter((bk) => bk.kind === 'bridge');
    expect(bridgeBuckets.length).toBeGreaterThan(0);
    // bucketColor should return BRIDGE_COLOR for bridge buckets, regardless of gradient.
    expect(bucketColor(bridgeBuckets[0])).toBe(BRIDGE_COLOR);
    expect(bucketLineColor(bridgeBuckets[0])).toMatch(/^#/);
  });

  it('bucketColor uses the gradient palette for climb buckets', () => {
    const c = ramp(40, 0.5);
    const prof = buildProfile(c.points, [c]);
    const climbBucket = prof.buckets[0];
    expect(climbBucket.kind).toBe('climb');
    expect(bucketColor(climbBucket)).toBe(gradColor(climbBucket.gradient));
  });
});

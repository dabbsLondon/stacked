import { describe, expect, it } from 'vitest';
import { buildStitch, stitch } from './stitch';
import { makeClimb } from './gpx';
import type { Bridge, Climb } from '../types';

function ramp(
  startLat: number,
  startLon: number,
  startEle: number,
  count: number,
  dLat: number,
  dEle: number,
  name: string,
): Climb {
  const points = Array.from({ length: count }, (_, i) => ({
    lat: startLat + dLat * i,
    lon: startLon,
    ele: startEle + dEle * i,
  }));
  return makeClimb(name, points);
}

describe('stitch', () => {
  it('returns empty array for no climbs', () => {
    expect(stitch([])).toEqual([]);
  });

  it('preserves a single climb unchanged', () => {
    const c = ramp(54, -2, 100, 5, 0.001, 10, 'one');
    const out = stitch([c]);
    expect(out).toHaveLength(5);
    expect(out[0].lat).toBe(54);
    expect(out[0].ele).toBe(100);
    expect(out[4].ele).toBe(140);
  });

  it('translates the second climb so it starts where the first ended', () => {
    const a = ramp(54, -2, 100, 3, 0.001, 10, 'a');
    const b = ramp(45, 5, 500, 3, 0.001, 10, 'b'); // far away
    const out = stitch([a, b]);
    // Last of a + (b - first of b) translation makes b[0] coincide
    expect(out).toHaveLength(5); // 3 + (3-1)
    // Junction: the last point of a (out[2]) should equal where b begins.
    expect(out[2].lat).toBeCloseTo(54 + 0.002, 6);
    expect(out[2].lon).toBeCloseTo(-2, 6);
    expect(out[2].ele).toBeCloseTo(120, 6);
    // After the junction, b's slope persists — its second point is
    // translated by (a_end - b_start).
    expect(out[3].ele).toBeCloseTo(130, 6);
    expect(out[4].ele).toBeCloseTo(140, 6);
  });
});

describe('buildStitch', () => {
  it('records one climb segment per climb when there are no bridges', () => {
    const a = ramp(54, -2, 100, 3, 0.001, 10, 'a');
    const b = ramp(0, 0, 0, 3, 0.001, 10, 'b');
    const plan = buildStitch([a, b]);
    expect(plan.segments).toHaveLength(2);
    expect(plan.segments[0].kind).toBe('climb');
    expect(plan.segments[1].kind).toBe('climb');
    expect(plan.segments[0].climbIdx).toBe(0);
    expect(plan.segments[1].climbIdx).toBe(1);
  });

  it('inserts a bridge between two climbs and records its segment', () => {
    const a = ramp(54, -2, 100, 3, 0.001, 10, 'a');
    const b = ramp(0, 0, 0, 3, 0.001, 10, 'b');
    const bridge: Bridge = {
      id: 'br',
      lengthKm: 1,
      gradient: 0,
    };
    const plan = buildStitch([a, b], [bridge]);
    expect(plan.segments).toHaveLength(3);
    expect(plan.segments[0].kind).toBe('climb');
    expect(plan.segments[1].kind).toBe('bridge');
    expect(plan.segments[2].kind).toBe('climb');
    // Bridge starts where climb 0 ends.
    const bridgeSeg = plan.segments[1];
    expect(bridgeSeg.startIdx).toBe(plan.segments[0].endIdx);
  });

  it('a flat (0%) bridge keeps elevation constant', () => {
    const a = ramp(54, -2, 100, 3, 0.001, 10, 'a');
    const b = ramp(0, 0, 0, 3, 0.001, 10, 'b');
    const bridge: Bridge = { id: 'br', lengthKm: 1, gradient: 0 };
    const plan = buildStitch([a, b], [bridge]);
    const bridgeSeg = plan.segments[1];
    const startEle = plan.points[bridgeSeg.startIdx].ele;
    const endEle = plan.points[bridgeSeg.endIdx].ele;
    expect(endEle).toBeCloseTo(startEle, 1);
  });

  it('a +5% bridge of 1km adds 50m of elevation across the bridge', () => {
    const a = ramp(54, -2, 100, 3, 0.001, 10, 'a');
    const b = ramp(0, 0, 0, 3, 0.001, 10, 'b');
    const bridge: Bridge = { id: 'br', lengthKm: 1, gradient: 5 };
    const plan = buildStitch([a, b], [bridge]);
    const bridgeSeg = plan.segments[1];
    const startEle = plan.points[bridgeSeg.startIdx].ele;
    const endEle = plan.points[bridgeSeg.endIdx].ele;
    expect(endEle - startEle).toBeCloseTo(50, 0);
  });

  it('null bridges are treated as no bridge', () => {
    const a = ramp(54, -2, 100, 3, 0.001, 10, 'a');
    const b = ramp(0, 0, 0, 3, 0.001, 10, 'b');
    const plan = buildStitch([a, b], [null]);
    expect(plan.segments).toHaveLength(2);
  });
});

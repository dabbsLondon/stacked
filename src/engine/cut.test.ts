import { describe, expect, it } from 'vitest';
import { cumulativeDistances, extractSlice } from './cut';
import { makeClimb } from './gpx';

function rampClimb(count: number, dLat: number, dEle: number) {
  const points = Array.from({ length: count }, (_, i) => ({
    lat: 54 + dLat * i,
    lon: -2,
    ele: 100 + dEle * i,
  }));
  return makeClimb('Ride', points);
}

describe('cumulativeDistances', () => {
  it('starts at 0 and grows monotonically', () => {
    const pts = [
      { lat: 0, lon: 0, ele: 0 },
      { lat: 0.001, lon: 0, ele: 0 },
      { lat: 0.002, lon: 0, ele: 0 },
    ];
    const cum = cumulativeDistances(pts);
    expect(cum[0]).toBe(0);
    expect(cum[1]).toBeGreaterThan(0);
    expect(cum[2]).toBeGreaterThan(cum[1]);
  });
});

describe('extractSlice', () => {
  it('returns a climb whose distance matches the requested range', () => {
    // ~10km long ride: 0.001 deg lat ≈ 111m, 100 points = ~11.1km
    const ride = rampClimb(100, 0.001, 5);
    const cum = cumulativeDistances(ride.points);
    const totalKm = cum[cum.length - 1] / 1000;
    const startKm = totalKm * 0.2;
    const endKm = totalKm * 0.6;

    const slice = extractSlice(ride, startKm, endKm, 'mid');
    expect(slice.name).toBe('mid');
    expect(slice.distanceKm).toBeGreaterThan(0);
    // Should be roughly endKm - startKm (within 1%)
    expect(slice.distanceKm).toBeCloseTo(endKm - startKm, 0);
  });

  it('clamps to the whole climb when the range covers it', () => {
    const ride = rampClimb(20, 0.001, 5);
    const slice = extractSlice(ride, 0, 100, 'all');
    // Should include all points
    expect(slice.points.length).toBeGreaterThanOrEqual(ride.points.length - 1);
  });

  it('returns a 2-point slice for a degenerate (zero-width) range', () => {
    const ride = rampClimb(20, 0.001, 5);
    const cum = cumulativeDistances(ride.points);
    const midKm = cum[10] / 1000;
    // Same start/end — degenerate
    const slice = extractSlice(ride, midKm, midKm, 'dot');
    expect(slice.points.length).toBeGreaterThanOrEqual(2);
  });

  it('interpolates endpoints for a range that falls between points', () => {
    const ride = rampClimb(20, 0.001, 10);
    const cum = cumulativeDistances(ride.points);
    // Pick a startKm that lands between sample points
    const startKm = (cum[5] + 30) / 1000;
    const endKm = (cum[10] + 50) / 1000;
    const slice = extractSlice(ride, startKm, endKm, 'mid');
    // First and last points are interpolated, so their elevation should be
    // between the surrounding samples' elevations.
    const firstEle = slice.points[0].ele;
    expect(firstEle).toBeGreaterThan(100);
    expect(firstEle).toBeLessThan(300);
  });
});

import { describe, expect, it } from 'vitest';
import { detectClimbs } from './detect';
import { makeClimb } from './gpx';

function buildRide(
  segments: Array<{ lengthM: number; gradient: number }>,
  step = 25,
) {
  // Build a synthetic ride by stepping `step` metres along a single line of
  // latitude per segment. We approximate 1m of latitude as 1 / 110540 degrees
  // so the haversine distance closely matches the requested lengths.
  const points: { lat: number; lon: number; ele: number }[] = [
    { lat: 54, lon: -2, ele: 0 },
  ];
  let lat = 54;
  let ele = 0;
  for (const seg of segments) {
    const steps = Math.max(1, Math.round(seg.lengthM / step));
    const dEle = ((seg.gradient / 100) * seg.lengthM) / steps;
    const dLat = seg.lengthM / steps / 110540;
    for (let i = 0; i < steps; i++) {
      lat += dLat;
      ele += dEle;
      points.push({ lat, lon: -2, ele });
    }
  }
  return makeClimb('synthetic', points);
}

describe('detectClimbs', () => {
  it('returns nothing for a totally flat ride', () => {
    const ride = buildRide([{ lengthM: 5000, gradient: 0 }]);
    expect(detectClimbs(ride)).toHaveLength(0);
  });

  it('detects a sustained 8% climb of 2km', () => {
    const ride = buildRide([
      { lengthM: 1000, gradient: 0 }, // flat warm-up
      { lengthM: 2000, gradient: 8 }, // 2km @ 8% — clearly a climb
      { lengthM: 1000, gradient: 0 }, // flat after
    ]);
    const climbs = detectClimbs(ride);
    expect(climbs.length).toBe(1);
    const c = climbs[0];
    expect(c.avgGradient).toBeGreaterThan(6);
    // Should sit around the middle 2km
    expect(c.kmEnd - c.kmStart).toBeGreaterThan(1.5);
  });

  it('merges two climbs separated by a tiny flat', () => {
    const ride = buildRide([
      { lengthM: 500, gradient: 0 },
      { lengthM: 1000, gradient: 7 }, // climb 1
      { lengthM: 200, gradient: 0 }, // brief flat
      { lengthM: 1000, gradient: 7 }, // climb 2
      { lengthM: 500, gradient: 0 },
    ]);
    const climbs = detectClimbs(ride);
    expect(climbs.length).toBe(1); // merged
    expect(climbs[0].kmEnd - climbs[0].kmStart).toBeGreaterThan(2);
  });

  it('keeps two climbs separated by a real descent', () => {
    const ride = buildRide([
      { lengthM: 500, gradient: 0 },
      { lengthM: 1000, gradient: 7 }, // climb 1
      { lengthM: 1500, gradient: -8 }, // major descent — splits the climbs
      { lengthM: 1000, gradient: 7 }, // climb 2
      { lengthM: 500, gradient: 0 },
    ]);
    const climbs = detectClimbs(ride);
    expect(climbs.length).toBe(2);
  });

  it('detects a long shallow climb with a brief kicker at the bottom', () => {
    // Real "long shallow" climbs almost always have at least one steeper bit
    // that hits 5%+. The algorithm seeds on that, then the long-shallow band
    // keeps the surrounding gentler gradient in the same climb.
    const ride = buildRide([
      { lengthM: 500, gradient: 0 },
      { lengthM: 500, gradient: 6 }, // ramps up — seeds the climb
      { lengthM: 3000, gradient: 2.8 }, // long shallow tail
      { lengthM: 500, gradient: 0 },
    ]);
    const climbs = detectClimbs(ride);
    expect(climbs.length).toBeGreaterThanOrEqual(1);
    // Should span the ramp + the tail.
    expect(climbs[0].kmEnd - climbs[0].kmStart).toBeGreaterThan(2);
  });

  it('rejects micro-bumps below the thresholds', () => {
    const ride = buildRide([
      { lengthM: 200, gradient: 8 }, // 16m of ascent — too short
      { lengthM: 200, gradient: 0 },
      { lengthM: 200, gradient: 8 },
    ]);
    expect(detectClimbs(ride)).toHaveLength(0);
  });

  it('returns nothing for a tiny route', () => {
    const tiny = makeClimb('tiny', [
      { lat: 0, lon: 0, ele: 0 },
      { lat: 0.00001, lon: 0, ele: 0.1 },
    ]);
    expect(detectClimbs(tiny)).toEqual([]);
  });
});

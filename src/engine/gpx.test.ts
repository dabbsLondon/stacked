import { describe, expect, it } from 'vitest';
import {
  computeStats,
  haversine,
  makeClimb,
  parseGpx,
  writeGpx,
} from './gpx';

function buildGpx(points: Array<{ lat: number; lon: number; ele: number }>, name = 'Test Climb'): string {
  const trkpts = points
    .map(
      (p) =>
        `<trkpt lat="${p.lat}" lon="${p.lon}"><ele>${p.ele}</ele></trkpt>`,
    )
    .join('');
  return `<?xml version="1.0"?><gpx><trk><name>${name}</name><trkseg>${trkpts}</trkseg></trk></gpx>`;
}

describe('haversine', () => {
  it('returns 0 for the same point', () => {
    const p = { lat: 54.5, lon: -2.5, ele: 0 };
    expect(haversine(p, p)).toBeCloseTo(0, 3);
  });

  it('measures ~111km per degree of latitude', () => {
    const a = { lat: 54.0, lon: 0, ele: 0 };
    const b = { lat: 55.0, lon: 0, ele: 0 };
    const d = haversine(a, b);
    // 1 degree of latitude ≈ 111 km
    expect(d).toBeGreaterThan(110000);
    expect(d).toBeLessThan(112000);
  });

  it('measures longitude distance scaled by cos(lat)', () => {
    const a = { lat: 0, lon: 0, ele: 0 };
    const b = { lat: 0, lon: 1, ele: 0 };
    const equator = haversine(a, b);

    const c = { lat: 60, lon: 0, ele: 0 };
    const d = { lat: 60, lon: 1, ele: 0 };
    const high = haversine(c, d);

    // At 60° latitude, longitude scales by cos(60°)=0.5
    expect(high / equator).toBeCloseTo(0.5, 1);
  });
});

describe('computeStats', () => {
  it('computes distance, ascent and average gradient', () => {
    // 1 km of perfect 5% climbing, then 1 km flat
    const points = [
      { lat: 54, lon: -2, ele: 0 },
      { lat: 54 + 0.009, lon: -2, ele: 50 }, // ~1km north, +50m
      { lat: 54 + 0.018, lon: -2, ele: 50 }, // ~2km north, flat
    ];
    const stats = computeStats(points);
    expect(stats.distanceKm).toBeGreaterThan(1.9);
    expect(stats.distanceKm).toBeLessThan(2.1);
    expect(stats.ascentM).toBeCloseTo(50, 0);
    // avg gradient = ascent / distance / 10
    expect(stats.avgGradient).toBeCloseTo(50 / 2 / 10, 1);
  });

  it('ignores descents in ascent total', () => {
    const points = [
      { lat: 54, lon: -2, ele: 100 },
      { lat: 54 + 0.009, lon: -2, ele: 50 }, // descent — not counted in ascent
      { lat: 54 + 0.018, lon: -2, ele: 200 },
    ];
    const stats = computeStats(points);
    // Net ascent counted: 0→100 descent doesn't add, then 50→200 = 150
    expect(stats.ascentM).toBe(150);
  });

  it('returns 0 gradient for zero distance', () => {
    const stats = computeStats([{ lat: 0, lon: 0, ele: 0 }]);
    expect(stats.distanceKm).toBe(0);
    expect(stats.ascentM).toBe(0);
    expect(stats.avgGradient).toBe(0);
  });
});

describe('parseGpx', () => {
  it('extracts track points with lat/lon/ele', () => {
    const xml = buildGpx([
      { lat: 54, lon: -2, ele: 100 },
      { lat: 54.001, lon: -2, ele: 110 },
      { lat: 54.002, lon: -2, ele: 120 },
    ]);
    const climb = parseGpx(xml, 'fallback');
    expect(climb.name).toBe('Test Climb');
    expect(climb.points).toHaveLength(3);
    expect(climb.points[0]).toEqual({ lat: 54, lon: -2, ele: 100 });
  });

  it('uses fallback name when GPX has no trk/name', () => {
    const xml = `<?xml version="1.0"?><gpx><trk><trkseg>
      <trkpt lat="0" lon="0"><ele>0</ele></trkpt>
      <trkpt lat="0.001" lon="0"><ele>10</ele></trkpt>
    </trkseg></trk></gpx>`;
    const climb = parseGpx(xml, 'my-file');
    expect(climb.name).toBe('my-file');
  });

  it('defaults elevation to 0 when missing', () => {
    const xml = `<?xml version="1.0"?><gpx><trk><name>n</name><trkseg>
      <trkpt lat="0" lon="0"/>
      <trkpt lat="0.001" lon="0"/>
    </trkseg></trk></gpx>`;
    const climb = parseGpx(xml, 'f');
    expect(climb.points[0].ele).toBe(0);
    expect(climb.points[1].ele).toBe(0);
  });

  it('throws when there are fewer than 2 points', () => {
    const xml = buildGpx([{ lat: 54, lon: -2, ele: 100 }]);
    expect(() => parseGpx(xml, 'f')).toThrow(/Not enough/);
  });

  it('throws on malformed XML', () => {
    expect(() => parseGpx('<gpx', 'f')).toThrow();
  });

  it('skips points with invalid lat/lon', () => {
    const xml = `<?xml version="1.0"?><gpx><trk><name>n</name><trkseg>
      <trkpt lat="not-a-num" lon="0"><ele>1</ele></trkpt>
      <trkpt lat="0" lon="0"><ele>2</ele></trkpt>
      <trkpt lat="0.001" lon="0"><ele>3</ele></trkpt>
    </trkseg></trk></gpx>`;
    const climb = parseGpx(xml, 'f');
    expect(climb.points).toHaveLength(2);
  });
});

describe('writeGpx', () => {
  it('roundtrips through parseGpx', () => {
    const original = [
      { lat: 54.123456, lon: -2.987654, ele: 123.4 },
      { lat: 54.124, lon: -2.987, ele: 130 },
    ];
    const xml = writeGpx(original, 'Round Trip');
    const climb = parseGpx(xml, 'fallback');
    expect(climb.name).toBe('Round Trip');
    expect(climb.points).toHaveLength(2);
    expect(climb.points[0].lat).toBeCloseTo(54.123456, 4);
    expect(climb.points[0].ele).toBeCloseTo(123.4, 1);
  });

  it('escapes XML-special characters in the name', () => {
    const xml = writeGpx(
      [
        { lat: 0, lon: 0, ele: 0 },
        { lat: 0.001, lon: 0, ele: 1 },
      ],
      'Tom & Jerry <evil>',
    );
    expect(xml).toContain('Tom &amp; Jerry &lt;evil&gt;');
  });

  it('declares GPX 1.1 and the Stacked creator', () => {
    const xml = writeGpx(
      [
        { lat: 0, lon: 0, ele: 0 },
        { lat: 0.001, lon: 0, ele: 1 },
      ],
      'foo',
    );
    expect(xml).toContain('version="1.1"');
    expect(xml).toContain('creator="Stacked"');
  });
});

describe('makeClimb', () => {
  it('attaches stats and a random id', () => {
    const c = makeClimb('foo', [
      { lat: 0, lon: 0, ele: 0 },
      { lat: 0.001, lon: 0, ele: 5 },
    ]);
    expect(c.name).toBe('foo');
    expect(c.id).toMatch(/.+/);
    expect(c.distanceKm).toBeGreaterThan(0);
    expect(c.ascentM).toBe(5);
  });
});

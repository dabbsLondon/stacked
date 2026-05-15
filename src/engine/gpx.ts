import type { Climb, Point } from '../types';

export function parseGpx(xml: string, fallbackName: string): Climb {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const parserError = doc.querySelector('parsererror');
  if (parserError) throw new Error('Invalid GPX: ' + parserError.textContent);

  const trkpts = doc.getElementsByTagName('trkpt');
  const points: Point[] = [];
  for (let i = 0; i < trkpts.length; i++) {
    const el = trkpts[i];
    const lat = parseFloat(el.getAttribute('lat') ?? '');
    const lon = parseFloat(el.getAttribute('lon') ?? '');
    if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
    const eleEl = el.getElementsByTagName('ele')[0];
    const ele = eleEl ? parseFloat(eleEl.textContent ?? '0') : 0;
    points.push({ lat, lon, ele: Number.isFinite(ele) ? ele : 0 });
  }

  if (points.length < 2) throw new Error('Not enough track points');

  const nameEl = doc.querySelector('trk > name');
  const name = nameEl?.textContent?.trim() || fallbackName;

  return makeClimb(name, points);
}

export function makeClimb(name: string, points: Point[]): Climb {
  const { distanceKm, ascentM, avgGradient } = computeStats(points);
  return {
    id: crypto.randomUUID(),
    name,
    points,
    distanceKm,
    ascentM,
    avgGradient,
  };
}

export function computeStats(points: Point[]) {
  let distance = 0;
  let ascent = 0;
  for (let i = 1; i < points.length; i++) {
    distance += haversine(points[i - 1], points[i]);
    const delta = points[i].ele - points[i - 1].ele;
    if (delta > 0) ascent += delta;
  }
  const distanceKm = distance / 1000;
  const avgGradient = distanceKm > 0 ? ascent / (distanceKm * 10) : 0;
  return { distanceKm, ascentM: ascent, avgGradient };
}

export function haversine(a: Point, b: Point): number {
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

export function writeGpx(points: Point[], name: string): string {
  const trkpts = points
    .map(
      (p) =>
        `      <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}"><ele>${p.ele.toFixed(2)}</ele></trkpt>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Stacked" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${escapeXml(name)}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>
`;
}

function escapeXml(s: string): string {
  return s.replace(
    /[<>&'"]/g,
    (c) =>
      ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!,
  );
}

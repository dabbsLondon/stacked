import type { Bridge, Climb } from '../types';

interface Props {
  climbs: Climb[];
  bridges?: (Bridge | null)[];
}

export function Totals({ climbs, bridges }: Props) {
  if (climbs.length === 0) return null;

  const climbDist = climbs.reduce((s, c) => s + c.distanceKm, 0);
  const climbAscent = climbs.reduce((s, c) => s + c.ascentM, 0);

  const bridgeList = bridges ?? [];
  const bridgeDist = bridgeList.reduce((s, b) => s + (b?.lengthKm ?? 0), 0);
  const bridgeAscent = bridgeList.reduce(
    (s, b) =>
      s +
      (b && b.gradient > 0 ? (b.gradient / 100) * b.lengthKm * 1000 : 0),
    0,
  );

  const dist = climbDist + bridgeDist;
  const ascent = climbAscent + bridgeAscent;
  const avgGrade = dist > 0 ? ascent / (dist * 10) : 0;
  const estMin = (dist / 18) * 60 + (ascent / 500) * 10;

  return (
    <div className="totals">
      <div className="mono totals-label">TOTALS</div>
      <div className="totals-grid">
        <div className="total">
          <div className="total-value">{dist.toFixed(1)} km</div>
          <div className="mono total-sub">distance</div>
        </div>
        <div className="total">
          <div className="total-value">+{Math.round(ascent)} m</div>
          <div className="mono total-sub">elevation gain</div>
        </div>
        <div className="total">
          <div className="total-value">~{formatTime(estMin)}</div>
          <div className="mono total-sub">est ride time</div>
        </div>
        <div className="total">
          <div className="total-value">{avgGrade.toFixed(1)}%</div>
          <div className="mono total-sub">avg gradient</div>
        </div>
      </div>
      {bridgeDist > 0 && (
        <div className="totals-bridge mono">
          incl. {bridgeDist.toFixed(1)}km of bridges
        </div>
      )}
    </div>
  );
}

function formatTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

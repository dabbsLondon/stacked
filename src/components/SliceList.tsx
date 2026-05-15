import type { Point, Slice } from '../types';

interface Props {
  slices: Slice[];
  activeId: string | null;
  onActivate: (id: string | null) => void;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
  onExport: (id: string) => void;
  onOpen3D: (id: string) => void;
  distanceFor: (slice: Slice) => number; // km
  ascentFor: (slice: Slice) => number; // metres
  gradientFor: (slice: Slice) => number; // % avg
  pointsFor: (slice: Slice) => Point[];
}

export function SliceList({
  slices,
  activeId,
  onActivate,
  onRename,
  onRemove,
  onExport,
  onOpen3D,
  distanceFor,
  ascentFor,
  gradientFor,
  pointsFor,
}: Props) {
  if (slices.length === 0) {
    return (
      <div className="slice-empty mono">
        drag across the chart to mark a slice
      </div>
    );
  }
  return (
    <ul className="slices">
      {slices.map((s, i) => {
        const active = s.id === activeId;
        const km = distanceFor(s);
        const asc = ascentFor(s);
        const grad = gradientFor(s);
        const pts = pointsFor(s);
        return (
          <li
            key={s.id}
            className={`slice-item ${active ? 'slice-active' : ''}`}
            onClick={() => onActivate(active ? null : s.id)}
          >
            <div className="slice-stripe" />
            <div className="slice-body">
              <div className="slice-head mono">
                {String(i + 1).padStart(2, '0')} · SLICE
              </div>
              <input
                className="slice-name"
                value={s.name}
                onChange={(e) => onRename(s.id, e.target.value)}
                onClick={(e) => e.stopPropagation()}
                spellCheck={false}
              />
              <Sparkline points={pts} />
              <div className="slice-stats mono">
                {km.toFixed(1)}km · +{Math.round(asc)}m · {grad.toFixed(1)}%
              </div>
              <div className="slice-range mono">
                {s.kmStart.toFixed(2)} → {s.kmEnd.toFixed(2)} km
              </div>
            </div>
            <div className="slice-actions">
              <button
                className="climb-btn"
                title="view in 3D"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen3D(s.id);
                }}
              >
                3D
              </button>
              <button
                className="climb-btn"
                title="export this slice"
                onClick={(e) => {
                  e.stopPropagation();
                  onExport(s.id);
                }}
              >
                ↓
              </button>
              <button
                className="climb-btn climb-btn-del"
                title="remove"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(s.id);
                }}
              >
                ×
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Sparkline({ points }: { points: Point[] }) {
  if (points.length < 2) {
    return <div className="slice-spark slice-spark-empty" />;
  }
  const W = 300;
  const H = 44;
  let minEle = Infinity;
  let maxEle = -Infinity;
  for (const p of points) {
    if (p.ele < minEle) minEle = p.ele;
    if (p.ele > maxEle) maxEle = p.ele;
  }
  if (!Number.isFinite(minEle)) minEle = 0;
  if (!Number.isFinite(maxEle)) maxEle = minEle + 1;
  const eleRange = Math.max(1, maxEle - minEle);
  const n = points.length - 1;
  // Build the line path
  let line = '';
  let area = `M 0 ${H} `;
  for (let i = 0; i < points.length; i++) {
    const x = (i / n) * W;
    const y = H - 4 - ((points[i].ele - minEle) / eleRange) * (H - 8);
    line += `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)} `;
    area += `L ${x.toFixed(1)} ${y.toFixed(1)} `;
  }
  area += `L ${W} ${H} Z`;
  return (
    <svg
      className="slice-spark"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d={area} fill="rgba(255, 95, 31, 0.18)" />
      <path d={line} fill="none" stroke="#fff200" strokeWidth="1.5" />
    </svg>
  );
}

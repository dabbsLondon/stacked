import type { Climb } from '../types';

interface Props {
  climbs: Climb[];
  onRemove: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
}

export function ClimbList({ climbs, onRemove, onMove }: Props) {
  if (climbs.length === 0) return null;

  return (
    <ul className="climbs">
      {climbs.map((c, i) => (
        <li key={c.id} className="climb-item">
          <div className="climb-stripe" />
          <div className="climb-body">
            <div className="climb-head mono">
              {String(i + 1).padStart(2, '0')} · CLIMB
            </div>
            <div className="climb-name">{c.name}</div>
            <div className="climb-stats mono">
              {c.distanceKm.toFixed(1)}km · +{Math.round(c.ascentM)}m ·{' '}
              {c.avgGradient.toFixed(1)}%
            </div>
          </div>
          <div className="climb-actions">
            <button
              className="climb-btn"
              onClick={() => onMove(c.id, -1)}
              disabled={i === 0}
              title="move up"
            >
              ↑
            </button>
            <button
              className="climb-btn"
              onClick={() => onMove(c.id, 1)}
              disabled={i === climbs.length - 1}
              title="move down"
            >
              ↓
            </button>
            <button
              className="climb-btn climb-btn-del"
              onClick={() => onRemove(c.id)}
              title="remove"
            >
              ×
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

import type { Bridge, Climb } from '../types';

interface Props {
  climbs: Climb[];
  bridges: (Bridge | null)[];
  onRemove: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onOpen3D: (id: string) => void;
  onAddBridge: (gapIdx: number) => void;
  onUpdateBridge: (gapIdx: number, patch: Partial<Bridge>) => void;
  onRemoveBridge: (gapIdx: number) => void;
}

export function ClimbList({
  climbs,
  bridges,
  onRemove,
  onMove,
  onOpen3D,
  onAddBridge,
  onUpdateBridge,
  onRemoveBridge,
}: Props) {
  if (climbs.length === 0) return null;

  return (
    <ul className="climbs">
      {climbs.map((c, i) => (
        <li key={c.id} className="climbs-row">
          <div className="climb-item">
            <div className="climb-stripe" />
            <div className="climb-body">
              <div className="climb-head mono">
                {String(i + 1).padStart(2, '0')} · CLIMB
              </div>
              <div className="climb-name">{c.name}</div>
              <div className="climb-stats mono">
                {c.distanceKm.toFixed(1)}km · +{Math.round(c.ascentM)}m ·
                {' '}avg {c.avgGradient.toFixed(1)}% · max{' '}
                {c.maxGradient.toFixed(1)}%
              </div>
              <div className="climb-difficulty">
                <span
                  className={`difficulty-pill mono ${difficultyClass(c.difficulty)}`}
                  title={`FIETS climb score: ${c.difficulty.toFixed(1)}`}
                >
                  {difficultyLabel(c.difficulty)}
                </span>
                <span className="difficulty-score mono">
                  {c.difficulty.toFixed(1)}
                </span>
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
                className="climb-btn"
                onClick={() => onOpen3D(c.id)}
                title="view in 3D"
              >
                3D
              </button>
              <button
                className="climb-btn climb-btn-del"
                onClick={() => onRemove(c.id)}
                title="remove"
              >
                ×
              </button>
            </div>
          </div>
          {i < climbs.length - 1 && (
            <BridgeRow
              gapIdx={i}
              bridge={bridges[i] ?? null}
              onAdd={onAddBridge}
              onUpdate={onUpdateBridge}
              onRemove={onRemoveBridge}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

interface BridgeRowProps {
  gapIdx: number;
  bridge: Bridge | null;
  onAdd: (gapIdx: number) => void;
  onUpdate: (gapIdx: number, patch: Partial<Bridge>) => void;
  onRemove: (gapIdx: number) => void;
}

function difficultyLabel(d: number): string {
  if (d < 1) return 'EASY';
  if (d < 3) return 'MODERATE';
  if (d < 5) return 'HARD';
  if (d < 8) return 'SEVERE';
  return 'HC';
}

function difficultyClass(d: number): string {
  if (d < 1) return 'difficulty-easy';
  if (d < 3) return 'difficulty-moderate';
  if (d < 5) return 'difficulty-hard';
  if (d < 8) return 'difficulty-severe';
  return 'difficulty-hc';
}

const BRIDGE_PRESETS_KM = [0.5, 1, 2, 5];
const LENGTH_STEP_KM = 0.1;

function BridgeRow({ gapIdx, bridge, onAdd, onUpdate, onRemove }: BridgeRowProps) {
  if (!bridge) {
    return (
      <button
        className="bridge-add mono"
        onClick={() => onAdd(gapIdx)}
        title="add a flat reset segment between these climbs"
      >
        + ADD FLAT SECTION
      </button>
    );
  }
  const type =
    bridge.gradient > 0.1
      ? 'ramp'
      : bridge.gradient < -0.1
        ? 'valley'
        : 'flat';

  function setLength(km: number) {
    if (km < 0.05) km = 0.05;
    onUpdate(gapIdx, { lengthKm: km });
  }

  return (
    <div className="bridge-row">
      <div className="bridge-stripe" />
      <div className="bridge-body">
        <div className="bridge-row-head">
          <span className="mono bridge-head">
            BRIDGE · <span className="bridge-type">{type}</span>
          </span>
          <span className="bridge-row-len">
            {bridge.lengthKm.toFixed(2)}<span className="bridge-row-unit">km</span>
          </span>
        </div>
        <div className="bridge-row-stepper">
          <button
            className="bridge-stepper-btn"
            onClick={() => setLength(bridge.lengthKm - LENGTH_STEP_KM)}
            title="-100m"
          >
            −
          </button>
          <input
            type="number"
            className="bridge-stepper-input mono"
            step={LENGTH_STEP_KM}
            min={0.05}
            value={bridge.lengthKm.toFixed(2)}
            onChange={(e) => {
              const n = parseFloat(e.target.value);
              if (Number.isFinite(n) && n > 0) setLength(n);
            }}
          />
          <button
            className="bridge-stepper-btn"
            onClick={() => setLength(bridge.lengthKm + LENGTH_STEP_KM)}
            title="+100m"
          >
            +
          </button>
          <span className="mono bridge-unit">km</span>
        </div>
        <div className="bridge-row-presets">
          {BRIDGE_PRESETS_KM.map((p) => (
            <button
              key={p}
              className={`bridge-preset bridge-preset-sm mono ${
                Math.abs(bridge.lengthKm - p) < 0.01
                  ? 'bridge-preset-active'
                  : ''
              }`}
              onClick={() => setLength(p)}
            >
              {p < 1 ? `${Math.round(p * 1000)} m` : `${p} km`}
            </button>
          ))}
        </div>
        <details className="bridge-grad-details">
          <summary className="mono bridge-grad-summary">
            gradient {bridge.gradient.toFixed(1)}%
          </summary>
          <label className="bridge-field bridge-field-tight">
            <input
              type="number"
              className="bridge-input mono"
              step={0.5}
              value={bridge.gradient.toFixed(1)}
              onChange={(e) => {
                const n = parseFloat(e.target.value);
                if (Number.isFinite(n)) onUpdate(gapIdx, { gradient: n });
              }}
            />
            <span className="mono bridge-unit">% — &lt;0 valley, &gt;0 ramp</span>
          </label>
        </details>
      </div>
      <button
        className="climb-btn climb-btn-del"
        onClick={() => onRemove(gapIdx)}
        title="remove bridge"
      >
        ×
      </button>
    </div>
  );
}

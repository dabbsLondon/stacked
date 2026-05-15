import type { BridgeDefaults as Defaults } from '../engine/projects';

interface Props {
  defaults: Defaults;
  bridgeCount: number; // how many bridges currently exist
  gapCount: number; // how many slots between climbs exist
  onChange: (next: Defaults) => void;
  onApplyToAll: () => void;
  onAddEverywhere: () => void;
  onRemoveAll: () => void;
}

const PRESETS: { label: string; km: number }[] = [
  { label: '500 m', km: 0.5 },
  { label: '1 km', km: 1 },
  { label: '2 km', km: 2 },
  { label: '5 km', km: 5 },
];

export function BridgeDefaultsPanel({
  defaults,
  bridgeCount,
  gapCount,
  onChange,
  onApplyToAll,
  onAddEverywhere,
  onRemoveAll,
}: Props) {
  if (gapCount === 0) return null;

  return (
    <div className="bridge-defaults">
      <div className="bridge-defaults-head mono">
        FLAT SECTIONS · {bridgeCount}/{gapCount}
      </div>
      <div className="bridge-defaults-row">
        <div className="bridge-defaults-presets">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              className={`bridge-preset mono ${
                Math.abs(p.km - defaults.lengthKm) < 0.01
                  ? 'bridge-preset-active'
                  : ''
              }`}
              onClick={() => onChange({ ...defaults, lengthKm: p.km })}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="bridge-defaults-row">
        <label className="bridge-field">
          <span className="mono bridge-field-label">length</span>
          <input
            type="number"
            className="bridge-input mono"
            step={0.1}
            min={0.05}
            value={defaults.lengthKm.toFixed(2)}
            onChange={(e) => {
              const n = parseFloat(e.target.value);
              if (Number.isFinite(n) && n > 0) {
                onChange({ ...defaults, lengthKm: n });
              }
            }}
          />
          <span className="mono bridge-unit">km</span>
        </label>
        <label className="bridge-field">
          <span className="mono bridge-field-label">gradient</span>
          <input
            type="number"
            className="bridge-input mono"
            step={0.5}
            value={defaults.gradient.toFixed(1)}
            onChange={(e) => {
              const n = parseFloat(e.target.value);
              if (Number.isFinite(n)) onChange({ ...defaults, gradient: n });
            }}
          />
          <span className="mono bridge-unit">%</span>
        </label>
      </div>
      <div className="bridge-defaults-actions">
        <button
          className="btn bridge-default-btn"
          onClick={onAddEverywhere}
          disabled={bridgeCount === gapCount}
          title="add a bridge in every gap that doesn't have one"
        >
          ADD TO ALL GAPS
        </button>
        <button
          className="btn bridge-default-btn"
          onClick={onApplyToAll}
          disabled={bridgeCount === 0}
          title="overwrite every existing bridge with these defaults"
        >
          APPLY TO {bridgeCount} BRIDGE{bridgeCount === 1 ? '' : 'S'}
        </button>
        <button
          className="btn bridge-default-btn bridge-default-btn-del"
          onClick={onRemoveAll}
          disabled={bridgeCount === 0}
          title="remove every bridge"
        >
          REMOVE ALL
        </button>
      </div>
    </div>
  );
}

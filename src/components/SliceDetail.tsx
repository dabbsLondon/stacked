import { useMemo } from 'react';
import type { Climb, Slice } from '../types';
import { extractSlice } from '../engine/cut';
import { buildProfile } from '../engine/profile';
import { ElevationChart } from './ElevationChart';

interface Props {
  slice: Slice;
  index: number;
  source: Climb;
  onRename: (id: string, name: string) => void;
  onUpdateRange: (id: string, kmStart: number, kmEnd: number) => void;
  onRemove: (id: string) => void;
  onExport: (id: string) => void;
  onOpen3D: (id: string) => void;
  onClose: () => void;
}

const STEP_KM = 0.05; // 50m nudge

export function SliceDetail({
  slice,
  index,
  source,
  onRename,
  onUpdateRange,
  onRemove,
  onExport,
  onOpen3D,
  onClose,
}: Props) {
  const { climb, profile } = useMemo(() => {
    try {
      const c = extractSlice(source, slice.kmStart, slice.kmEnd, slice.name);
      return { climb: c, profile: buildProfile(c.points, [c]) };
    } catch {
      return { climb: null, profile: null };
    }
  }, [source, slice.kmStart, slice.kmEnd, slice.name]);

  const sourceMaxKm = source.distanceKm;

  function nudgeStart(delta: number) {
    const next = clamp(slice.kmStart + delta, 0, slice.kmEnd - STEP_KM);
    onUpdateRange(slice.id, next, slice.kmEnd);
  }

  function nudgeEnd(delta: number) {
    const next = clamp(slice.kmEnd + delta, slice.kmStart + STEP_KM, sourceMaxKm);
    onUpdateRange(slice.id, slice.kmStart, next);
  }

  function setStartFromInput(v: string) {
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return;
    onUpdateRange(
      slice.id,
      clamp(n, 0, slice.kmEnd - STEP_KM),
      slice.kmEnd,
    );
  }

  function setEndFromInput(v: string) {
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return;
    onUpdateRange(
      slice.id,
      slice.kmStart,
      clamp(n, slice.kmStart + STEP_KM, sourceMaxKm),
    );
  }

  return (
    <div className="slice-detail">
      <div className="slice-detail-head">
        <div className="slice-detail-title">
          <span className="mono slice-detail-num">
            {String(index + 1).padStart(2, '0')} · SLICE
          </span>
          <label className="slice-detail-name-wrap">
            <span className="mono slice-detail-name-label">NAME</span>
            <input
              className="slice-detail-name"
              value={slice.name}
              onChange={(e) => onRename(slice.id, e.target.value)}
              spellCheck={false}
              placeholder="click to name this slice"
              autoFocus
            />
          </label>
          <span className="mono slice-detail-filename">
            saves as <strong>{sanitize(slice.name)}.gpx</strong>
          </span>
        </div>
        <button className="slice-detail-close" onClick={onClose} title="close">
          ×
        </button>
      </div>

      <div className="slice-detail-stats mono">
        {climb ? (
          <>
            <span>
              <span className="sd-k">{climb.distanceKm.toFixed(2)}km</span>
              <span className="sd-l">dist</span>
            </span>
            <span>
              <span className="sd-k">+{Math.round(climb.ascentM)}m</span>
              <span className="sd-l">ascent</span>
            </span>
            <span>
              <span className="sd-k">{climb.avgGradient.toFixed(1)}%</span>
              <span className="sd-l">avg</span>
            </span>
            {profile && profile.segments[0] && (
              <>
                <span>
                  <span className="sd-k sd-min">
                    {profile.segments[0].minGradient.toFixed(0)}%
                  </span>
                  <span className="sd-l">min</span>
                </span>
                <span>
                  <span className="sd-k sd-max">
                    {profile.segments[0].maxGradient.toFixed(0)}%
                  </span>
                  <span className="sd-l">max</span>
                </span>
              </>
            )}
          </>
        ) : (
          <span className="mono error">slice too short</span>
        )}
      </div>

      <div className="slice-detail-controls">
        <div className="sd-range">
          <span className="mono sd-range-label">start</span>
          <button className="climb-btn" onClick={() => nudgeStart(-STEP_KM)}>
            ‹
          </button>
          <input
            className="sd-range-input mono"
            type="number"
            step={STEP_KM}
            min={0}
            max={slice.kmEnd - STEP_KM}
            value={slice.kmStart.toFixed(2)}
            onChange={(e) => setStartFromInput(e.target.value)}
          />
          <button className="climb-btn" onClick={() => nudgeStart(STEP_KM)}>
            ›
          </button>
        </div>
        <div className="sd-range">
          <span className="mono sd-range-label">end</span>
          <button className="climb-btn" onClick={() => nudgeEnd(-STEP_KM)}>
            ‹
          </button>
          <input
            className="sd-range-input mono"
            type="number"
            step={STEP_KM}
            min={slice.kmStart + STEP_KM}
            max={sourceMaxKm}
            value={slice.kmEnd.toFixed(2)}
            onChange={(e) => setEndFromInput(e.target.value)}
          />
          <button className="climb-btn" onClick={() => nudgeEnd(STEP_KM)}>
            ›
          </button>
        </div>
        <div className="sd-spacer" />
        <button
          className="btn"
          onClick={() => onOpen3D(slice.id)}
          disabled={!climb}
          title="open this slice in 3D"
        >
          🌐 3D
        </button>
        <button
          className="btn"
          onClick={() => onRemove(slice.id)}
          title="remove this slice"
        >
          REMOVE
        </button>
        <button
          className="btn btn-primary"
          onClick={() => onExport(slice.id)}
          disabled={!climb}
        >
          EXPORT
        </button>
      </div>

      <div className="slice-detail-chart">
        {profile ? (
          <ElevationChart profile={profile} />
        ) : (
          <div className="chart-empty mono">slice too short to preview</div>
        )}
      </div>
    </div>
  );
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function sanitize(s: string): string {
  return s.replace(/[^a-z0-9_\-\.]+/gi, '_').slice(0, 80) || 'gpx';
}

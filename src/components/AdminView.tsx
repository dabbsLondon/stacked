import { useEffect, useMemo, useState } from 'react';
import type { Climb, CutSource } from '../types';
import {
  listAllProjectsAdmin,
  type RemoteProjectRow,
} from '../engine/backend';

interface Props {
  onClose: () => void;
  onPullSlice: (source: Climb) => void;
}

type AdminRow = RemoteProjectRow & { owner_display_name: string | null };

export function AdminView({ onClose, onPullSlice }: Props) {
  const [rows, setRows] = useState<AdminRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new globalThis.Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listAllProjectsAdmin();
        if (!cancelled) setRows(list);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const totals = useMemo(() => {
    if (!rows) return { projects: 0, owners: 0, climbs: 0, slices: 0 };
    const owners = new globalThis.Set<string>();
    let climbs = 0;
    let slices = 0;
    for (const r of rows) {
      owners.add(r.owner_id);
      climbs += r.snapshot.stitch.climbs.length;
      for (const src of r.snapshot.cut.sources) slices += src.slices.length;
    }
    return {
      projects: rows.length,
      owners: owners.size,
      climbs,
      slices,
    };
  }, [rows]);

  function toggle(id: string) {
    setExpanded((s) => {
      const next = new globalThis.Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="admin-view">
      <header className="admin-head">
        <button className="header-home-btn mono" onClick={onClose}>
          ← BACK
        </button>
        <div className="admin-title">
          <span className="mono admin-eyebrow">// ADMIN VIEW</span>
          <span className="admin-name">All projects · all users</span>
        </div>
        <div className="admin-totals mono">
          {totals.projects} projects · {totals.owners} users · {totals.climbs}{' '}
          climbs · {totals.slices} slices
        </div>
      </header>

      {error && <div className="error mono admin-error">{error}</div>}

      <main className="admin-main">
        {rows === null ? (
          <div className="admin-empty mono">loading…</div>
        ) : rows.length === 0 ? (
          <div className="admin-empty mono">
            no projects across the org yet
          </div>
        ) : (
          <ul className="admin-list">
            {rows.map((r) => {
              const isOpen = expanded.has(r.id);
              const climbs = r.snapshot.stitch.climbs;
              const sources = r.snapshot.cut.sources;
              const totalKm = climbs.reduce((s, c) => s + c.distanceKm, 0);
              const totalAsc = climbs.reduce((s, c) => s + c.ascentM, 0);
              return (
                <li key={r.id} className="admin-row">
                  <button
                    className="admin-row-head"
                    onClick={() => toggle(r.id)}
                  >
                    <div className="admin-row-main">
                      <div className="admin-row-name">{r.name}</div>
                      <div className="mono admin-row-meta">
                        <span className="admin-row-owner">
                          @{r.owner_display_name ?? r.owner_id.slice(0, 8)}
                        </span>
                        <span>·</span>
                        <span>{climbs.length} climbs</span>
                        <span>·</span>
                        <span>{totalKm.toFixed(1)} km</span>
                        <span>·</span>
                        <span>+{Math.round(totalAsc)} m</span>
                        {sources.length > 0 && (
                          <>
                            <span>·</span>
                            <span>
                              {sources.length} cut /{' '}
                              {sources.reduce(
                                (n, s) => n + s.slices.length,
                                0,
                              )}{' '}
                              slices
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="mono admin-row-caret">
                      {isOpen ? '▾' : '▸'}
                    </div>
                  </button>
                  {isOpen && (
                    <div className="admin-row-body">
                      {climbs.length > 0 && (
                        <section className="admin-section">
                          <div className="mono admin-section-head">
                            STITCHED CLIMBS
                          </div>
                          <ul className="admin-climbs">
                            {climbs.map((c, i) => (
                              <li key={c.id} className="admin-climb">
                                <span className="mono admin-climb-idx">
                                  {String(i + 1).padStart(2, '0')}
                                </span>
                                <span className="admin-climb-name">
                                  {c.name}
                                </span>
                                <span className="mono admin-climb-stats">
                                  {c.distanceKm.toFixed(1)}km · +
                                  {Math.round(c.ascentM)}m ·{' '}
                                  {c.avgGradient.toFixed(1)}%
                                </span>
                                <button
                                  className="btn admin-pull"
                                  title="pull this climb into my cut sources"
                                  onClick={() => onPullSlice(c)}
                                >
                                  ↓ PULL
                                </button>
                              </li>
                            ))}
                          </ul>
                        </section>
                      )}
                      {sources.length > 0 && (
                        <section className="admin-section">
                          <div className="mono admin-section-head">
                            CUT SOURCES + SLICES
                          </div>
                          {sources.map((src: CutSource) => (
                            <div key={src.id} className="admin-source">
                              <div className="admin-source-name">
                                {src.climb.name}
                                <span className="mono admin-source-meta">
                                  {' '}
                                  · {src.climb.distanceKm.toFixed(1)}km ·{' '}
                                  {src.slices.length} slices
                                </span>
                              </div>
                              <ul className="admin-slices">
                                {src.slices.map((sl, i) => (
                                  <li key={sl.id} className="admin-slice">
                                    <span className="mono admin-slice-idx">
                                      {String(i + 1).padStart(2, '0')}
                                    </span>
                                    <span className="admin-slice-name">
                                      {sl.name}
                                    </span>
                                    <span className="mono admin-slice-range">
                                      {sl.kmStart.toFixed(2)} →{' '}
                                      {sl.kmEnd.toFixed(2)} km
                                    </span>
                                    <button
                                      className="btn admin-pull"
                                      title="pull this source so you can re-slice"
                                      onClick={() => onPullSlice(src.climb)}
                                    >
                                      ↓ PULL SOURCE
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </section>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}

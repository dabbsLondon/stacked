import { useEffect, useMemo, useState } from 'react';
import type { Climb, CutSource, Point, Slice } from '../types';
import type { RemoteProjectRow } from '../engine/backend';
import { extractSlice } from '../engine/cut';
import {
  buildProfile,
  CATEGORY_COLORS,
  categorizeClimb,
  type ClimbCategory,
} from '../engine/profile';

interface Props {
  onClose: () => void;
  // Two distinct actions:
  // - onPullSource: drop the whole long ride into the user's cut workspace
  //   so they can slice it themselves.
  // - onPullClimb:   extract a single slice and drop it as a ready-to-splice
  //   climb into the user's splicer.
  onPullSource: (source: Climb) => void;
  onPullClimb: (climb: Climb) => void;
  // Optional — when supplied, the row header shows a publish / unpublish
  // toggle. Used by the admin view to let admins curate the public library
  // on behalf of other users.
  onTogglePublic?: (row: AdminRow, nextPublic: boolean) => Promise<void> | void;
  // What to fetch + how to label the view. Lets us reuse this component for
  // both the admin (all projects) and library (public projects only) views.
  fetcher: () => Promise<AdminRow[]>;
  title: string;
  eyebrow: string;
  emptyMessage: string;
}

type AdminRow = RemoteProjectRow & { owner_display_name: string | null };

export function AdminView({
  onClose,
  onPullSource,
  onPullClimb,
  onTogglePublic,
  fetcher,
  title,
  eyebrow,
  emptyMessage,
}: Props) {
  const [rows, setRows] = useState<AdminRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new globalThis.Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetcher();
        if (!cancelled) setRows(list);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetcher]);

  const totals = useMemo(() => {
    if (!rows) return { projects: 0, owners: 0, sources: 0, slices: 0 };
    const owners = new globalThis.Set<string>();
    let sources = 0;
    let slices = 0;
    for (const r of rows) {
      owners.add(r.owner_id);
      sources += r.snapshot.cut.sources.length;
      for (const src of r.snapshot.cut.sources) slices += src.slices.length;
    }
    return {
      projects: rows.length,
      owners: owners.size,
      sources,
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
          <span className="mono admin-eyebrow">{eyebrow}</span>
          <span className="admin-name">{title}</span>
        </div>
        <div className="admin-totals mono">
          {totals.projects} projects · {totals.owners} users · {totals.sources}{' '}
          sources · {totals.slices} slices
        </div>
      </header>

      <CategoryLegend />

      {error && <div className="error mono admin-error">{error}</div>}

      <main className="admin-main">
        {rows === null ? (
          <div className="admin-empty mono">loading…</div>
        ) : rows.length === 0 ? (
          <div className="admin-empty mono">{emptyMessage}</div>
        ) : (
          <ul className="admin-list">
            {rows.map((r) => {
              const isOpen = expanded.has(r.id);
              const sources = r.snapshot.cut.sources;
              const sliceCount = sources.reduce(
                (n, s) => n + s.slices.length,
                0,
              );
              const { counts, total } = projectCategoryCounts(r);
              return (
                <li key={r.id} className="admin-row">
                  <div className="admin-row-head-wrap">
                    <button
                      className="admin-row-head"
                      onClick={() => toggle(r.id)}
                    >
                      <div className="admin-row-main">
                        <div className="admin-row-name">
                          {r.name}
                          {r.is_public && (
                            <span
                              className="admin-row-public"
                              title="public — in the library"
                            >
                              🌐 public
                            </span>
                          )}
                        </div>
                        <div className="mono admin-row-meta">
                          <span className="admin-row-owner">
                            @{r.owner_display_name ?? r.owner_id.slice(0, 8)}
                          </span>
                          <span>·</span>
                          <span>
                            {sources.length} source
                            {sources.length === 1 ? '' : 's'}
                          </span>
                          <span>·</span>
                          <span>{sliceCount} slices</span>
                        </div>
                        <CategoryBar counts={counts} total={total} />
                      </div>
                      <div className="mono admin-row-caret">
                        {isOpen ? '▾' : '▸'}
                      </div>
                    </button>
                    {onTogglePublic && (
                      <button
                        className={`admin-row-share ${
                          r.is_public ? 'admin-row-share-active' : ''
                        }`}
                        onClick={async (e) => {
                          e.stopPropagation();
                          const next = !r.is_public;
                          await onTogglePublic(r, next);
                          // Optimistic refresh — flip the local copy so the
                          // user sees instant feedback.
                          setRows((curr) =>
                            curr
                              ? curr.map((x) =>
                                  x.id === r.id
                                    ? { ...x, is_public: next }
                                    : x,
                                )
                              : curr,
                          );
                        }}
                        title={
                          r.is_public
                            ? 'unpublish (remove from public library)'
                            : 'publish to the public library'
                        }
                      >
                        {r.is_public ? '🌐 UNSHARE' : '🌐 SHARE'}
                      </button>
                    )}
                  </div>
                  {isOpen && (
                    <div className="admin-row-body">
                      {sources.length === 0 ? (
                        <div className="admin-empty admin-empty-inline mono">
                          no cut sources in this project
                        </div>
                      ) : (
                        sources.map((src) => (
                          <SourceCard
                            key={src.id}
                            source={src}
                            onPullSource={onPullSource}
                            onPullClimb={onPullClimb}
                          />
                        ))
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

function projectCategoryCounts(
  project: AdminRow,
): { counts: Record<Category, number>; total: number } {
  const counts: Record<Category, number> = {
    epic: 0,
    steep: 0,
    long: 0,
    mild: 0,
  };
  let total = 0;
  for (const src of project.snapshot.cut.sources) {
    for (const sl of src.slices) {
      const stats = statsForSlice(src, sl);
      if (!stats) continue;
      const cat = categorize(stats.distanceKm, stats.maxGradient, stats.ascentM);
      counts[cat]++;
      total++;
    }
  }
  return { counts, total };
}

function CategoryBar({
  counts,
  total,
  inline,
}: {
  counts: Record<Category, number>;
  total: number;
  inline?: boolean;
}) {
  if (total === 0) return null;
  const order: Category[] = ['epic', 'steep', 'long', 'mild'];
  return (
    <div className={`cat-bar ${inline ? 'cat-bar-inline' : ''}`}>
      <div className="cat-bar-track">
        {order.map((c) => {
          const n = counts[c];
          if (n === 0) return null;
          const pct = (n / total) * 100;
          return (
            <span
              key={c}
              className={`cat-bar-seg cat-bar-${c}`}
              style={{ width: `${pct}%`, background: CATEGORY_COLORS[c] }}
              title={`${n} ${c} slice${n === 1 ? '' : 's'}`}
            />
          );
        })}
      </div>
      <div className="cat-bar-labels mono">
        {order.map((c) =>
          counts[c] > 0 ? (
            <span key={c} className={`cat-bar-tally cat-bar-tally-${c}`}>
              {counts[c]} {c}
            </span>
          ) : null,
        )}
      </div>
    </div>
  );
}

function CategoryLegend() {
  return (
    <div className="admin-legend mono">
      <span className="admin-legend-label">// CATEGORIES</span>
      <span className="cat cat-epic">epic</span>
      <span className="cat-meta">
        ≥15% max · OR ≥12% with ≥150m ascent · OR ≥500m ascent
      </span>
      <span className="cat cat-steep">steep</span>
      <span className="cat-meta">≥10% max</span>
      <span className="cat cat-long">long</span>
      <span className="cat-meta">≥5km, gentler</span>
      <span className="cat cat-mild">mild</span>
      <span className="cat-meta">rollers</span>
    </div>
  );
}

interface SliceStats {
  distanceKm: number;
  ascentM: number;
  avgGradient: number;
  maxGradient: number;
  minGradient: number;
  points: Point[];
}

function statsForSlice(source: CutSource, slice: Slice): SliceStats | null {
  try {
    const climb = extractSlice(
      source.climb,
      slice.kmStart,
      slice.kmEnd,
      slice.name,
    );
    if (climb.points.length < 2) return null;
    const profile = buildProfile(climb.points, [climb]);
    const seg = profile.segments[0];
    return {
      distanceKm: climb.distanceKm,
      ascentM: climb.ascentM,
      avgGradient: climb.avgGradient,
      maxGradient: seg?.maxGradient ?? climb.avgGradient,
      minGradient: seg?.minGradient ?? 0,
      points: climb.points,
    };
  } catch {
    return null;
  }
}

type Category = ClimbCategory;
const categorize = categorizeClimb;

function SourceCard({
  source,
  onPullSource,
  onPullClimb,
}: {
  source: CutSource;
  onPullSource: (climb: Climb) => void;
  onPullClimb: (climb: Climb) => void;
}) {
  return (
    <section className="admin-source-card">
      <header className="admin-source-card-head">
        <div className="admin-source-card-title">{source.climb.name}</div>
        <div className="mono admin-source-card-meta">
          {source.climb.distanceKm.toFixed(1)}km · +
          {Math.round(source.climb.ascentM)}m · {source.slices.length} slice
          {source.slices.length === 1 ? '' : 's'}
        </div>
        <button
          className="btn admin-pull admin-pull-source"
          onClick={() => onPullSource(source.climb)}
          title="copy the whole long ride into my Cut workspace so I can slice it myself"
        >
          ↓ PULL SOURCE
        </button>
      </header>
      <div className="admin-source-spark">
        <Sparkline points={source.climb.points} height={48} />
      </div>
      {source.slices.length === 0 ? (
        <div className="admin-empty-inline mono">no slices cut yet</div>
      ) : (
        <ul className="admin-slices">
          {source.slices.map((sl, i) => (
            <SliceCard
              key={sl.id}
              index={i}
              slice={sl}
              source={source}
              onPullClimb={onPullClimb}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function SliceCard({
  index,
  slice,
  source,
  onPullClimb,
}: {
  index: number;
  slice: Slice;
  source: CutSource;
  onPullClimb: (climb: Climb) => void;
}) {
  const stats = useMemo(
    () => statsForSlice(source, slice),
    [source, slice],
  );
  const cat = stats
    ? categorize(stats.distanceKm, stats.maxGradient, stats.ascentM)
    : 'mild';

  function pull() {
    try {
      const extracted = extractSlice(
        source.climb,
        slice.kmStart,
        slice.kmEnd,
        slice.name,
      );
      onPullClimb(extracted);
    } catch (e) {
      console.warn('pull climb failed', e);
    }
  }

  return (
    <li className={`admin-slice admin-slice-${cat}`}>
      <div className="admin-slice-num mono">
        {String(index + 1).padStart(2, '0')}
      </div>
      <div className="admin-slice-body">
        <div className="admin-slice-head">
          <span className="admin-slice-name">{slice.name}</span>
          <span className={`cat cat-${cat}`}>{cat}</span>
        </div>
        {stats && (
          <div className="admin-slice-stats mono">
            <span>
              <strong>{stats.distanceKm.toFixed(1)}</strong>km
            </span>
            <span>
              <strong>+{Math.round(stats.ascentM)}</strong>m
            </span>
            <span>
              avg <strong>{stats.avgGradient.toFixed(1)}%</strong>
            </span>
            <span className="admin-slice-max">
              max <strong>{stats.maxGradient.toFixed(0)}%</strong>
            </span>
            <span className="admin-slice-range">
              {slice.kmStart.toFixed(2)} → {slice.kmEnd.toFixed(2)} km
            </span>
          </div>
        )}
        {stats && (
          <div className="admin-slice-spark">
            <Sparkline points={stats.points} height={36} category={cat} />
          </div>
        )}
      </div>
      <button
        className="btn admin-pull"
        onClick={pull}
        disabled={!stats}
        title="extract this slice as a climb and drop it into my Splicer"
      >
        ↓ PULL CLIMB
      </button>
    </li>
  );
}

function Sparkline({
  points,
  height = 40,
  category,
}: {
  points: Point[];
  height?: number;
  category?: Category;
}) {
  if (points.length < 2) return <div className="admin-spark-empty" />;
  const W = 600;
  const H = height;
  let minE = Infinity;
  let maxE = -Infinity;
  for (const p of points) {
    if (p.ele < minE) minE = p.ele;
    if (p.ele > maxE) maxE = p.ele;
  }
  const eleRange = Math.max(1, maxE - minE);
  const n = points.length - 1;
  let line = '';
  let area = `M 0 ${H} `;
  for (let i = 0; i < points.length; i++) {
    const x = (i / n) * W;
    const y = H - 3 - ((points[i].ele - minE) / eleRange) * (H - 6);
    line += `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)} `;
    area += `L ${x.toFixed(1)} ${y.toFixed(1)} `;
  }
  area += `L ${W} ${H} Z`;

  const stroke =
    category === 'epic'
      ? '#dc2626'
      : category === 'steep'
        ? '#f97316'
        : category === 'long'
          ? '#facc15'
          : '#5eead4';
  const fill =
    category === 'epic'
      ? 'rgba(220, 38, 38, 0.25)'
      : category === 'steep'
        ? 'rgba(249, 115, 22, 0.22)'
        : category === 'long'
          ? 'rgba(250, 204, 21, 0.20)'
          : 'rgba(94, 234, 212, 0.16)';

  return (
    <svg
      className="admin-spark-svg"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d={area} fill={fill} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="1.5" />
    </svg>
  );
}

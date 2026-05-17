import type { Mode } from '../types';
import type { ProjectSnapshot } from '../engine/projects';
import type { Profile } from '../engine/backend';

interface Props {
  projects: ProjectSnapshot[];
  workingHasData: boolean;
  workingName: string;
  isDirty: boolean;
  onOpen: (p: ProjectSnapshot) => void;
  onNew: () => void;
  onNewIn: (mode: Mode) => void;
  onDelete: (id: string) => void;
  onDuplicate: (p: ProjectSnapshot) => void;
  onContinue: () => void;
  profile: Profile | null;
  onSignOut: () => void;
  onOpenAdmin: () => void;
  onSync?: () => void;
  onPurgeLocal?: () => void;
  syncing?: boolean;
  syncMessage?: string | null;
  onOpenLibrary?: () => void;
  onTogglePublic?: (p: ProjectSnapshot) => void;
}

export function HomeView({
  projects,
  workingHasData,
  workingName,
  isDirty,
  onOpen,
  onNew,
  onNewIn,
  onDelete,
  onDuplicate,
  onContinue,
  profile,
  onSignOut,
  onOpenAdmin,
  onSync,
  onPurgeLocal,
  syncing,
  syncMessage,
  onOpenLibrary,
  onTogglePublic,
}: Props) {
  const sorted = [...projects].sort((a, b) => b.updatedAt - a.updatedAt);

  // Aggregate stats across all saved projects.
  const totalClimbs = projects.reduce(
    (n, p) => n + p.stitch.climbs.length,
    0,
  );
  const totalKm = projects.reduce(
    (km, p) =>
      km +
      p.stitch.climbs.reduce((s, c) => s + c.distanceKm, 0) +
      p.stitch.bridges.reduce((s, b) => s + (b?.lengthKm ?? 0), 0),
    0,
  );
  const totalAscent = projects.reduce(
    (m, p) => m + p.stitch.climbs.reduce((s, c) => s + c.ascentM, 0),
    0,
  );

  return (
    <div className="home-shell">
      <nav className="home-nav">
        <div className="brand home-nav-brand">
          STACKED<span className="brand-dot">.</span>
        </div>
        {profile ? (
          <div className="home-nav-right">
            {onSync && (
              <button
                className="home-nav-sync-btn"
                onClick={onSync}
                disabled={syncing}
                title={syncMessage ?? 'push local projects to PocketBase / pull remote down'}
              >
                {syncing ? '⏳ SYNCING…' : '🔄 SYNC'}
              </button>
            )}
            {onPurgeLocal && (
              <button
                className="home-nav-purge-btn"
                onClick={onPurgeLocal}
                disabled={syncing}
                title="push everything to PocketBase, then wipe localStorage"
              >
                🚮 PURGE LOCAL
              </button>
            )}
            {onOpenLibrary && (
              <button
                className="home-nav-library-btn"
                onClick={onOpenLibrary}
                title="browse public projects shared by anyone"
              >
                📚 LIBRARY
              </button>
            )}
            {profile.role === 'admin' && (
              <button
                className="home-nav-admin-btn"
                onClick={onOpenAdmin}
                title="open admin view"
              >
                ⚙ ADMIN
              </button>
            )}
            <div className="user-pill">
              <span>{profile.display_name ?? 'signed in'}</span>
              <span
                className={`user-pill-role ${
                  profile.role === 'admin' ? 'user-pill-role-admin' : ''
                }`}
              >
                {profile.role}
              </span>
              <button
                className="user-pill-signout"
                onClick={onSignOut}
                title="sign out"
              >
                ⏻
              </button>
            </div>
          </div>
        ) : (
          <div className="home-nav-meta mono">
            v0.2 · client-side · no signup
          </div>
        )}
      </nav>
      <div className="home">
      {syncMessage && (
        <div className="home-sync-banner mono">
          {syncing ? '⏳ ' : '🔄 '}sync — {syncMessage}
        </div>
      )}
      <header className="home-hero">
        <div className="home-hero-bg" aria-hidden="true">
          <svg
            viewBox="0 0 1600 600"
            preserveAspectRatio="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="heroFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#ff5f1f" stopOpacity="0.55" />
                <stop offset="100%" stopColor="#ff5f1f" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M 0,500 L 80,490 L 160,440 L 240,300 L 320,400 L 380,420 L 460,350 L 540,120 L 640,300 L 720,360 L 800,400 L 880,330 L 960,40 L 1040,290 L 1120,380 L 1200,360 L 1260,260 L 1340,360 L 1420,420 L 1500,470 L 1600,490 L 1600,600 L 0,600 Z"
              fill="url(#heroFill)"
            />
            <path
              d="M 0,500 L 80,490 L 160,440 L 240,300 L 320,400 L 380,420 L 460,350 L 540,120 L 640,300 L 720,360 L 800,400 L 880,330 L 960,40 L 1040,290 L 1120,380 L 1200,360 L 1260,260 L 1340,360 L 1420,420 L 1500,470 L 1600,490"
              fill="none"
              stroke="#fff200"
              strokeWidth="2"
            />
            <circle cx="540" cy="120" r="5" fill="#fff200" />
            <circle cx="960" cy="40" r="5" fill="#fff200" />
            <circle cx="1260" cy="260" r="5" fill="#fff200" />
          </svg>
        </div>
        <div className="home-hero-mask" aria-hidden="true" />

        <div className="home-hero-content">
          <span className="home-badge mono">v0.1 · browser only · no signup</span>
          <h1 className="home-title">STACKED</h1>
          <p className="home-tagline">
            Splice climbs together. Cut them out of long rides.
            <br />
            Load straight into Rouvy. <em>Suffer in sequence.</em>
          </p>
          <div className="home-cta">
            <button className="btn btn-primary home-cta-btn" onClick={onNew}>
              + NEW PROJECT
            </button>
            {workingHasData && (
              <button
                className="btn home-cta-btn home-continue"
                onClick={onContinue}
              >
                ↺ CONTINUE <strong>{workingName}</strong>
                {isDirty && <span className="project-dirty">●</span>}
              </button>
            )}
            {sorted.length > 0 && (
              <a
                className="btn home-cta-btn home-cta-link"
                href="#projects"
              >
                ↓ {sorted.length} saved project{sorted.length === 1 ? '' : 's'}
              </a>
            )}
          </div>
        </div>
      </header>

      <section className="home-section home-how">
        <div className="home-section-head">
          <div className="mono home-section-label">// how it works</div>
          <div className="mono home-section-count">click a step to start</div>
        </div>
        <div className="how-grid">
          <HowCard
            num="01"
            title="CUT"
            color="orange"
            blurb="Drop a long ride. Auto-detect climbs by the steepest sustained sections, or drag your own ranges across the elevation chart. Each slice exports as its own clean GPX."
            tags={['auto-detect', 'multi-source', 'drag handles']}
            cta="Start cutting →"
            onClick={() => onNewIn('cut')}
          />
          <HowCard
            num="02"
            title="SPLICE"
            color="yellow"
            blurb="Stack climbs into one synthetic route. Coordinates translate to align endpoints, elevations shift to meet, gradients preserved perfectly. Insert flat reset segments between climbs to dial in recovery."
            tags={['translate', 'normalise', 'bridges']}
            cta="Start splicing →"
            onClick={() => onNewIn('stitch')}
          />
          <HowCard
            num="03"
            title="RIDE"
            color="teal"
            blurb="Export a Rouvy-ready GPX 1.1 file. The trainer treats it as one continuous ride — distance, gradient, and elevation totals all line up. Save the project, come back and tweak it tomorrow."
            tags={['GPX 1.1', 'Rouvy-ready', 'browser-only']}
            cta="Open a project →"
            onClick={onNew}
          />
        </div>
      </section>

      <section className="home-section home-stats-row">
        <Stat
          value={String(projects.length)}
          label="projects"
          sub="saved locally"
        />
        <Stat
          value={String(totalClimbs)}
          label="climbs"
          sub="stacked across projects"
        />
        <Stat
          value={`${totalKm.toFixed(0)} km`}
          label="distance"
          sub="ride-time in the stack"
        />
        <Stat
          value={`+${Math.round(totalAscent).toLocaleString()} m`}
          label="elevation"
          sub="of suffering banked"
        />
      </section>

      <section className="home-section home-projects" id="projects">
        <div className="home-section-head">
          <div className="mono home-section-label">// your projects</div>
          <div className="mono home-section-count">
            {sorted.length} saved
          </div>
        </div>
        {sorted.length === 0 ? (
          <div className="home-empty mono">
            <div className="home-empty-title">no projects saved yet</div>
            <div className="home-empty-body">
              start a{' '}
              <button className="home-empty-cta" onClick={onNew}>
                + new project
              </button>
              , then hit the yellow <strong>💾 SAVE PROJECT</strong> in the
              editor header. saved projects show up here.
            </div>
          </div>
        ) : (
          <div className="home-grid">
            {sorted.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                onOpen={() => onOpen(p)}
                onDuplicate={() => onDuplicate(p)}
                onTogglePublic={
                  onTogglePublic ? () => onTogglePublic(p) : undefined
                }
                onDelete={() => {
                  if (confirm(`Delete "${p.name}"?`)) onDelete(p.id);
                }}
              />
            ))}
          </div>
        )}
      </section>

      <footer className="home-foot mono">
        100% browser · GPX in, GPX out · no servers, no signup, no privacy
        surface
      </footer>
      </div>
    </div>
  );
}

function HowCard({
  num,
  title,
  color,
  blurb,
  tags,
  cta,
  onClick,
}: {
  num: string;
  title: string;
  color: 'orange' | 'yellow' | 'teal';
  blurb: string;
  tags: string[];
  cta: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`how-card how-card-${color}`}
      onClick={onClick}
    >
      <div className="how-card-num mono">{num}</div>
      <div className="how-card-title">{title}</div>
      <div className="how-card-blurb">{blurb}</div>
      <div className="how-card-tags">
        {tags.map((t) => (
          <span key={t} className="mono how-tag">
            {t}
          </span>
        ))}
      </div>
      <div className="mono how-card-cta">{cta}</div>
    </button>
  );
}

function Stat({
  value,
  label,
  sub,
}: {
  value: string;
  label: string;
  sub: string;
}) {
  return (
    <div className="home-stat">
      <div className="home-stat-label mono">{label}</div>
      <div className="home-stat-value">{value}</div>
      <div className="home-stat-sub mono">{sub}</div>
    </div>
  );
}

function ProjectCard({
  project,
  onOpen,
  onDuplicate,
  onTogglePublic,
  onDelete,
}: {
  project: ProjectSnapshot;
  onOpen: () => void;
  onDuplicate: () => void;
  onTogglePublic?: () => void;
  onDelete: () => void;
}) {
  const climbCount = project.stitch.climbs.length;
  const totalKm = project.stitch.climbs.reduce(
    (s, c) => s + c.distanceKm,
    0,
  );
  const totalAsc = project.stitch.climbs.reduce(
    (s, c) => s + c.ascentM,
    0,
  );
  const bridgeCount = project.stitch.bridges.filter((b) => b !== null).length;
  const sliceCount = project.cut.sources.reduce(
    (n, s) => n + s.slices.length,
    0,
  );
  const sourceCount = project.cut.sources.length;

  return (
    <article className="project-card" onClick={onOpen}>
      <header className="project-card-head">
        <h3 className="project-card-name">
          {project.name}
          {project.isPublic && (
            <span className="project-card-public" title="public — in the library">
              🌐 public
            </span>
          )}
        </h3>
        <div className="project-card-actions">
          {onTogglePublic && (
            <button
              className={`project-card-action ${
                project.isPublic ? 'project-card-publicactive' : ''
              }`}
              onClick={(e) => {
                e.stopPropagation();
                onTogglePublic();
              }}
              title={
                project.isPublic
                  ? 'unpublish (remove from library)'
                  : 'publish to the public library'
              }
            >
              {project.isPublic ? '🌐' : '🔒'}
            </button>
          )}
          <button
            className="project-card-action"
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
            title="duplicate project"
          >
            ⎘
          </button>
          <button
            className="project-card-action project-card-del"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title="delete project"
          >
            ×
          </button>
        </div>
      </header>
      <div className="project-card-thumb">
        <Sparkline climbs={project.stitch.climbs} />
      </div>
      <div className="project-card-stats mono">
        <span>
          <strong>{climbCount}</strong> climbs
        </span>
        <span>
          <strong>{totalKm.toFixed(1)}</strong> km
        </span>
        <span>
          <strong>+{Math.round(totalAsc)}</strong> m
        </span>
      </div>
      <div className="project-card-meta mono">
        {bridgeCount > 0 && <span>{bridgeCount} bridges · </span>}
        {sourceCount > 0 && (
          <span>
            {sourceCount} cut · {sliceCount} slices ·{' '}
          </span>
        )}
        <span>{timeAgo(project.updatedAt)}</span>
      </div>
    </article>
  );
}

function Sparkline({
  climbs,
}: {
  climbs: ProjectSnapshot['stitch']['climbs'];
}) {
  if (climbs.length === 0) {
    return <div className="project-card-thumb-empty mono">empty</div>;
  }
  const W = 300;
  const H = 60;
  const eles: number[] = [];
  for (const c of climbs) {
    for (const p of c.points) eles.push(p.ele);
  }
  if (eles.length < 2) {
    return <div className="project-card-thumb-empty mono">empty</div>;
  }
  let min = Infinity;
  let max = -Infinity;
  for (const e of eles) {
    if (e < min) min = e;
    if (e > max) max = e;
  }
  const range = Math.max(1, max - min);
  const step = Math.max(1, Math.floor(eles.length / W));
  const samples: number[] = [];
  for (let i = 0; i < eles.length; i += step) samples.push(eles[i]);
  let path = '';
  let area = `M 0 ${H} `;
  for (let i = 0; i < samples.length; i++) {
    const x = (i / Math.max(1, samples.length - 1)) * W;
    const y = H - 4 - ((samples[i] - min) / range) * (H - 8);
    path += `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)} `;
    area += `L ${x.toFixed(1)} ${y.toFixed(1)} `;
  }
  area += `L ${W} ${H} Z`;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="project-card-thumb-svg"
    >
      <path d={area} fill="rgba(255, 95, 31, 0.18)" />
      <path d={path} fill="none" stroke="#fff200" strokeWidth="1.5" />
    </svg>
  );
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

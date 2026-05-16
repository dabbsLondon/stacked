import { useEffect, useMemo, useState } from 'react';
import type { Bridge, Climb, CutSource, Mode, Slice } from './types';
import { parseGpx, writeGpx } from './engine/gpx';
import { buildStitch } from './engine/stitch';
import { buildProfile, buildProfileFromPlan } from './engine/profile';
import { extractSlice } from './engine/cut';
import { detectClimbs } from './engine/detect';
import { DropZone } from './components/DropZone';
import { ClimbList } from './components/ClimbList';
import { Totals } from './components/Totals';
import { Map } from './components/Map';
import { ElevationChart } from './components/ElevationChart';
import { SliceList } from './components/SliceList';
import { SliceDetail } from './components/SliceDetail';
import { ProjectMenu } from './components/ProjectMenu';
import { HomeView } from './components/HomeView';
import { BridgeDefaultsPanel } from './components/BridgeDefaults';
import { ThreeDView } from './components/ThreeDView';
import {
  DEFAULT_BRIDGE,
  deleteProject,
  duplicateProject,
  emptySnapshot,
  listProjects,
  loadWorking,
  saveProject,
  saveWorking,
  type BridgeDefaults,
  type ProjectSnapshot,
} from './engine/projects';

export default function App() {
  // Restore working set on first render so a refresh doesn't lose work.
  const initial = useMemo<ProjectSnapshot>(
    () => loadWorking() ?? emptySnapshot(),
    [],
  );

  const [mode, setMode] = useState<Mode>(initial.mode);

  // View: 'home' (project picker) or 'editor' (working area).
  const initialHasData =
    initial.stitch.climbs.length > 0 || initial.cut.sources.length > 0;
  const [view, setView] = useState<'home' | 'editor'>(
    initialHasData ? 'editor' : 'home',
  );

  // Stitch state
  const [climbs, setClimbs] = useState<Climb[]>(initial.stitch.climbs);
  const [bridges, setBridges] = useState<(Bridge | null)[]>(
    initial.stitch.bridges,
  );
  const [bridgeDefaults, setBridgeDefaults] = useState<BridgeDefaults>(
    initial.stitch.bridgeDefaults ?? { ...DEFAULT_BRIDGE },
  );
  const [error, setError] = useState<string | null>(null);
  const [threeDOpen, setThreeDOpen] = useState(false);
  const [threeDOverride, setThreeDOverride] = useState<{
    points: Climb['points'];
    title: string;
  } | null>(null);

  // Cut state — multiple sources, each with its own slices.
  const [cutSources, setCutSources] = useState<CutSource[]>(
    initial.cut.sources,
  );
  const [activeSourceId, setActiveSourceId] = useState<string | null>(
    initial.cut.activeSourceId,
  );
  const [activeSliceId, setActiveSliceId] = useState<string | null>(
    initial.cut.activeSliceId,
  );
  const [cutError, setCutError] = useState<string | null>(null);

  const activeSource =
    cutSources.find((s) => s.id === activeSourceId) ?? null;
  const cutSource = activeSource?.climb ?? null;
  const slices = activeSource?.slices ?? [];

  // Projects
  const [projectId, setProjectId] = useState<string>(initial.id);
  const [projectName, setProjectName] = useState<string>(initial.name);
  const [savedProjects, setSavedProjects] = useState<ProjectSnapshot[]>(() =>
    listProjects(),
  );
  // Track the last-saved snapshot to detect "dirty" state.
  const [lastSavedKey, setLastSavedKey] = useState<string>(snapshotKey(initial));

  // Keep bridges array length in sync with climbs.length - 1.
  useEffect(() => {
    setBridges((prev) => {
      const target = Math.max(0, climbs.length - 1);
      if (prev.length === target) return prev;
      const next = prev.slice(0, target);
      while (next.length < target) next.push(null);
      return next;
    });
  }, [climbs.length]);

  const stitchPlan = useMemo(
    () => buildStitch(climbs, bridges),
    [climbs, bridges],
  );
  const stitched = stitchPlan.points;
  const stitchProfile = useMemo(
    () => buildProfileFromPlan(stitchPlan),
    [stitchPlan],
  );

  function addBridge(gapIdx: number) {
    setBridges((b) => {
      const next = b.slice();
      next[gapIdx] = {
        id: crypto.randomUUID(),
        lengthKm: bridgeDefaults.lengthKm,
        gradient: bridgeDefaults.gradient,
      };
      return next;
    });
  }

  function applyBridgeDefaultsToAll() {
    setBridges((b) =>
      b.map((bridge) =>
        bridge
          ? {
              ...bridge,
              lengthKm: bridgeDefaults.lengthKm,
              gradient: bridgeDefaults.gradient,
            }
          : bridge,
      ),
    );
  }

  function addBridgesEverywhere() {
    setBridges((b) =>
      b.map((bridge) =>
        bridge ??
        {
          id: crypto.randomUUID(),
          lengthKm: bridgeDefaults.lengthKm,
          gradient: bridgeDefaults.gradient,
        },
      ),
    );
  }

  function removeAllBridges() {
    setBridges((b) => b.map(() => null));
  }
  function updateBridge(gapIdx: number, patch: Partial<Bridge>) {
    setBridges((b) => {
      const cur = b[gapIdx];
      if (!cur) return b;
      const next = b.slice();
      next[gapIdx] = { ...cur, ...patch };
      return next;
    });
  }
  function removeBridge(gapIdx: number) {
    setBridges((b) => {
      const next = b.slice();
      next[gapIdx] = null;
      return next;
    });
  }

  // Current state as a snapshot for persistence.
  const currentSnapshot: ProjectSnapshot = {
    id: projectId,
    name: projectName,
    createdAt: initial.createdAt,
    updatedAt: Date.now(),
    mode,
    stitch: { climbs, bridges, bridgeDefaults },
    cut: { sources: cutSources, activeSourceId, activeSliceId },
  };
  const currentKey = snapshotKey(currentSnapshot);
  const isDirty = currentKey !== lastSavedKey;

  // Autosave the working set on every change (debounced via rAF).
  useEffect(() => {
    const handle = requestAnimationFrame(() => saveWorking(currentSnapshot));
    return () => cancelAnimationFrame(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey]);

  function loadSnapshot(p: ProjectSnapshot) {
    setProjectId(p.id);
    setProjectName(p.name);
    setMode(p.mode);
    setClimbs(p.stitch.climbs);
    setBridges(p.stitch.bridges);
    setBridgeDefaults(p.stitch.bridgeDefaults ?? { ...DEFAULT_BRIDGE });
    setCutSources(p.cut.sources);
    setActiveSourceId(p.cut.activeSourceId);
    setActiveSliceId(p.cut.activeSliceId);
    setError(null);
    setCutError(null);
    setLastSavedKey(snapshotKey(p));
  }

  function handleNewProject() {
    const fresh = emptySnapshot('untitled');
    loadSnapshot(fresh);
    setView('editor');
  }

  function handleNewProjectInMode(targetMode: Mode) {
    const fresh = emptySnapshot('untitled');
    loadSnapshot({ ...fresh, mode: targetMode });
    setView('editor');
  }

  function openProjectFromHome(p: ProjectSnapshot) {
    loadSnapshot(p);
    setView('editor');
  }

  function goHome() {
    setView('home');
  }

  const workingHasData = climbs.length > 0 || cutSources.length > 0;

  function handleSaveAs(name: string) {
    const id = crypto.randomUUID();
    const snap: ProjectSnapshot = {
      ...currentSnapshot,
      id,
      name,
      createdAt: Date.now(),
    };
    saveProject(snap);
    setSavedProjects(listProjects());
    setProjectId(id);
    setProjectName(name);
    setLastSavedKey(snapshotKey(snap));
  }

  function handleRename(name: string) {
    setProjectName(name);
    // If this project is already saved, update its stored copy.
    if (savedProjects.find((p) => p.id === projectId)) {
      const snap: ProjectSnapshot = { ...currentSnapshot, name };
      saveProject(snap);
      setSavedProjects(listProjects());
      setLastSavedKey(snapshotKey(snap));
    }
  }

  function handleDelete(id: string) {
    deleteProject(id);
    setSavedProjects(listProjects());
    if (id === projectId) {
      const fresh = emptySnapshot('untitled');
      loadSnapshot(fresh);
    }
  }

  function handleDuplicate(source: ProjectSnapshot) {
    const proposed = `${source.name} (copy)`;
    const name = prompt('Duplicate as:', proposed);
    if (!name || !name.trim()) return;
    const dup = duplicateProject(source, name.trim());
    setSavedProjects(listProjects());
    // Switch to the new project so the user can immediately edit it.
    loadSnapshot(dup);
    setView('editor');
  }

  function handleSaveCurrent() {
    // If named (already in saved list), overwrite. Else prompt via SaveAs.
    if (savedProjects.find((p) => p.id === projectId)) {
      saveProject(currentSnapshot);
      setSavedProjects(listProjects());
      setLastSavedKey(currentKey);
    } else {
      handleSaveAs(projectName || 'my project');
    }
  }

  // For cut mode we feed the source through buildProfile as a single climb so
  // the chart gets the same bar/gradient treatment.
  const cutProfile = useMemo(
    () => (cutSource ? buildProfile(cutSource.points, [cutSource]) : null),
    [cutSource],
  );

  async function handleStitchFiles(files: FileList) {
    setError(null);
    const newClimbs: Climb[] = [];
    const failures: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const text = await file.text();
        const fallback = file.name.replace(/\.gpx$/i, '');
        const climb = parseGpx(text, fallback);
        newClimbs.push(climb);
      } catch (e) {
        failures.push(`${file.name}: ${(e as Error).message}`);
      }
    }
    if (newClimbs.length) setClimbs((c) => [...c, ...newClimbs]);
    if (failures.length) setError(failures.join('\n'));
  }

  async function handleCutFile(files: FileList) {
    setCutError(null);
    const failures: string[] = [];
    const added: CutSource[] = [];
    for (const file of Array.from(files)) {
      try {
        const text = await file.text();
        const fallback = file.name.replace(/\.gpx$/i, '');
        const climb = parseGpx(text, fallback);
        added.push({ id: climb.id, climb, slices: [] });
      } catch (e) {
        failures.push(`${file.name}: ${(e as Error).message}`);
      }
    }
    if (added.length) {
      setCutSources((srcs) => [...srcs, ...added]);
      setActiveSourceId(added[added.length - 1].id);
      setActiveSliceId(null);
    }
    if (failures.length) setCutError(failures.join('\n'));
  }

  function setSlicesForActive(updater: (prev: Slice[]) => Slice[]) {
    setCutSources((srcs) =>
      srcs.map((s) =>
        s.id === activeSourceId ? { ...s, slices: updater(s.slices) } : s,
      ),
    );
  }

  function removeCutSource(id: string) {
    setCutSources((srcs) => srcs.filter((s) => s.id !== id));
    if (id === activeSourceId) {
      const remaining = cutSources.filter((s) => s.id !== id);
      setActiveSourceId(remaining[0]?.id ?? null);
      setActiveSliceId(null);
    }
  }

  function removeClimb(id: string) {
    setClimbs((c) => c.filter((x) => x.id !== id));
  }

  function moveClimb(id: string, dir: -1 | 1) {
    setClimbs((c) => {
      const idx = c.findIndex((x) => x.id === id);
      if (idx === -1) return c;
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= c.length) return c;
      const next = c.slice();
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next;
    });
  }

  function downloadGpx(points: Climb['points'], name: string) {
    const xml = writeGpx(points, name);
    const blob = new Blob([xml], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sanitizeFilename(name)}.gpx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleStitchExport() {
    if (climbs.length === 0) return;
    const trimmed = projectName.trim();
    const fallback =
      climbs.length === 1
        ? climbs[0].name
        : `stacked-${climbs.map((c) => c.name).join('-').slice(0, 60)}`;
    const name = trimmed && trimmed !== 'untitled' ? trimmed : fallback;
    downloadGpx(stitched, name);
  }

  function handleSliceExport(slice: Slice) {
    if (!cutSource) return;
    try {
      const clip = extractSlice(cutSource, slice.kmStart, slice.kmEnd, slice.name);
      downloadGpx(clip.points, slice.name);
    } catch (e) {
      setCutError(`${slice.name}: ${(e as Error).message}`);
    }
  }

  function handleCutExportAll() {
    let total = 0;
    for (const src of cutSources) {
      for (const s of src.slices) {
        try {
          const clip = extractSlice(src.climb, s.kmStart, s.kmEnd, s.name);
          downloadGpx(clip.points, s.name);
          total++;
        } catch {
          // skip degenerate
        }
      }
    }
    if (total === 0) setCutError('Nothing to export — no slices yet.');
  }

  function addSlice(kmStart: number, kmEnd: number) {
    if (!cutSource) return;
    const id = crypto.randomUUID();
    const baseName = cutSource.name;
    const nextNum = slices.length + 1;
    const name = `${baseName} #${nextNum}`;
    setSlicesForActive((s) => [...s, { id, name, kmStart, kmEnd }]);
    setActiveSliceId(id);
  }

  function renameSlice(id: string, name: string) {
    setSlicesForActive((s) =>
      s.map((x) => (x.id === id ? { ...x, name } : x)),
    );
  }

  function removeSlice(id: string) {
    setSlicesForActive((s) => s.filter((x) => x.id !== id));
    if (activeSliceId === id) setActiveSliceId(null);
  }

  function updateSliceRange(id: string, kmStart: number, kmEnd: number) {
    setSlicesForActive((s) =>
      s.map((x) => (x.id === id ? { ...x, kmStart, kmEnd } : x)),
    );
  }

  function autoDetectClimbs() {
    if (!cutSource) return;
    const found = detectClimbs(cutSource);
    const baseName = cutSource.name;
    const next: Slice[] = found.map((c, i) => ({
      id: crypto.randomUUID(),
      name: `${baseName} climb ${i + 1}`,
      kmStart: c.kmStart,
      kmEnd: c.kmEnd,
    }));
    setSlicesForActive(() => next);
    setActiveSliceId(null);
    if (next.length === 0) {
      setCutError(
        'No climbs detected (looking for sustained ≥5% sections, ≥500m, ≥50m ascent).',
      );
    } else {
      setCutError(null);
    }
  }

  function sendSlicesToSplicer() {
    const newClimbs: Climb[] = [];
    for (const src of cutSources) {
      for (const s of src.slices) {
        try {
          newClimbs.push(
            extractSlice(src.climb, s.kmStart, s.kmEnd, s.name),
          );
        } catch {
          // skip degenerate
        }
      }
    }
    if (newClimbs.length === 0) return;
    const merged = [...climbs, ...newClimbs];
    const nextBridges = bridges.slice();
    while (nextBridges.length < merged.length - 1) {
      nextBridges.push({
        id: crypto.randomUUID(),
        lengthKm: bridgeDefaults.lengthKm,
        gradient: bridgeDefaults.gradient,
      });
    }
    setClimbs(merged);
    setBridges(nextBridges);
    setMode('stitch');
  }

  // Total slice count across all sources (used for the SPLICE button).
  const totalSliceCount = cutSources.reduce(
    (n, s) => n + s.slices.length,
    0,
  );

  function resetCut() {
    setCutSources([]);
    setActiveSourceId(null);
    setActiveSliceId(null);
    setCutError(null);
  }

  // Derive per-slice stats / points by extracting once per call. Cheap for the
  // handful of slices we typically render.
  function sliceMetrics(s: Slice) {
    if (!cutSource) return { km: 0, asc: 0, grad: 0 };
    try {
      const c = extractSlice(cutSource, s.kmStart, s.kmEnd, s.name);
      return { km: c.distanceKm, asc: c.ascentM, grad: c.avgGradient };
    } catch {
      return { km: 0, asc: 0, grad: 0 };
    }
  }

  function slicePoints(s: Slice) {
    if (!cutSource) return [];
    try {
      return extractSlice(cutSource, s.kmStart, s.kmEnd, s.name).points;
    } catch {
      return [];
    }
  }

  const activeSlice = activeSliceId
    ? slices.find((s) => s.id === activeSliceId) ?? null
    : null;
  const activeSliceIndex = activeSlice
    ? slices.findIndex((s) => s.id === activeSlice.id)
    : -1;

  const headerExportDisabled =
    mode === 'stitch' ? climbs.length === 0 : totalSliceCount === 0;

  if (view === 'home') {
    return (
      <HomeView
        projects={savedProjects}
        workingHasData={workingHasData}
        workingName={projectName}
        isDirty={isDirty}
        onOpen={openProjectFromHome}
        onNew={handleNewProject}
        onNewIn={handleNewProjectInMode}
        onDelete={handleDelete}
        onDuplicate={handleDuplicate}
        onContinue={() => setView('editor')}
      />
    );
  }

  return (
    <div className="app">
      <header className="header">
        <button
          className="header-home-btn mono"
          onClick={goHome}
          title="back to projects"
        >
          ← PROJECTS
        </button>
        <div className="brand">
          STACKED<span className="brand-dot">.</span>
        </div>
        <ProjectMenu
          currentName={projectName}
          isDirty={isDirty}
          projects={savedProjects}
          onLoad={loadSnapshot}
          onSaveAs={handleSaveAs}
          onNew={handleNewProject}
          onDelete={handleDelete}
          onDuplicate={handleDuplicate}
          onRename={handleRename}
        />
        <div className="mode-toggle mono">
          <button
            className={`mode-btn ${mode === 'stitch' ? 'mode-active' : ''}`}
            onClick={() => setMode('stitch')}
          >
            STITCH
          </button>
          <button
            className={`mode-btn ${mode === 'cut' ? 'mode-active' : ''}`}
            onClick={() => setMode('cut')}
          >
            CUT
          </button>
        </div>
        <div className="header-actions">
          <button
            className="btn"
            onClick={() => setThreeDOpen(true)}
            disabled={
              mode === 'stitch'
                ? climbs.length === 0
                : !cutSource
            }
            title="open 3D view"
          >
            🌐 3D
          </button>
          <button
            className={`btn ${isDirty ? 'btn-save-dirty' : 'btn-save-clean'}`}
            onClick={handleSaveCurrent}
            disabled={!isDirty && savedProjects.some((p) => p.id === projectId)}
            title={isDirty ? 'save changes' : 'all changes saved'}
          >
            {isDirty
              ? savedProjects.some((p) => p.id === projectId)
                ? '💾 SAVE'
                : '💾 SAVE PROJECT'
              : '✓ SAVED'}
          </button>
          <button
            className="btn"
            onClick={() => {
              if (mode === 'stitch') {
                setClimbs([]);
                setBridges([]);
                setBridgeDefaults({ ...DEFAULT_BRIDGE });
                setError(null);
              } else {
                resetCut();
              }
            }}
            disabled={
              mode === 'stitch'
                ? climbs.length === 0
                : !cutSource && slices.length === 0
            }
          >
            RESET
          </button>
          <button
            className="btn btn-primary"
            onClick={
              mode === 'stitch' ? handleStitchExport : handleCutExportAll
            }
            disabled={headerExportDisabled}
          >
            {mode === 'stitch' ? 'EXPORT' : 'EXPORT ALL'}
          </button>
        </div>
      </header>
      <main className="main">
        <aside className="rail">
          {mode === 'stitch' ? (
            <>
              <DropZone onFiles={handleStitchFiles} />
              {error && <div className="error mono">{error}</div>}
              <BridgeDefaultsPanel
                defaults={bridgeDefaults}
                bridgeCount={bridges.filter((b) => b !== null).length}
                gapCount={Math.max(0, climbs.length - 1)}
                onChange={setBridgeDefaults}
                onApplyToAll={applyBridgeDefaultsToAll}
                onAddEverywhere={addBridgesEverywhere}
                onRemoveAll={removeAllBridges}
              />
              <ClimbList
                climbs={climbs}
                bridges={bridges}
                onRemove={removeClimb}
                onMove={moveClimb}
                onOpen3D={(id) => {
                  const c = climbs.find((x) => x.id === id);
                  if (!c) return;
                  setThreeDOverride({ points: c.points, title: c.name });
                  setThreeDOpen(true);
                }}
                onAddBridge={addBridge}
                onUpdateBridge={updateBridge}
                onRemoveBridge={removeBridge}
              />
              <Totals climbs={climbs} bridges={bridges} />
            </>
          ) : (
            <>
              <DropZone onFiles={handleCutFile} />
              {cutError && <div className="error mono">{cutError}</div>}
              {cutSources.length > 0 && (
                <div className="cut-sources">
                  <div className="mono cut-sources-label">
                    SOURCES ({cutSources.length})
                  </div>
                  <ul className="cut-source-tabs">
                    {cutSources.map((src) => {
                      const active = src.id === activeSourceId;
                      return (
                        <li
                          key={src.id}
                          className={`cut-source-tab ${active ? 'cut-source-tab-active' : ''}`}
                          onClick={() => {
                            setActiveSourceId(src.id);
                            setActiveSliceId(null);
                          }}
                        >
                          <div className="cut-source-tab-body">
                            <div className="cut-source-tab-name">
                              {src.climb.name}
                            </div>
                            <div className="mono cut-source-tab-stats">
                              {src.climb.distanceKm.toFixed(1)}km · +
                              {Math.round(src.climb.ascentM)}m ·{' '}
                              {src.slices.length} slices
                            </div>
                          </div>
                          <button
                            className="climb-btn climb-btn-del"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (
                                confirm(`Remove source "${src.climb.name}"?`)
                              ) {
                                removeCutSource(src.id);
                              }
                            }}
                            title="remove this source"
                          >
                            ×
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {cutSource && (
                <div className="cut-actions">
                  <button
                    className="btn cut-action-btn"
                    onClick={autoDetectClimbs}
                    title="auto-detect climbs in the active source"
                  >
                    ⚡ DETECT CLIMBS
                  </button>
                  <button
                    className="btn btn-primary cut-action-btn"
                    onClick={sendSlicesToSplicer}
                    disabled={totalSliceCount === 0}
                    title="send all slices to the splicer"
                  >
                    → SPLICE ({totalSliceCount})
                  </button>
                </div>
              )}
              <SliceList
                slices={slices}
                activeId={activeSliceId}
                onActivate={setActiveSliceId}
                onRename={renameSlice}
                onRemove={removeSlice}
                onExport={(id) => {
                  const s = slices.find((x) => x.id === id);
                  if (s) handleSliceExport(s);
                }}
                onOpen3D={(id) => {
                  const s = slices.find((x) => x.id === id);
                  if (!s || !cutSource) return;
                  try {
                    const c = extractSlice(
                      cutSource,
                      s.kmStart,
                      s.kmEnd,
                      s.name,
                    );
                    setActiveSliceId(id);
                    setThreeDOverride({ points: c.points, title: s.name });
                    setThreeDOpen(true);
                  } catch {
                    // ignore degenerate slice
                  }
                }}
                distanceFor={(s) => sliceMetrics(s).km}
                ascentFor={(s) => sliceMetrics(s).asc}
                gradientFor={(s) => sliceMetrics(s).grad}
                pointsFor={slicePoints}
              />
            </>
          )}
        </aside>
        <section className="preview">
          {mode === 'stitch' ? (
            climbs.length === 0 ? (
              <div className="preview-placeholder">
                <div className="mono preview-label">MAP + ELEVATION CHART</div>
                <div className="mono preview-sub">drop a GPX to begin</div>
              </div>
            ) : (
              <>
                <ElevationChart profile={stitchProfile} />
                <div className="map-floating">
                  <Map points={stitched} profile={stitchProfile} />
                </div>
              </>
            )
          ) : !cutSource || !cutProfile ? (
            <div className="preview-placeholder">
              <div className="mono preview-label">CUT MODE</div>
              <div className="mono preview-sub">
                {cutSources.length === 0
                  ? 'drop a long ride to slice'
                  : 'pick a source from the rail to start slicing'}
              </div>
            </div>
          ) : (
            <>
              <ElevationChart
                profile={cutProfile}
                slices={slices}
                activeSliceId={activeSliceId}
                onCreateSlice={addSlice}
                onActivateSlice={setActiveSliceId}
                onUpdateSliceRange={updateSliceRange}
              />
              <div className="map-floating">
                <Map
                  points={cutSource.points}
                  profile={cutProfile}
                  slices={slices}
                  activeSliceId={activeSliceId}
                  slicePointsFor={slicePoints}
                />
              </div>
              {activeSlice && cutSource && (
                <SliceDetail
                  slice={activeSlice}
                  index={activeSliceIndex}
                  source={cutSource}
                  onRename={renameSlice}
                  onUpdateRange={updateSliceRange}
                  onRemove={removeSlice}
                  onExport={(id) => {
                    const s = slices.find((x) => x.id === id);
                    if (s) handleSliceExport(s);
                  }}
                  onOpen3D={(id) => {
                    setActiveSliceId(id);
                    setThreeDOpen(true);
                  }}
                  onClose={() => setActiveSliceId(null)}
                />
              )}
            </>
          )}
        </section>
      </main>
      {threeDOpen && (() => {
        let points: Climb['points'] = [];
        let title = '';
        if (threeDOverride) {
          points = threeDOverride.points;
          title = threeDOverride.title;
        } else if (mode === 'stitch') {
          points = stitched;
          title = projectName || 'stacked route';
        } else if (activeSlice && cutSource) {
          try {
            const c = extractSlice(
              cutSource,
              activeSlice.kmStart,
              activeSlice.kmEnd,
              activeSlice.name,
            );
            points = c.points;
            title = activeSlice.name;
          } catch {
            points = cutSource.points;
            title = cutSource.name;
          }
        } else if (cutSource) {
          points = cutSource.points;
          title = cutSource.name;
        }
        if (points.length < 2) return null;
        return (
          <ThreeDView
            points={points}
            title={title}
            onClose={() => {
              setThreeDOpen(false);
              setThreeDOverride(null);
            }}
          />
        );
      })()}
    </div>
  );
}

function sanitizeFilename(s: string): string {
  return s.replace(/[^a-z0-9_\-\.]+/gi, '_').slice(0, 80) || 'gpx';
}

// Hash-ish key for detecting when a snapshot has changed (ignores updatedAt).
function snapshotKey(p: ProjectSnapshot): string {
  return JSON.stringify({
    id: p.id,
    name: p.name,
    mode: p.mode,
    stitch: p.stitch,
    cut: p.cut,
  });
}

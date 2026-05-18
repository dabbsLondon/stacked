import { useEffect, useMemo, useRef, useState } from 'react';
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
import { Login } from './components/Login';
import { AdminView } from './components/AdminView';
import { useAuth } from './hooks/useAuth';
import {
  BACKEND_ENABLED,
  dedupeRemoteByName,
  deleteRemoteProject,
  listAllProjectsAdmin,
  listPublicProjects,
  listRemoteProjects,
  saveRemoteProject,
  setProjectPublic,
  signOut,
} from './engine/backend';
import {
  DEFAULT_BRIDGE,
  clearAllLocalProjects,
  dedupeLocalProjects,
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
  const auth = useAuth();

  // Restore working set on first render so a refresh doesn't lose work.
  const initial = useMemo<ProjectSnapshot>(
    () => loadWorking() ?? emptySnapshot(),
    [],
  );

  const [mode, setMode] = useState<Mode>(initial.mode);

  // View: 'home' (project picker) or 'editor' (working area).
  const initialHasData =
    initial.stitch.climbs.length > 0 || initial.cut.sources.length > 0;
  const [view, setView] = useState<'home' | 'editor' | 'admin' | 'library'>(
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
  // Floating map starts hidden so it stops obscuring the elevation chart.
  // Toggle via the 🗺️ MAP button in the header.
  const [mapOpen, setMapOpen] = useState(false);
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

  // Ref mirrors projectId for callbacks that close over an older render.
  // Used by pushAndMigrate so the post-await branch can compare against the
  // live current-project id rather than the stale closure value.
  const projectIdRef = useRef<string>(initial.id);
  useEffect(() => {
    projectIdRef.current = projectId;
  }, [projectId]);

  // Serialise outbound PB pushes. Two rapid Save clicks used to fire two
  // in-flight saveRemoteProject calls with the same (still-unmigrated) UUID
  // id, and PocketBase happily CREATEd both → duplicate rows. Chaining each
  // push onto the previous one means click 2 only runs after click 1 has
  // already migrated the id to a PB id, so it falls through to UPDATE.
  const pushQueueRef = useRef<Promise<unknown>>(Promise.resolve());

  // Push a snapshot to PocketBase and migrate the local id to PB's
  // generated id when needed. Centralising this here is what stops the
  // "every save creates another PB row" duplication: PocketBase rejects
  // every custom id, so our UUIDs always trigger CREATE; if we never
  // adopt the returned PB id, the next save creates another fresh row.
  async function pushAndMigrate(
    snap: ProjectSnapshot,
  ): Promise<ProjectSnapshot> {
    if (auth.kind !== 'signed-in') return snap;
    // Snapshot whether this is "the current project" *at call time* — used
    // later to decide whether to re-read the live id post-await (an earlier
    // queued push may have migrated us in the meantime).
    const wasCurrentAtCallTime = projectIdRef.current === snap.id;
    const job = pushQueueRef.current.then(async (): Promise<ProjectSnapshot> => {
      const liveId = projectIdRef.current;
      const toPush =
        wasCurrentAtCallTime && liveId !== snap.id
          ? { ...snap, id: liveId }
          : snap;
      const row = await saveRemoteProject(toPush);
      if (!row) return toPush;
      if (row.id === toPush.id) return toPush;
      deleteProject(toPush.id);
      const migrated: ProjectSnapshot = { ...toPush, id: row.id };
      saveProject(migrated);
      if (projectIdRef.current === toPush.id) {
        projectIdRef.current = row.id;
        setProjectId(row.id);
        // Re-stamp lastSavedKey against the migrated snapshot so the SAVE
        // button doesn't immediately flip back to "dirty" purely because
        // the id changed under us.
        setLastSavedKey(snapshotKey(migrated));
      }
      setSavedProjects(listProjects());
      return migrated;
    });
    pushQueueRef.current = job.catch(() => undefined);
    return job;
  }

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

  // (autosave to PocketBase intentionally removed — it was racing with
  // React 18 Strict Mode and creating duplicate records. Explicit Save
  // and the 🔄 SYNC button are what write to PB now.)

  // On sign-in, always return to the project dashboard. Avoids landing the
  // user in mid-edit on an autosaved working set when they just wanted to
  // pick a project from their list.
  useEffect(() => {
    if (auth.kind === 'signed-in') setView('home');
  }, [auth.kind]);

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
    projectIdRef.current = id;
    setProjectName(name);
    setLastSavedKey(snapshotKey(snap));
    if (auth.kind === 'signed-in') void pushAndMigrate(snap);
  }

  function handleRename(name: string) {
    setProjectName(name);
    // If this project is already saved, update its stored copy.
    if (savedProjects.find((p) => p.id === projectId)) {
      const snap: ProjectSnapshot = { ...currentSnapshot, name };
      saveProject(snap);
      setSavedProjects(listProjects());
      setLastSavedKey(snapshotKey(snap));
      if (auth.kind === 'signed-in') void pushAndMigrate(snap);
    }
  }

  function handleDelete(id: string) {
    deleteProject(id);
    if (auth.kind === 'signed-in') void deleteRemoteProject(id);
    setSavedProjects(listProjects());
    if (id === projectId) {
      const fresh = emptySnapshot('untitled');
      loadSnapshot(fresh);
    }
  }

  async function handleTogglePublic(project: ProjectSnapshot) {
    if (auth.kind !== 'signed-in') {
      alert('Sign in to publish projects.');
      return;
    }
    const nextPublic = !project.isPublic;
    // Optimistic local update — also reflected back to PB.
    const updated: ProjectSnapshot = { ...project, isPublic: nextPublic };
    saveProject(updated);
    setSavedProjects(listProjects());
    // Make sure the project has been pushed (and the local id migrated to a
    // PB-shaped id) before flipping its visibility — setProjectPublic only
    // works on real PB record ids.
    const migrated = await pushAndMigrate(updated);
    const ok = await setProjectPublic(migrated.id, nextPublic);
    if (!ok) {
      // Revert if the server refused (e.g., not owner).
      saveProject({ ...migrated, isPublic: project.isPublic ?? false });
      setSavedProjects(listProjects());
      alert('Could not change visibility on that project.');
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
    if (auth.kind === 'signed-in') void pushAndMigrate(dup);
  }

  // Reconcile local ↔ remote: push any local-only projects up, pull newer
  // remote projects down. Triggered on sign-in AND exposed via a manual
  // "sync" button so users can re-run it whenever local + remote drift.
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  async function purgeLocalCache(): Promise<void> {
    if (auth.kind !== 'signed-in') {
      alert("Sign in first — PocketBase needs to have your projects before we can safely wipe the local cache.");
      return;
    }
    // Belt-and-braces: push everything up before deleting locally.
    await reconcileWithRemote();
    if (!confirm("Wipe every project + working set from this browser's localStorage? PocketBase keeps them — they'll re-download on the next sync.")) {
      return;
    }
    clearAllLocalProjects();
    // Re-pull from PB so the home grid stays accurate.
    await reconcileWithRemote();
    setSyncMessage('local cache wiped — projects live in PocketBase now');
  }

  async function reconcileWithRemote(): Promise<void> {
    if (!BACKEND_ENABLED || auth.kind !== 'signed-in') return;
    setSyncing(true);
    setSyncMessage(null);
    try {
      // Step 1a: dedupe local by name (earlier broken sync passes wrote
      // multiple entries per project — collapse them to the newest before
      // pushing anything up).
      const { removed: localRemoved } = dedupeLocalProjects();
      // Step 1b: dedupe remote by name — delete server-side duplicates that
      // accumulated when every Save used to create a fresh PB record. Keeps
      // the most-recently-updated row per name; the rest are deleted.
      const remoteRemoved = await dedupeRemoteByName();

      const local = listProjects();
      const remote = await listRemoteProjects();
      console.log('[sync] local projects:', local.length, local.map((p) => p.name));
      console.log('[sync] remote projects:', remote.length, remote.map((r) => r.name));
      if (localRemoved) console.log('[sync] removed', localRemoved, 'local duplicates');
      if (remoteRemoved) console.log('[sync] removed', remoteRemoved, 'remote duplicates');

      const remoteById = new globalThis.Map<string, typeof remote[number]>(
        remote.map((r) => [r.id, r]),
      );
      // Name-based fallback: after dedupe, each name maps to at most one
      // remote row. Lets an unmigrated UUID local find its PB twin without
      // pushing yet another copy.
      const remoteByName = new globalThis.Map<string, typeof remote[number]>(
        remote.map((r) => [r.name, r]),
      );

      let pushed = 0;
      let pulled = 0;
      const matchedRemoteIds = new globalThis.Set<string>();
      const failures: string[] = [];

      function migrateLocalId(lp: ProjectSnapshot, newId: string) {
        if (lp.id === newId) return;
        deleteProject(lp.id);
        saveProject({ ...lp, id: newId });
        if (projectIdRef.current === lp.id) {
          projectIdRef.current = newId;
          setProjectId(newId);
        }
      }

      for (const lp of local) {
        const r = remoteById.get(lp.id) ?? remoteByName.get(lp.name) ?? null;

        if (!r) {
          // No remote twin — push.
          const row = await saveRemoteProject(lp);
          if (row) {
            pushed++;
            matchedRemoteIds.add(row.id);
            migrateLocalId(lp, row.id);
          } else {
            failures.push(lp.name);
            console.warn('[sync] failed to push', lp.id, lp.name);
          }
          continue;
        }

        matchedRemoteIds.add(r.id);
        // Adopt PB id locally so future syncs match by id.
        migrateLocalId(lp, r.id);

        const rTs = new Date(r.updated_at).getTime();
        if (rTs > lp.updatedAt) {
          saveProject(r.snapshot);
          pulled++;
        } else if (lp.updatedAt > rTs) {
          const row = await saveRemoteProject({ ...lp, id: r.id });
          if (row) pushed++;
        }
      }

      // Remote-only entries: pull them down.
      for (const r of remote) {
        if (matchedRemoteIds.has(r.id)) continue;
        saveProject(r.snapshot);
        pulled++;
      }

      setSavedProjects(listProjects());

      const parts: string[] = [];
      if (localRemoved) parts.push(`deduped ${localRemoved} local`);
      if (remoteRemoved) parts.push(`deduped ${remoteRemoved} remote`);
      parts.push(`local ${listProjects().length}`);
      parts.push(`remote ${remote.length}`);
      if (pushed) parts.push(`↑ ${pushed}`);
      if (pulled) parts.push(`↓ ${pulled}`);
      if (failures.length) parts.push(`✗ ${failures.length}`);
      setSyncMessage(parts.join(' · '));
    } catch (e) {
      setSyncMessage(`sync failed: ${(e as Error).message}`);
      console.warn('[sync] failed', e);
    } finally {
      setSyncing(false);
    }
  }

  // Strict Mode re-runs effects in dev, which under the old code created
  // duplicate PB records. Gate the on-sign-in reconcile with a ref so it
  // runs at most once per signed-in session.
  const reconciledForRef = useRef<string | null>(null);
  useEffect(() => {
    if (auth.kind === 'signed-out') {
      reconciledForRef.current = null;
      return;
    }
    if (auth.kind !== 'signed-in') return;
    if (reconciledForRef.current === auth.userId) return;
    reconciledForRef.current = auth.userId;
    void reconcileWithRemote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.kind]);

  function handleSaveCurrent() {
    // If named (already in saved list), overwrite. Else prompt via SaveAs.
    if (savedProjects.find((p) => p.id === projectId)) {
      saveProject(currentSnapshot);
      setSavedProjects(listProjects());
      setLastSavedKey(currentKey);
      if (auth.kind === 'signed-in') void pushAndMigrate(currentSnapshot);
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

  // Auth gating — once Supabase is configured, only signed-in users see the
  // editor. The 'disabled' branch is the pure-localStorage mode.
  if (auth.kind === 'loading') {
    return (
      <div className="app-splash mono">
        <span className="app-splash-brand">
          STACKED<span className="brand-dot">.</span>
        </span>
        <span className="app-splash-sub">connecting…</span>
      </div>
    );
  }
  if (auth.kind === 'signed-out') {
    return <Login />;
  }

  if (view === 'admin' || view === 'library') {
    const isAdminView = view === 'admin';
    return (
      <AdminView
        title={
          isAdminView ? 'Cut sources · all users' : 'Public library'
        }
        eyebrow={isAdminView ? '// ADMIN VIEW' : '// PUBLIC LIBRARY'}
        emptyMessage={
          isAdminView
            ? 'no projects across the org yet'
            : 'no public projects yet — publish one of yours from the home page to share it here'
        }
        fetcher={isAdminView ? listAllProjectsAdmin : listPublicProjects}
        onClose={() => setView('home')}
        onTogglePublic={
          isAdminView
            ? async (row, nextPublic) => {
                const ok = await setProjectPublic(row.id, nextPublic);
                if (!ok) {
                  alert('Could not change visibility on that project.');
                }
              }
            : undefined
        }
        onPullSource={(climb) => {
          // Drop the whole long ride into the admin's cut workspace so they
          // can slice it themselves.
          const id = crypto.randomUUID();
          const newSource = {
            id,
            climb: { ...climb, id },
            slices: [],
          };
          setCutSources((srcs) => [...srcs, newSource]);
          setActiveSourceId(id);
          setActiveSliceId(null);
          setMode('cut');
          setView('editor');
        }}
        onPullClimb={(climb) => {
          // Add this pre-cut climb to the admin's splicer climbs list.
          const stamped: Climb = { ...climb, id: crypto.randomUUID() };
          setClimbs((cs) => [...cs, stamped]);
          setMode('stitch');
          setView('editor');
        }}
      />
    );
  }

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
        profile={auth.kind === 'signed-in' ? auth.profile : null}
        onSignOut={async () => {
          await signOut();
        }}
        onOpenAdmin={() => setView('admin')}
        onOpenLibrary={
          auth.kind === 'signed-in' ? () => setView('library') : undefined
        }
        onTogglePublic={
          auth.kind === 'signed-in'
            ? (p) => void handleTogglePublic(p)
            : undefined
        }
        onSync={
          auth.kind === 'signed-in' ? () => void reconcileWithRemote() : undefined
        }
        onPurgeLocal={
          auth.kind === 'signed-in' ? () => void purgeLocalCache() : undefined
        }
        syncing={syncing}
        syncMessage={syncMessage}
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
            className={`btn ${mapOpen ? 'btn-toggle-on' : ''}`}
            onClick={() => setMapOpen((o) => !o)}
            disabled={
              mode === 'stitch'
                ? climbs.length === 0
                : !cutSource
            }
            title={mapOpen ? 'hide map' : 'show map'}
          >
            🗺️ MAP
          </button>
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
                {mapOpen && (
                  <div className="map-floating">
                    <button
                      className="map-close mono"
                      onClick={() => setMapOpen(false)}
                      aria-label="close map"
                      title="close map"
                    >
                      ×
                    </button>
                    <Map points={stitched} profile={stitchProfile} />
                  </div>
                )}
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
              {mapOpen && (
                <div className="map-floating">
                  <button
                    className="map-close mono"
                    onClick={() => setMapOpen(false)}
                    aria-label="close map"
                    title="close map"
                  >
                    ×
                  </button>
                  <Map
                    points={cutSource.points}
                    profile={cutProfile}
                    slices={slices}
                    activeSliceId={activeSliceId}
                    slicePointsFor={slicePoints}
                  />
                </div>
              )}
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

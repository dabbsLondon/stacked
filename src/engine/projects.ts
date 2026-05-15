import type { Bridge, Climb, CutSource, Mode } from '../types';

export interface BridgeDefaults {
  lengthKm: number;
  gradient: number;
}

export const DEFAULT_BRIDGE: BridgeDefaults = { lengthKm: 1, gradient: 0 };

export interface ProjectSnapshot {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  mode: Mode;
  stitch: {
    climbs: Climb[];
    bridges: (Bridge | null)[];
    bridgeDefaults: BridgeDefaults;
  };
  cut: {
    sources: CutSource[];
    activeSourceId: string | null;
    activeSliceId: string | null;
  };
}

// Migrate old project shapes forward.
function migrate(p: unknown): ProjectSnapshot | null {
  if (!p || typeof p !== 'object') return null;
  const raw = p as Record<string, unknown>;
  if (!raw.id || !raw.stitch || !raw.cut) return null;
  const cut = raw.cut as Record<string, unknown>;
  const stitch = raw.stitch as Record<string, unknown>;

  // cut: single-source -> multi-source.
  let nextCut: ProjectSnapshot['cut'];
  if ('source' in cut && !('sources' in cut)) {
    const oldSource = cut.source as Climb | null;
    const oldSlices = (cut.slices as unknown[] | undefined) ?? [];
    nextCut = {
      sources: oldSource
        ? [
            {
              id: oldSource.id,
              climb: oldSource,
              slices: oldSlices as CutSource['slices'],
            },
          ]
        : [],
      activeSourceId: oldSource?.id ?? null,
      activeSliceId:
        (cut.activeSliceId as string | null | undefined) ?? null,
    };
  } else {
    nextCut = cut as unknown as ProjectSnapshot['cut'];
  }

  // stitch.bridgeDefaults: add defaults if missing.
  const nextStitch: ProjectSnapshot['stitch'] = {
    climbs: (stitch.climbs as Climb[]) ?? [],
    bridges: (stitch.bridges as (Bridge | null)[]) ?? [],
    bridgeDefaults:
      (stitch.bridgeDefaults as BridgeDefaults | undefined) ??
      { ...DEFAULT_BRIDGE },
  };

  return {
    ...(raw as unknown as ProjectSnapshot),
    stitch: nextStitch,
    cut: nextCut,
  };
}

const KEY_PROJECTS = 'stacked:projects:v1';
const KEY_WORKING = 'stacked:working:v1';

export function listProjects(): ProjectSnapshot[] {
  try {
    const raw = localStorage.getItem(KEY_PROJECTS);
    if (!raw) return [];
    const list = JSON.parse(raw) as unknown[];
    if (!Array.isArray(list)) return [];
    return list
      .map((x) => migrate(x))
      .filter((x): x is ProjectSnapshot => x !== null);
  } catch {
    return [];
  }
}

function saveProjects(list: ProjectSnapshot[]) {
  try {
    localStorage.setItem(KEY_PROJECTS, JSON.stringify(list));
  } catch (e) {
    console.warn('saveProjects failed', e);
  }
}

export function saveProject(p: ProjectSnapshot) {
  const list = listProjects();
  const idx = list.findIndex((x) => x.id === p.id);
  const updated: ProjectSnapshot = { ...p, updatedAt: Date.now() };
  if (idx >= 0) list[idx] = updated;
  else list.push(updated);
  saveProjects(list);
}

export function deleteProject(id: string) {
  saveProjects(listProjects().filter((p) => p.id !== id));
}

export function emptySnapshot(name = 'untitled'): ProjectSnapshot {
  return {
    id: crypto.randomUUID(),
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    mode: 'stitch',
    stitch: {
      climbs: [],
      bridges: [],
      bridgeDefaults: { ...DEFAULT_BRIDGE },
    },
    cut: { sources: [], activeSourceId: null, activeSliceId: null },
  };
}

export function loadWorking(): ProjectSnapshot | null {
  try {
    const raw = localStorage.getItem(KEY_WORKING);
    if (!raw) return null;
    return migrate(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveWorking(p: ProjectSnapshot) {
  try {
    localStorage.setItem(KEY_WORKING, JSON.stringify(p));
  } catch (e) {
    console.warn('saveWorking failed (quota?)', e);
  }
}

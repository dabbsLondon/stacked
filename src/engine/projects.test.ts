import { beforeEach, describe, expect, it } from 'vitest';
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
  type ProjectSnapshot,
} from './projects';

beforeEach(() => {
  localStorage.clear();
});

describe('emptySnapshot', () => {
  it('returns a fresh project with empty stitch/cut and default bridge', () => {
    const p = emptySnapshot('hello');
    expect(p.name).toBe('hello');
    expect(p.mode).toBe('stitch');
    expect(p.stitch.climbs).toEqual([]);
    expect(p.stitch.bridges).toEqual([]);
    expect(p.stitch.bridgeDefaults).toEqual(DEFAULT_BRIDGE);
    expect(p.cut.sources).toEqual([]);
    expect(p.cut.activeSourceId).toBeNull();
    expect(p.cut.activeSliceId).toBeNull();
    expect(p.id).toMatch(/.+/);
  });
});

describe('listProjects / saveProject / deleteProject', () => {
  it('starts empty when localStorage is empty', () => {
    expect(listProjects()).toEqual([]);
  });

  it('saves and lists projects', () => {
    const p = emptySnapshot('foo');
    saveProject(p);
    const list = listProjects();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('foo');
  });

  it('replaces an existing project with the same id', () => {
    const p = emptySnapshot('foo');
    saveProject(p);
    saveProject({ ...p, name: 'foo-renamed' });
    const list = listProjects();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('foo-renamed');
  });

  it('deletes a project by id', () => {
    const p = emptySnapshot('foo');
    saveProject(p);
    deleteProject(p.id);
    expect(listProjects()).toEqual([]);
  });

  it('ignores corrupt localStorage values', () => {
    localStorage.setItem('stacked:projects:v1', '{not-json');
    expect(listProjects()).toEqual([]);
  });
});

describe('duplicateProject', () => {
  it('clones a project under a new name with a fresh id', () => {
    const orig = emptySnapshot('orig');
    saveProject(orig);
    const dup = duplicateProject(orig, 'orig copy');
    expect(dup.id).not.toBe(orig.id);
    expect(dup.name).toBe('orig copy');
    expect(dup.createdAt).toBeGreaterThanOrEqual(orig.createdAt);
    // Both end up in the listing.
    const list = listProjects();
    expect(list).toHaveLength(2);
    expect(list.map((p) => p.id).sort()).toEqual(
      [orig.id, dup.id].sort(),
    );
  });

  it('falls back to "<name> (copy)" when newName is blank', () => {
    const orig = emptySnapshot('orig');
    const dup = duplicateProject(orig, '   ');
    expect(dup.name).toBe('orig (copy)');
  });

  it('gives bridges and cut-sources fresh ids and clears active selections', () => {
    const orig = emptySnapshot('orig');
    orig.stitch.bridges = [
      { id: 'b1', lengthKm: 1, gradient: 0 },
    ];
    orig.cut.sources = [
      {
        id: 'src1',
        climb: {
          id: 'src1',
          name: 'source',
          points: [
            { lat: 0, lon: 0, ele: 0 },
            { lat: 0.001, lon: 0, ele: 1 },
          ],
          distanceKm: 0.1,
          ascentM: 1,
          avgGradient: 1,
          maxGradient: 1,
          difficulty: 0,
        },
        slices: [{ id: 'sl1', name: 'a', kmStart: 0, kmEnd: 0.05 }],
      },
    ];
    orig.cut.activeSourceId = 'src1';
    orig.cut.activeSliceId = 'sl1';

    const dup = duplicateProject(orig, 'copy');
    expect(dup.stitch.bridges[0]!.id).not.toBe('b1');
    expect(dup.cut.sources[0].id).not.toBe('src1');
    expect(dup.cut.sources[0].slices[0].id).not.toBe('sl1');
    expect(dup.cut.activeSourceId).toBeNull();
    expect(dup.cut.activeSliceId).toBeNull();
    // Original is untouched.
    expect(orig.stitch.bridges[0]!.id).toBe('b1');
  });
});

describe('dedupeLocalProjects', () => {
  it('returns kept list with no change when there are no duplicates', () => {
    const a = emptySnapshot('a');
    const b = emptySnapshot('b');
    saveProject(a);
    saveProject(b);
    const { kept, removed } = dedupeLocalProjects();
    expect(removed).toBe(0);
    expect(kept).toHaveLength(2);
    expect(listProjects()).toHaveLength(2);
  });

  it('keeps the most-recently-updated entry per name', () => {
    const older: ProjectSnapshot = {
      ...emptySnapshot('Same name'),
      id: 'older1234567890',
      updatedAt: 1000,
    };
    const newer: ProjectSnapshot = {
      ...emptySnapshot('Same name'),
      id: 'newer1234567890',
      updatedAt: 2000,
    };
    // saveProject overwrites updatedAt — write the raw list instead.
    localStorage.setItem(
      'stacked:projects:v1',
      JSON.stringify([older, newer]),
    );
    const { kept, removed } = dedupeLocalProjects();
    expect(removed).toBe(1);
    expect(kept).toHaveLength(1);
    // The kept entry should be the one with id `newer...`.
    expect(kept[0].id.startsWith('newer')).toBe(true);
    // And localStorage is now mutated.
    expect(listProjects()).toHaveLength(1);
  });

  it('collapses multiple duplicates across multiple names', () => {
    const rows = [
      { ...emptySnapshot('A'), id: 'a-old-15-chars1', updatedAt: 1 },
      { ...emptySnapshot('A'), id: 'a-new-15-chars1', updatedAt: 5 },
      { ...emptySnapshot('B'), id: 'b-old-15-chars1', updatedAt: 2 },
      { ...emptySnapshot('B'), id: 'b-new-15-chars1', updatedAt: 6 },
      { ...emptySnapshot('C'), id: 'c-only15-chars1', updatedAt: 3 },
    ];
    localStorage.setItem('stacked:projects:v1', JSON.stringify(rows));
    const { kept, removed } = dedupeLocalProjects();
    expect(removed).toBe(2);
    expect(kept).toHaveLength(3);
    const names = kept.map((p) => p.name).sort();
    expect(names).toEqual(['A', 'B', 'C']);
  });
});

describe('clearAllLocalProjects', () => {
  it('wipes both the saved-projects list and the working set', () => {
    saveProject(emptySnapshot('foo'));
    saveWorking(emptySnapshot('working'));
    expect(listProjects()).toHaveLength(1);
    expect(loadWorking()).not.toBeNull();
    clearAllLocalProjects();
    expect(listProjects()).toEqual([]);
    expect(loadWorking()).toBeNull();
  });

  it('is a no-op when there is nothing to clear', () => {
    expect(() => clearAllLocalProjects()).not.toThrow();
    expect(listProjects()).toEqual([]);
  });
});

describe('loadWorking / saveWorking', () => {
  it('round-trips through localStorage', () => {
    const p = emptySnapshot('w');
    saveWorking(p);
    const loaded = loadWorking();
    expect(loaded?.name).toBe('w');
  });

  it('returns null when no working set is stored', () => {
    expect(loadWorking()).toBeNull();
  });
});

describe('project migration', () => {
  it('migrates an old single-source cut shape to the multi-source shape', () => {
    const old = {
      id: 'abc',
      name: 'legacy',
      createdAt: 0,
      updatedAt: 0,
      mode: 'cut',
      stitch: { climbs: [], bridges: [] },
      cut: {
        source: {
          id: 'src',
          name: 'old source',
          points: [
            { lat: 0, lon: 0, ele: 0 },
            { lat: 0.001, lon: 0, ele: 1 },
          ],
          distanceKm: 0.1,
          ascentM: 1,
          avgGradient: 1,
          maxGradient: 1,
          difficulty: 0,
        },
        slices: [
          { id: 's1', name: 'one', kmStart: 0, kmEnd: 0.05 },
        ],
        activeSliceId: 's1',
      },
    };
    localStorage.setItem(
      'stacked:projects:v1',
      JSON.stringify([old]),
    );
    const list = listProjects();
    expect(list).toHaveLength(1);
    const migrated = list[0] as ProjectSnapshot;
    expect(migrated.cut.sources).toHaveLength(1);
    expect(migrated.cut.sources[0].slices).toHaveLength(1);
    expect(migrated.cut.activeSourceId).toBe('src');
    // bridgeDefaults backfilled
    expect(migrated.stitch.bridgeDefaults).toEqual(DEFAULT_BRIDGE);
  });

  it('survives a value with no source and no slices', () => {
    const old = {
      id: 'abc',
      name: 'legacy',
      createdAt: 0,
      updatedAt: 0,
      mode: 'stitch',
      stitch: { climbs: [], bridges: [] },
      cut: {
        source: null,
        slices: [],
        activeSliceId: null,
      },
    };
    localStorage.setItem(
      'stacked:projects:v1',
      JSON.stringify([old]),
    );
    const list = listProjects();
    expect(list).toHaveLength(1);
    expect(list[0].cut.sources).toEqual([]);
  });

  it('drops malformed entries instead of crashing', () => {
    localStorage.setItem(
      'stacked:projects:v1',
      JSON.stringify([{ definitely: 'not a project' }, null]),
    );
    expect(listProjects()).toEqual([]);
  });
});

import { useState } from 'react';
import type { Climb } from './types';
import { parseGpx, writeGpx } from './engine/gpx';
import { stitch } from './engine/stitch';
import { DropZone } from './components/DropZone';
import { ClimbList } from './components/ClimbList';
import { Totals } from './components/Totals';

export default function App() {
  const [climbs, setClimbs] = useState<Climb[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList) {
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

  function handleExport() {
    if (climbs.length === 0) return;
    const points = stitch(climbs);
    const name =
      climbs.length === 1
        ? climbs[0].name
        : `stacked-${climbs.map((c) => c.name).join('-').slice(0, 60)}`;
    const xml = writeGpx(points, name);
    const blob = new Blob([xml], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.gpx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          STACKED<span className="brand-dot">.</span>
        </div>
        <div className="header-actions">
          <button
            className="btn"
            onClick={() => {
              setClimbs([]);
              setError(null);
            }}
            disabled={climbs.length === 0}
          >
            RESET
          </button>
          <button
            className="btn btn-primary"
            onClick={handleExport}
            disabled={climbs.length === 0}
          >
            EXPORT
          </button>
        </div>
      </header>
      <main className="main">
        <aside className="rail">
          <DropZone onFiles={handleFiles} />
          {error && <div className="error mono">{error}</div>}
          <ClimbList climbs={climbs} onRemove={removeClimb} onMove={moveClimb} />
          <Totals climbs={climbs} />
        </aside>
        <section className="preview">
          <div className="preview-placeholder">
            <div className="mono preview-label">MAP + ELEVATION CHART</div>
            <div className="mono preview-sub">coming in iteration 02</div>
          </div>
        </section>
      </main>
    </div>
  );
}

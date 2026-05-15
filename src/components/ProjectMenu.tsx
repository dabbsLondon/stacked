import { useEffect, useRef, useState } from 'react';
import type { ProjectSnapshot } from '../engine/projects';

interface Props {
  currentName: string;
  isDirty: boolean;
  projects: ProjectSnapshot[];
  onLoad: (p: ProjectSnapshot) => void;
  onSaveAs: (name: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (name: string) => void;
}

export function ProjectMenu({
  currentName,
  isDirty,
  projects,
  onLoad,
  onSaveAs,
  onNew,
  onDelete,
  onRename,
}: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(currentName);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Keep input synced when the project changes externally (e.g., load).
  useEffect(() => {
    setDraft(currentName);
  }, [currentName]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDoc);
    return () => window.removeEventListener('mousedown', onDoc);
  }, [open]);

  function commitName() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== currentName) onRename(trimmed);
    else setDraft(currentName);
  }

  function handleSaveAs() {
    const name = prompt('Save as:', currentName || 'my project');
    if (name && name.trim()) {
      onSaveAs(name.trim());
      setOpen(false);
    }
  }

  const sorted = [...projects].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="project-menu" ref={wrapRef}>
      <div className="project-name-bar">
        <span className="mono project-name-label">PROJECT</span>
        <input
          className="project-name-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setDraft(currentName);
              (e.target as HTMLInputElement).blur();
            }
          }}
          placeholder="click to name…"
          spellCheck={false}
          title="click to rename"
        />
        {isDirty && (
          <span className="project-dirty" title="unsaved changes">
            ●
          </span>
        )}
        <button
          className="project-menu-caret"
          onClick={() => setOpen((o) => !o)}
          title="open project menu"
        >
          ▾
        </button>
      </div>
      {open && (
        <div className="project-menu-pop">
          <div className="project-menu-section">
            <button className="project-menu-item" onClick={onNew}>
              + NEW PROJECT
            </button>
            <button className="project-menu-item" onClick={handleSaveAs}>
              ↓ SAVE AS…
            </button>
          </div>
          {sorted.length > 0 && (
            <>
              <div className="project-menu-divider" />
              <div className="project-menu-list-head mono">
                {sorted.length} saved project{sorted.length === 1 ? '' : 's'}
              </div>
              <div className="project-menu-list">
                {sorted.map((p) => (
                  <div key={p.id} className="project-menu-row">
                    <button
                      className="project-menu-load"
                      onClick={() => {
                        onLoad(p);
                        setOpen(false);
                      }}
                    >
                      <div className="project-menu-row-name">{p.name}</div>
                      <div className="mono project-menu-row-meta">
                        {p.stitch.climbs.length} climbs ·{' '}
                        {timeAgo(p.updatedAt)}
                      </div>
                    </button>
                    <button
                      className="project-menu-del"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete "${p.name}"?`)) onDelete(p.id);
                      }}
                      title="delete project"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
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

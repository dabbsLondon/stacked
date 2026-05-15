import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import type { Bucket, Profile, Segment } from '../engine/profile';
import {
  bucketColor,
  bucketLineColor,
  gradColor,
} from '../engine/profile';
import type { Slice } from '../types';

interface Props {
  profile: Profile;
  slices?: Slice[];
  activeSliceId?: string | null;
  onCreateSlice?: (kmStart: number, kmEnd: number) => void;
  onActivateSlice?: (id: string | null) => void;
  onUpdateSliceRange?: (id: string, kmStart: number, kmEnd: number) => void;
}

export function ElevationChart({
  profile,
  slices,
  activeSliceId,
  onCreateSlice,
  onActivateSlice,
  onUpdateSliceRange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const handlesRef = useRef<HTMLDivElement>(null);
  const dragTipRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<uPlot | null>(null);
  // Keep the latest callbacks/state in refs so the uPlot hooks (created once
  // on mount) can read up-to-date values without re-initialising the plot.
  const slicesRef = useRef<Slice[]>(slices ?? []);
  const activeSliceRef = useRef<string | null>(activeSliceId ?? null);
  const onCreateSliceRef = useRef<typeof onCreateSlice>(onCreateSlice);
  const onActivateSliceRef = useRef<typeof onActivateSlice>(onActivateSlice);
  const onUpdateSliceRangeRef = useRef<typeof onUpdateSliceRange>(
    onUpdateSliceRange,
  );
  const suppressNextSelectRef = useRef(false);
  const isResizingRef = useRef(false);

  slicesRef.current = slices ?? [];
  activeSliceRef.current = activeSliceId ?? null;
  onCreateSliceRef.current = onCreateSlice;
  onActivateSliceRef.current = onActivateSlice;
  onUpdateSliceRangeRef.current = onUpdateSliceRange;

  const { xs, ys, segments, buckets } = profile;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    plotRef.current?.destroy();
    plotRef.current = null;

    const opts: uPlot.Options = {
      width: el.clientWidth || 800,
      height: el.clientHeight || 240,
      padding: [60, 14, 6, 6],
      cursor: {
        drag: { x: !!onCreateSlice, y: false, setScale: false, dist: 6 },
        points: { size: 6 },
      },
      legend: { show: false },
      scales: {
        x: { time: false },
        y: { auto: true, range: (_u, min, max) => paddedRange(min, max) },
      },
      axes: [
        {
          stroke: '#75757b',
          grid: { stroke: 'rgba(255,255,255,0.04)', width: 1 },
          ticks: { stroke: '#2a2a2e', width: 1 },
          font: '10px "JetBrains Mono", monospace',
          values: (_u, splits) => splits.map((v) => `${v.toFixed(1)} km`),
        },
        {
          stroke: '#75757b',
          grid: { stroke: 'rgba(255,255,255,0.04)', width: 1 },
          ticks: { stroke: '#2a2a2e', width: 1 },
          font: '10px "JetBrains Mono", monospace',
          size: 54,
          values: (_u, splits) => splits.map((v) => `${Math.round(v)} m`),
        },
      ],
      series: [
        { label: 'km' },
        {
          label: 'elev',
          stroke: 'rgba(0,0,0,0)',
          width: 0,
          fill: undefined,
          points: { show: false },
        },
      ],
      hooks: {
        drawClear: [(u) => drawBars(u, buckets)],
        draw: [
          (u) => {
            drawGradientLine(u, buckets);
            drawBarLabels(u, buckets);
            drawSlices(u, slicesRef.current, activeSliceRef.current);
            drawDividers(u, segments);
            positionHandles(
              u,
              slicesRef.current,
              activeSliceRef.current,
              handlesRef.current,
              onUpdateSliceRangeRef,
              isResizingRef,
              dragTipRef,
            );
          },
        ],
        setSize: [
          (u) => {
            positionLabels(u, segments, labelsRef.current);
            positionHandles(
              u,
              slicesRef.current,
              activeSliceRef.current,
              handlesRef.current,
              onUpdateSliceRangeRef,
              isResizingRef,
              dragTipRef,
            );
          },
        ],
        setScale: [
          (u) => {
            positionLabels(u, segments, labelsRef.current);
            positionHandles(
              u,
              slicesRef.current,
              activeSliceRef.current,
              handlesRef.current,
              onUpdateSliceRangeRef,
              isResizingRef,
              dragTipRef,
            );
          },
        ],
        setSelect: [
          (u) => {
            if (suppressNextSelectRef.current) {
              suppressNextSelectRef.current = false;
              return;
            }
            const cb = onCreateSliceRef.current;
            if (!cb) return;
            const sel = u.select;
            if (sel.width <= 4) return; // ignore taps / tiny drags
            const a = u.posToVal(sel.left, 'x');
            const b = u.posToVal(sel.left + sel.width, 'x');
            const kmStart = Math.min(a, b);
            const kmEnd = Math.max(a, b);
            cb(kmStart, kmEnd);
            // Clear the marquee without re-firing this hook.
            suppressNextSelectRef.current = true;
            u.setSelect({ left: 0, top: 0, width: 0, height: 0 }, false);
            hideDragTip(dragTipRef.current);
          },
        ],
        setCursor: [
          (u) => {
            if (!onCreateSliceRef.current) return;
            const sel = u.select;
            if (sel.width > 4) {
              const a = u.posToVal(sel.left, 'x');
              const b = u.posToVal(sel.left + sel.width, 'x');
              showDragTip(dragTipRef.current, Math.min(a, b), Math.max(a, b));
            } else {
              hideDragTip(dragTipRef.current);
            }
          },
        ],
      },
    };

    plotRef.current = new uPlot(opts, [xs, ys], el);
    positionLabels(plotRef.current, segments, labelsRef.current);
    positionHandles(
      plotRef.current,
      slicesRef.current,
      activeSliceRef.current,
      handlesRef.current,
      onUpdateSliceRangeRef,
      isResizingRef,
      dragTipRef,
    );

    // Treat a small mousedown→mouseup as a click (activate the slice under the
    // cursor); larger movements are drags handled by uPlot's selection.
    const u = plotRef.current;
    const overEl = u.over;
    let downX = 0;
    let downY = 0;
    const onDown = (e: MouseEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };
    const onUp = (e: MouseEvent) => {
      const dx = Math.abs(e.clientX - downX);
      const dy = Math.abs(e.clientY - downY);
      if (dx > 4 || dy > 4) return; // drag, not click
      const cb = onActivateSliceRef.current;
      if (!cb) return;
      const rect = overEl.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const km = u.posToVal(x, 'x');
      const hit = slicesRef.current.find(
        (s) => km >= s.kmStart && km <= s.kmEnd,
      );
      cb(hit ? hit.id : null);
    };
    overEl.addEventListener('mousedown', onDown);
    overEl.addEventListener('mouseup', onUp);

    // Hide drag tip on mouseup anywhere (covers releasing outside the chart).
    const onWindowUp = () => {
      if (!isResizingRef.current) hideDragTip(dragTipRef.current);
    };
    window.addEventListener('mouseup', onWindowUp);

    return () => {
      overEl.removeEventListener('mousedown', onDown);
      overEl.removeEventListener('mouseup', onUp);
      window.removeEventListener('mouseup', onWindowUp);
    };
  }, [xs, ys, segments, buckets, onCreateSlice]);

  // Repaint when slices or active selection change so the overlay updates
  // without rebuilding the plot.
  useEffect(() => {
    plotRef.current?.redraw(false, false);
  }, [slices, activeSliceId]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (plotRef.current) {
        plotRef.current.setSize({
          width: el.clientWidth,
          height: el.clientHeight,
        });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      plotRef.current?.destroy();
      plotRef.current = null;
    };
  }, []);

  return (
    <div className={`chart-wrap ${onCreateSlice ? 'chart-cut-mode' : ''}`}>
      <div className="chart-header">
        <div className="mono chart-label">ELEVATION PROFILE</div>
        <GradientLegend />
      </div>
      <div className="chart-stage">
        <div ref={containerRef} className="chart" />
        <div ref={labelsRef} className="chart-labels" />
        <div ref={handlesRef} className="chart-handles" />
        <div ref={dragTipRef} className="chart-drag-tip mono" />
      </div>
      {xs.length < 2 && (
        <div className="chart-empty mono">drop GPX files to see the profile</div>
      )}
    </div>
  );
}

function GradientLegend() {
  const stops: { label: string; g: number }[] = [
    { label: '<0', g: -2 },
    { label: '0', g: 0 },
    { label: '3', g: 3 },
    { label: '6', g: 6 },
    { label: '9', g: 9 },
    { label: '12', g: 12 },
    { label: '15+', g: 16 },
  ];
  return (
    <div className="grad-legend mono">
      {stops.map((s) => (
        <span key={s.label} className="grad-key">
          <span
            className="grad-swatch"
            style={{ background: gradColor(s.g) }}
          />
          <span className="grad-tick">{s.label}%</span>
        </span>
      ))}
    </div>
  );
}

function drawBars(u: uPlot, buckets: Bucket[]) {
  if (buckets.length === 0) return;
  const ctx = u.ctx;
  const { top, height } = u.bbox;
  const baselineY = top + height;
  ctx.save();
  for (const b of buckets) {
    const xL = u.valToPos(b.kmStart, 'x', true);
    const xR = u.valToPos(b.kmEnd, 'x', true);
    const yL = u.valToPos(b.eleStart, 'y', true);
    const yR = u.valToPos(b.eleEnd, 'y', true);
    ctx.fillStyle = bucketColor(b);
    ctx.beginPath();
    ctx.moveTo(xL, baselineY);
    ctx.lineTo(xL, yL);
    ctx.lineTo(xR, yR);
    ctx.lineTo(xR, baselineY);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawGradientLine(u: uPlot, buckets: Bucket[]) {
  if (buckets.length === 0) return;
  const ctx = u.ctx;
  const dpr = window.devicePixelRatio || 1;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Dark halo as one continuous polyline so the coloured strokes pop.
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.lineWidth = 4 * dpr;
  ctx.beginPath();
  {
    const first = buckets[0];
    ctx.moveTo(
      u.valToPos(first.kmStart, 'x', true),
      u.valToPos(first.eleStart, 'y', true),
    );
    for (const b of buckets) {
      ctx.lineTo(u.valToPos(b.kmEnd, 'x', true), u.valToPos(b.eleEnd, 'y', true));
    }
  }
  ctx.stroke();

  // Per-bucket colour stroke on top.
  ctx.lineWidth = 2.25 * dpr;
  for (const b of buckets) {
    ctx.strokeStyle = bucketLineColor(b);
    ctx.beginPath();
    ctx.moveTo(
      u.valToPos(b.kmStart, 'x', true),
      u.valToPos(b.eleStart, 'y', true),
    );
    ctx.lineTo(u.valToPos(b.kmEnd, 'x', true), u.valToPos(b.eleEnd, 'y', true));
    ctx.stroke();
  }
  ctx.restore();
}

function drawBarLabels(u: uPlot, buckets: Bucket[]) {
  if (buckets.length === 0) return;
  const ctx = u.ctx;
  const { top, height } = u.bbox;
  const baselineY = top + height;
  const dpr = window.devicePixelRatio || 1;
  ctx.save();
  ctx.font = `800 ${Math.round(17 * dpr)}px "Space Grotesk", "Inter", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const b of buckets) {
    if (b.kind === 'bridge') continue; // bridges are uniform — the rail shows their stats
    const xL = u.valToPos(b.kmStart, 'x', true);
    const xR = u.valToPos(b.kmEnd, 'x', true);
    const yL = u.valToPos(b.eleStart, 'y', true);
    const yR = u.valToPos(b.eleEnd, 'y', true);
    const w = xR - xL;
    const yMid = (yL + yR) / 2;
    const barH = baselineY - yMid;
    if (w < 18 * dpr || barH < 22 * dpr) continue;
    const cx = (xL + xR) / 2;
    const cy = Math.min(yMid + 18 * dpr, baselineY - 12 * dpr);
    const label = `${Math.round(b.gradient)}%`;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.95)';
    ctx.lineWidth = 6 * dpr;
    ctx.strokeText(label, cx, cy);
    ctx.lineWidth = 3 * dpr;
    ctx.strokeText(label, cx, cy);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, cx, cy);
  }
  ctx.restore();
}

function drawSlices(
  u: uPlot,
  slices: Slice[],
  activeId: string | null,
) {
  if (slices.length === 0) return;
  const ctx = u.ctx;
  const { top, height } = u.bbox;
  const dpr = window.devicePixelRatio || 1;
  ctx.save();
  ctx.font = `700 ${Math.round(11 * dpr)}px "JetBrains Mono", monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  for (let i = 0; i < slices.length; i++) {
    const s = slices[i];
    const xL = u.valToPos(s.kmStart, 'x', true);
    const xR = u.valToPos(s.kmEnd, 'x', true);
    const w = Math.max(0, xR - xL);
    if (w <= 0) continue;
    const active = s.id === activeId;
    ctx.fillStyle = active ? 'rgba(255, 95, 31, 0.35)' : 'rgba(255, 95, 31, 0.18)';
    ctx.fillRect(xL, top, w, height);
    ctx.strokeStyle = active ? '#ff5f1f' : 'rgba(255, 95, 31, 0.7)';
    ctx.lineWidth = active ? 2 : 1;
    ctx.strokeRect(xL + 0.5, top + 0.5, w - 1, height - 1);

    // Number badge top-left
    const tag = String(i + 1).padStart(2, '0');
    const pad = 4 * dpr;
    const tagX = xL + pad;
    const tagY = top + pad;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineWidth = 4 * dpr;
    ctx.strokeText(tag, tagX, tagY);
    ctx.fillStyle = '#fff200';
    ctx.fillText(tag, tagX, tagY);
  }
  ctx.restore();
}

function drawDividers(u: uPlot, segments: Segment[]) {
  if (segments.length < 2) return;
  const ctx = u.ctx;
  const { top, height } = u.bbox;
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.lineWidth = 1.25;
  ctx.setLineDash([5, 4]);
  for (let i = 1; i < segments.length; i++) {
    const x = u.valToPos(segments[i].startKm, 'x', true);
    ctx.beginPath();
    ctx.moveTo(x + 0.5, top);
    ctx.lineTo(x + 0.5, top + height);
    ctx.stroke();
  }
  ctx.restore();
}

function positionLabels(
  u: uPlot,
  segments: Segment[],
  host: HTMLDivElement | null,
) {
  if (!host) return;
  host.innerHTML = '';
  const dpr = window.devicePixelRatio || 1;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.kind === 'bridge') continue; // bridges shown via colour + rail editor
    const x1 = u.valToPos(seg.startKm, 'x', true) / dpr;
    const x2 = u.valToPos(seg.endKm, 'x', true) / dpr;
    const segWidth = Math.max(0, x2 - x1);
    if (segWidth < 40) continue;

    const div = document.createElement('div');
    div.className = 'chart-label-pill mono';
    div.style.left = `${x1 + 2}px`;
    div.style.top = `6px`;
    // Allow the pill to extend ~40% beyond its segment so the name + stats
    // can fit on narrow climbs. Hard cap at 240px so it doesn't dominate.
    const allowance = Math.min(240, Math.max(110, segWidth * 1.4));
    div.style.maxWidth = `${allowance}px`;
    const idx = String((seg.climbIdx ?? 0) + 1).padStart(2, '0');
    const showFull = segWidth >= 200;
    const showCompact = segWidth >= 75 && !showFull;
    const showCompactNoNum = !showFull && !showCompact;
    div.innerHTML = `
      <div class="cl-row cl-row-1">
        <span class="cl-num">${idx}</span>
        <span class="cl-name">${escapeHtml(seg.name)}</span>
      </div>${
        showFull
          ? `<div class="cl-row cl-row-2">
        <span class="cl-stat"><span class="cl-stat-k">${seg.distanceKm.toFixed(1)}km</span></span>
        <span class="cl-stat">avg <span class="cl-stat-k">${seg.avgGradient.toFixed(1)}%</span></span>
        <span class="cl-stat cl-stat-min">min <span class="cl-stat-k">${seg.minGradient.toFixed(0)}%</span></span>
        <span class="cl-stat cl-stat-max">max <span class="cl-stat-k">${seg.maxGradient.toFixed(0)}%</span></span>
      </div>`
          : showCompact
            ? `<div class="cl-row cl-row-2 cl-row-compact">
        <span class="cl-stat-k">${seg.distanceKm.toFixed(1)}km</span>
        <span class="cl-stat-dot">·</span>
        <span class="cl-stat-k">${seg.avgGradient.toFixed(1)}%</span>
        <span class="cl-stat-dot">·</span>
        <span class="cl-stat-k cl-stat-max">${seg.maxGradient.toFixed(0)}%</span>
      </div>`
            : showCompactNoNum
              ? `<div class="cl-row cl-row-2 cl-row-compact">
        <span class="cl-stat-k">${seg.distanceKm.toFixed(1)}km · ${seg.avgGradient.toFixed(0)}%</span>
      </div>`
              : ''
      }
    `;
    host.appendChild(div);
  }
}

function positionHandles(
  u: uPlot,
  slices: Slice[],
  activeId: string | null,
  host: HTMLDivElement | null,
  onUpdateRef: { current: ((id: string, kmStart: number, kmEnd: number) => void) | undefined },
  resizingRef: { current: boolean },
  dragTipRef: { current: HTMLDivElement | null },
) {
  if (!host) return;
  host.innerHTML = '';
  if (!activeId || !onUpdateRef.current) return;
  const slice = slices.find((s) => s.id === activeId);
  if (!slice) return;

  const dpr = window.devicePixelRatio || 1;
  const cssTop = u.bbox.top / dpr;
  const cssH = u.bbox.height / dpr;
  const cssLeft = u.valToPos(slice.kmStart, 'x', true) / dpr;
  const cssRight = u.valToPos(slice.kmEnd, 'x', true) / dpr;

  for (const side of ['start', 'end'] as const) {
    const x = side === 'start' ? cssLeft : cssRight;
    const handle = document.createElement('div');
    handle.className = `chart-slice-handle chart-slice-handle-${side}`;
    handle.style.left = `${x - 8}px`;
    handle.style.top = `${cssTop}px`;
    handle.style.height = `${cssH}px`;
    handle.innerHTML = '<span class="chart-slice-grip"></span>';
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      const startSlice = { ...slice };
      const overRect = u.over.getBoundingClientRect();
      // Capture how far the mouse is from the actual edge in km so the drag
      // preserves that offset (otherwise the edge jumps to wherever the cursor
      // is, magnifying any click-offset on long sources).
      const downKm = u.posToVal(e.clientX - overRect.left, 'x');
      const edgeKm =
        side === 'start' ? startSlice.kmStart : startSlice.kmEnd;
      const grabOffsetKm = downKm - edgeKm;
      resizingRef.current = true;

      const onMove = (ev: MouseEvent) => {
        const px = ev.clientX - overRect.left;
        const km = u.posToVal(px, 'x') - grabOffsetKm;
        const cb = onUpdateRef.current;
        if (!cb) return;
        let kmS = startSlice.kmStart;
        let kmE = startSlice.kmEnd;
        if (side === 'start') {
          kmS = Math.min(Math.max(0, km), startSlice.kmEnd - 0.05);
        } else {
          kmE = Math.max(startSlice.kmStart + 0.05, km);
        }
        cb(startSlice.id, kmS, kmE);
        showDragTip(dragTipRef.current, kmS, kmE);
      };
      const onUp = () => {
        resizingRef.current = false;
        hideDragTip(dragTipRef.current);
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
    host.appendChild(handle);
  }
}

function showDragTip(
  el: HTMLDivElement | null,
  kmStart: number,
  kmEnd: number,
) {
  if (!el) return;
  const dist = Math.max(0, kmEnd - kmStart);
  el.classList.add('chart-drag-tip-visible');
  el.textContent = `${kmStart.toFixed(2)}  →  ${kmEnd.toFixed(2)} km   ·   ${dist.toFixed(2)} km`;
}

function hideDragTip(el: HTMLDivElement | null) {
  if (!el) return;
  el.classList.remove('chart-drag-tip-visible');
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

function paddedRange(min: number, max: number): [number, number] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 100];
  if (max - min < 1) return [min - 10, max + 10];
  const pad = (max - min) * 0.08;
  return [min - pad, max + pad];
}

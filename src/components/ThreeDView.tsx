import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Point } from '../types';
import { haversine } from '../engine/gpx';
import { sampleEle } from '../engine/profile';

interface Props {
  points: Point[];
  title: string;
  onClose: () => void;
}

const DEFAULT_EXAG = 4;

export function ThreeDView({ points, title, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [exag, setExag] = useState(DEFAULT_EXAG);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || points.length < 2) return;

    const w = container.clientWidth || 800;
    const h = container.clientHeight || 500;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0c);

    const camera = new THREE.PerspectiveCamera(50, w / h, 0.5, 200000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // Project lat/lon to local meters around the first point (flat-earth — fine
    // since stitched route doesn't span a large area after translation).
    const latRef = points[0].lat;
    const lonRef = points[0].lon;
    const latScale = 110540;
    const lonScale = 111320 * Math.cos((latRef * Math.PI) / 180);

    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity,
      minE = Infinity;

    const xs: number[] = new Array(points.length);
    const zs: number[] = new Array(points.length);
    const ys: number[] = new Array(points.length);
    const gradients: number[] = new Array(points.length);

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const x = (p.lon - lonRef) * lonScale;
      const z = -(p.lat - latRef) * latScale;
      xs[i] = x;
      zs[i] = z;
      ys[i] = p.ele;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
      if (p.ele < minE) minE = p.ele;

      let grad = 0;
      if (i > 0) {
        const prev = points[i - 1];
        const dDist = haversine(prev, p);
        const dEle = p.ele - prev.ele;
        grad = dDist > 0 ? (dEle / dDist) * 100 : 0;
      }
      gradients[i] = grad;
    }
    gradients[0] = gradients[1] ?? 0;

    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const range = Math.max(maxX - minX, maxZ - minZ, 1);

    // Centred world-space coordinates for each route point.
    const wx: number[] = new Array(points.length);
    const wy: number[] = new Array(points.length);
    const wz: number[] = new Array(points.length);
    for (let i = 0; i < points.length; i++) {
      wx[i] = xs[i] - cx;
      wy[i] = (ys[i] - minE) * exag;
      wz[i] = zs[i] - cz;
    }

    // Vertical wall: a ribbon that drops from the elevation line down to the
    // ground, coloured by gradient. Two vertices per point (top + bottom),
    // shared between adjacent segments for smooth colour transitions.
    const vertCount = points.length * 2;
    const wallPositions = new Float32Array(vertCount * 3);
    const wallColors = new Float32Array(vertCount * 3);
    for (let i = 0; i < points.length; i++) {
      const top = i * 2;
      const bot = i * 2 + 1;
      wallPositions[top * 3] = wx[i];
      wallPositions[top * 3 + 1] = wy[i];
      wallPositions[top * 3 + 2] = wz[i];
      wallPositions[bot * 3] = wx[i];
      wallPositions[bot * 3 + 1] = 0;
      wallPositions[bot * 3 + 2] = wz[i];
      const [r, g, b] = gradColorRGB(gradients[i]);
      wallColors[top * 3] = r;
      wallColors[top * 3 + 1] = g;
      wallColors[top * 3 + 2] = b;
      // Bottom faded slightly darker for visual depth.
      wallColors[bot * 3] = r * 0.45;
      wallColors[bot * 3 + 1] = g * 0.45;
      wallColors[bot * 3 + 2] = b * 0.45;
    }
    const wallIndices: number[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const top1 = i * 2;
      const bot1 = i * 2 + 1;
      const top2 = (i + 1) * 2;
      const bot2 = (i + 1) * 2 + 1;
      // Two triangles forming the quad for this segment.
      wallIndices.push(bot1, bot2, top2);
      wallIndices.push(bot1, top2, top1);
    }
    const wallGeom = new THREE.BufferGeometry();
    wallGeom.setAttribute(
      'position',
      new THREE.BufferAttribute(wallPositions, 3),
    );
    wallGeom.setAttribute(
      'color',
      new THREE.BufferAttribute(wallColors, 3),
    );
    wallGeom.setIndex(wallIndices);
    wallGeom.computeVertexNormals();
    const wallMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 0.75,
      metalness: 0.05,
      flatShading: false,
    });
    const wall = new THREE.Mesh(wallGeom, wallMat);
    scene.add(wall);

    // Thin bright ridge along the top edge of the wall to emphasise the
    // elevation profile.
    const ridgePositions = new Float32Array(points.length * 3);
    const ridgeColors = new Float32Array(points.length * 3);
    for (let i = 0; i < points.length; i++) {
      ridgePositions[i * 3] = wx[i];
      ridgePositions[i * 3 + 1] = wy[i] + 1;
      ridgePositions[i * 3 + 2] = wz[i];
      const [r, g, b] = gradColorRGB(gradients[i]);
      // Brighten the ridge so it pops above the wall.
      ridgeColors[i * 3] = Math.min(1, r * 1.25);
      ridgeColors[i * 3 + 1] = Math.min(1, g * 1.25);
      ridgeColors[i * 3 + 2] = Math.min(1, b * 1.25);
    }
    const ridgeGeom = new THREE.BufferGeometry();
    ridgeGeom.setAttribute(
      'position',
      new THREE.BufferAttribute(ridgePositions, 3),
    );
    ridgeGeom.setAttribute(
      'color',
      new THREE.BufferAttribute(ridgeColors, 3),
    );
    const ridgeMat = new THREE.LineBasicMaterial({ vertexColors: true });
    const ridge = new THREE.Line(ridgeGeom, ridgeMat);
    scene.add(ridge);

    // Ground footprint of the route — a darker line on the floor.
    const footPositions = new Float32Array(points.length * 3);
    for (let i = 0; i < points.length; i++) {
      footPositions[i * 3] = wx[i];
      footPositions[i * 3 + 1] = 0.5;
      footPositions[i * 3 + 2] = wz[i];
    }
    const footGeom = new THREE.BufferGeometry();
    footGeom.setAttribute(
      'position',
      new THREE.BufferAttribute(footPositions, 3),
    );
    const footMat = new THREE.LineBasicMaterial({
      color: 0x222226,
      transparent: true,
      opacity: 0.8,
    });
    const foot = new THREE.Line(footGeom, footMat);
    scene.add(foot);

    // Ground grid.
    const gridSize = Math.ceil((range * 1.4) / 1000) * 1000;
    const divisions = Math.min(40, Math.max(8, Math.round(gridSize / 500)));
    const grid = new THREE.GridHelper(
      gridSize,
      divisions,
      0x3a3a40,
      0x1d1d22,
    );
    grid.position.y = -1;
    scene.add(grid);

    // Lights.
    scene.add(new THREE.AmbientLight(0x404060, 0.7));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(range, range * 1.5, range * 0.8);
    scene.add(dir);
    const back = new THREE.DirectionalLight(0xff7842, 0.25);
    back.position.set(-range, range, -range);
    scene.add(back);

    // Use the actual geometry bounds to fit the camera.
    wallGeom.computeBoundingBox();
    const bbox = wallGeom.boundingBox!;
    const bboxSize = new THREE.Vector3();
    bbox.getSize(bboxSize);
    const bboxCenter = new THREE.Vector3();
    bbox.getCenter(bboxCenter);

    const aspect = w / h || 1;
    const fovY = (camera.fov * Math.PI) / 180;
    const fovX = 2 * Math.atan(Math.tan(fovY / 2) * aspect);

    // From the camera's isometric vantage the floor's diagonal is what fills
    // the horizontal viewport, so use sqrt(width² + depth²) for the horizontal
    // fit distance.
    const horizExtent = Math.sqrt(
      bboxSize.x * bboxSize.x + bboxSize.z * bboxSize.z,
    );
    const fitForHoriz = horizExtent / (2 * Math.tan(fovX / 2));
    const fitForHeight = bboxSize.y / (2 * Math.tan(fovY / 2));
    // Use the bounding-box diagonal as a clipping-safe "fit sphere" so the
    // geometry never gets cut off no matter how the camera angle projects it.
    const sphereRadius = bboxSize.length() / 2;
    const sphereFit =
      sphereRadius / Math.sin(Math.min(fovX, fovY) / 2);
    // The horiz/height fit is what we'd want for a square-on view; pick the
    // larger of (sphere fit, isometric fit) and add a touch of padding.
    const tight = 1.05;
    const camDist =
      Math.max(sphereFit, fitForHoriz, fitForHeight) * tight;

    const camDir = new THREE.Vector3(0.6, 0.55, 0.85).normalize();
    camera.position
      .copy(bboxCenter)
      .add(camDir.clone().multiplyScalar(camDist));
    camera.lookAt(bboxCenter);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(bboxCenter);
    controls.minDistance = Math.max(10, range * 0.005);
    controls.maxDistance = camDist * 6;
    controls.dampingFactor = 0.08;
    controls.enableDamping = true;
    controls.update();

    let raf = 0;
    let running = true;
    function animate() {
      if (!running) return;
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    }
    animate();

    const onResize = () => {
      const nw = container.clientWidth;
      const nh = container.clientHeight;
      if (nw <= 0 || nh <= 0) return;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(container);
    // Ensure correct size after layout.
    requestAnimationFrame(onResize);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      wallGeom.dispose();
      wallMat.dispose();
      ridgeGeom.dispose();
      ridgeMat.dispose();
      footGeom.dispose();
      footMat.dispose();
      (grid.geometry as THREE.BufferGeometry).dispose();
      (grid.material as THREE.Material).dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [points, exag]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const stats = useMemo(() => computeStats(points), [points]);
  const estMin = (stats.distKm / 18) * 60 + (stats.ascentM / 500) * 10;

  return (
    <div className="threed-overlay" onClick={onClose}>
      <div className="threed-modal" onClick={(e) => e.stopPropagation()}>
        <div className="threed-head">
          <div className="threed-title">
            <span className="mono threed-eyebrow">// 3D PROFILE</span>
            <span className="threed-name">{title}</span>
          </div>
          <div className="threed-stats">
            <ThreeDStat
              label="distance"
              value={`${stats.distKm.toFixed(1)}`}
              unit="km"
            />
            <ThreeDStat
              label="ascent"
              value={`+${Math.round(stats.ascentM).toLocaleString()}`}
              unit="m"
              accent="yellow"
            />
            <ThreeDStat
              label="descent"
              value={`-${Math.round(stats.descentM).toLocaleString()}`}
              unit="m"
              accent="teal"
            />
            <ThreeDStat
              label="avg"
              value={stats.avg.toFixed(1)}
              unit="%"
            />
            <ThreeDStat
              label="max"
              value={stats.max.toFixed(0)}
              unit="%"
              accent="orange"
            />
            <ThreeDStat
              label="min"
              value={stats.min.toFixed(0)}
              unit="%"
              accent="teal"
            />
            <ThreeDStat
              label="ride"
              value={formatTime(estMin)}
              unit=""
            />
          </div>
          <button
            className="threed-close"
            onClick={onClose}
            title="close (esc)"
          >
            ×
          </button>
        </div>
        <div className="threed-canvas" ref={containerRef} />
        <div className="threed-foot">
          <div className="threed-hint mono">
            drag to rotate · scroll to zoom · right-drag to pan · esc to close
          </div>
          <label className="threed-exag mono">
            <span>vertical exaggeration</span>
            <input
              type="range"
              min={1}
              max={12}
              step={0.5}
              value={exag}
              onChange={(e) => setExag(parseFloat(e.target.value))}
            />
            <span className="threed-exag-val">×{exag}</span>
          </label>
        </div>
      </div>
    </div>
  );
}

function ThreeDStat({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: string;
  unit: string;
  accent?: 'orange' | 'yellow' | 'teal';
}) {
  return (
    <div className={`threed-stat ${accent ? `threed-stat-${accent}` : ''}`}>
      <div className="mono threed-stat-label">{label}</div>
      <div className="threed-stat-value">
        {value}
        {unit && <span className="threed-stat-unit">{unit}</span>}
      </div>
    </div>
  );
}

function computeStats(points: Point[]): {
  distKm: number;
  ascentM: number;
  descentM: number;
  avg: number;
  max: number;
  min: number;
} {
  if (points.length < 2) {
    return { distKm: 0, ascentM: 0, descentM: 0, avg: 0, max: 0, min: 0 };
  }
  let dist = 0;
  let asc = 0;
  let desc = 0;
  const cum: number[] = [0];
  const eles: number[] = [points[0].ele];
  for (let i = 1; i < points.length; i++) {
    const d = haversine(points[i - 1], points[i]);
    dist += d;
    cum.push(dist);
    eles.push(points[i].ele);
    const de = points[i].ele - points[i - 1].ele;
    if (de > 0) asc += de;
    else desc += -de;
  }
  const avg = dist > 0 ? (asc / dist) * 100 : 0;
  let max = -Infinity;
  let min = Infinity;
  for (const win of [20, 30, 50]) {
    const step = Math.max(5, win / 3);
    for (let m = 0; m + win <= dist + 1e-6; m += step) {
      const eA = sampleEle(cum, eles, m);
      const eB = sampleEle(cum, eles, m + win);
      const g = ((eB - eA) / win) * 100;
      if (g > max) max = g;
      if (g < min) min = g;
    }
  }
  if (!Number.isFinite(max)) max = 0;
  if (!Number.isFinite(min)) min = 0;
  return { distKm: dist / 1000, ascentM: asc, descentM: desc, avg, max, min };
}

function formatTime(min: number): string {
  if (min <= 0) return '–';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function gradColorRGB(g: number): [number, number, number] {
  if (g < -1) return [0.49, 0.83, 0.99];
  if (g < 1) return [0.4, 0.4, 0.43];
  if (g < 3) return [0.99, 0.9, 0.52];
  if (g < 5) return [0.98, 0.8, 0.08];
  if (g < 7) return [0.98, 0.57, 0.24];
  if (g < 9) return [0.98, 0.45, 0.09];
  if (g < 11) return [0.94, 0.27, 0.27];
  if (g < 13) return [0.86, 0.15, 0.15];
  if (g < 16) return [0.6, 0.1, 0.1];
  return [0.5, 0.11, 0.11];
}

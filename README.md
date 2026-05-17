# STACKED

> **Splice climbs together. Cut them out of long rides. Load straight into Rouvy. Suffer in sequence.**

A browser-only workbench for stitching together cycling climbs into one synthetic
GPX route. Drop in a long ride, auto-detect the climbs, snip them out, stack them
with configurable flat resets between each, then export a single GPX ready for
Rouvy. Save the project, come back tomorrow, tweak it.

<p align="center">
  <img src="docs/screenshots/hero.png" alt="Stacked — front page" width="100%"/>
</p>

[![CI](https://github.com/dabbsLondon/stacked/actions/workflows/ci.yml/badge.svg)](https://github.com/dabbsLondon/stacked/actions/workflows/ci.yml)
![Coverage](https://img.shields.io/badge/coverage-%3E80%25-brightgreen)
![Stack](https://img.shields.io/badge/stack-React%20%2B%20Vite%20%2B%20Three.js-orange)
![License](https://img.shields.io/badge/license-MIT-blue)

---

## Why this exists

Indoor cycling platforms like Rouvy accept GPX files as routes. The climbs you
actually want to ride are scattered across maps — one in Yorkshire, one in
Wales, one in the Lakes. STACKED lets you collect those climbs, splice them
into one synthetic route, preview it on a map and elevation chart, and export a
GPX that Rouvy treats as a single ride. Half your GPX files come from real
rides — a 60km Saturday loop that happens to contain two climbs worth keeping.
STACKED works in reverse too: import a long ride, drag handles to mark slices,
save each as a standalone GPX.

Everything is client-side. No backend, no privacy surface, deploys
to anything that hosts static HTML.

---

## Features

### Cut mode
- Load **multiple long rides** at once and switch between them with source tabs
- **Auto-detect climbs** (`⚡ DETECT CLIMBS`) — finds sustained ≥5% sections,
  long-shallow climbs, merges close climbs separated by brief lulls
- **Drag-select** any range on the elevation chart to create a slice
- **Live km tooltip** while dragging so you can land the slice precisely
- **Resize handles** at slice edges — drag to grow/shrink with 1:1 cursor
  tracking, ±50m nudge buttons in the detail panel
- **Per-slice detail panel** with the slice's isolated elevation chart, full
  stats (distance / ascent / avg / min / max gradient), rename input
  (filename preview), and export
- **Sparklines** on every slice card so you can see the shape at a glance
- Send all slices to the splicer in one click (`→ SPLICE`)

### Splice mode
- **Stitch climbs** together — coordinates translate to align endpoints,
  elevations shift to meet, gradients preserved perfectly
- **Flat bridges** between any pair of climbs, length and gradient configurable
  per-bridge or via the global **FLAT SECTIONS** defaults panel
  (presets: 500 m / 1 km / 2 km / 5 km)
- **Bridges rendered teal** on the map and chart so you can tell engineered
  segments from real GPX data
- Reorder climbs, individual or bulk bridge management
  (`ADD TO ALL GAPS`, `APPLY TO N BRIDGES`, `REMOVE ALL`)
- Per-climb stats (distance, ascent, average gradient) + project totals
  including bridge contributions

### Elevation chart
- Climbfinder-style **vertical bars** colored by gradient at 200m buckets
- **Gradient ridge line** colored by the same palette, sitting on top of the
  bars with a dark halo
- **Section pills** above each climb showing name + compact or full stats
- Multi-scale **peak-gradient detection** (20/30/50m windows) so a brief 22%
  kicker shows up as `max 22%` even though the 200m average bar reads 14%

### Map
- Floating top-right panel — chart-dominant layout with map as quick reference
- Path colored by gradient with the same palette
- Slice overlays (cut) / junction markers (splice)
- CartoDB dark tiles, OpenStreetMap data

### 3D viewer
- Full-screen modal popup (`🌐 3D` button in header or per-section)
- **Vertical wall** rendered with smooth gradient-colored vertex shading,
  rising from a grid floor — the Climbfinder/Komoot look
- Full stats row: **distance · ascent · descent · avg · max · min · ride time**
- **Vertical exaggeration slider** (×1 → ×12)
- OrbitControls for rotate / zoom / pan

### Projects
- Save projects to localStorage; resume later from the **home page**
- Inline-editable project name in the header with dirty-state indicator
- **Continue working** prompt on the home page if there's unsaved state
- Project cards with elevation sparkline, climb count, total km
- **Duplicate** any saved project under a new name

### Accounts & multi-user (optional)
- Backed by **[PocketBase](https://pocketbase.io)** — single Go binary,
  embedded SQLite, no Docker. Configure `VITE_PB_URL` to enable; without
  it the app stays in pure-localStorage mode.
- **Email + password sign-in / sign-up**, no SMTP required.
- On sign-in, projects sync to PocketBase: any local-only projects get
  pushed up, any remote projects newer than local get pulled down.
- Every save / delete writes through to both local cache and remote.
- **Admin role** (set via the PocketBase admin UI: Collections → users →
  set `role=admin`) unlocks the **⚙ ADMIN** view on the home page —
  browse every user's projects with climb + slice breakdowns, and
  **↓ PULL** any user's climb or cut source straight into your own cut
  workspace.
- Setup: [`docs/POCKETBASE_SETUP.md`](docs/POCKETBASE_SETUP.md). Deploy:
  [`docs/DEPLOY.md`](docs/DEPLOY.md).

---

## Quick start

```sh
npm install
npm run dev          # http://localhost:5173
```

### Build

```sh
npm run build        # tsc + vite build → dist/
npm run preview      # serve the production build locally
```

### Deploy

Manual deploy to your own host. PocketBase serves both the SPA and the
API from one binary on one port. Full step-by-step + systemd / launchd
service files in [`docs/DEPLOY.md`](docs/DEPLOY.md).

---

## Sibling project · Stacked Ride

Stacked is the route-builder. The companion app that lets you actually
**ride** those routes — a desktop turbo-trainer client with live BLE/ANT+
telemetry, 3D course rendering and Strava upload — is being designed
under the name **Stacked Ride**.

Design spec:
[`docs/stacked-ride/plan.html`](docs/stacked-ride/plan.html). Open in a
browser; it's themed to match this repo's own `plan.html`.

Stacked Ride ships from its own repo (`dabbsLondon/stacked-ride`) when
work starts, but reads routes from this project's PocketBase and writes
rides back to it. Same users, same auth, same library.

### Test

```sh
npm test             # runs vitest once
npm run test:watch   # vitest in watch mode
npm run coverage     # runs vitest with v8 coverage report
```

The coverage thresholds enforced in `vitest.config.ts` and CI:

- **Lines / Statements / Functions:** ≥80%
- **Branches:** ≥75%

Engine modules (`src/engine/`) are the pure-logic surface and are the only
files counted toward coverage. UI components are excluded.

---

## Test results & coverage

This block is a snapshot of the latest local run on `main`. The same numbers
are regenerated on every CI run and posted to the **GitHub Actions job
summary** (open any workflow run on the `Actions` tab and scroll to the
bottom). `coverage/coverage-summary.json` and `vitest-results.json` are also
uploaded as artifacts on each run.

### Tests

| Status | Files | Tests | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: | ---: | ---: |
| 🟢 passing | 7 | 71 | 71 | 0 | 0 |

| File | Tests |
| --- | ---: |
| `src/engine/gpx.test.ts` | 16 |
| `src/engine/projects.test.ts` | 14 |
| `src/engine/backend.test.ts` | 11 |
| `src/engine/profile.test.ts` | 10 |
| `src/engine/stitch.test.ts` | 8 |
| `src/engine/detect.test.ts` | 7 |
| `src/engine/cut.test.ts` | 5 |

### Coverage

| Metric | Covered / Total | % |
| --- | --- | ---: |
| **lines** 🟢 | 378 / 408 | **92.6%** |
| **statements** 🟢 | 439 / 482 | **91.1%** |
| **functions** 🟢 | 45 / 46 | **97.8%** |
| **branches** 🟢 | 185 / 235 | **78.7%** |

| File | Lines | Statements | Functions | Branches |
| --- | ---: | ---: | ---: | ---: |
| `src/engine/cut.ts` | 🟡 72.9% | 72.4% | 75.0% | 62.5% |
| `src/engine/detect.ts` | 🟢 91.5% | 91.5% | 100.0% | 80.4% |
| `src/engine/projects.ts` | 🟢 94.6% | 93.8% | 100.0% | 87.5% |
| `src/engine/profile.ts` | 🟢 95.6% | 91.7% | 100.0% | 75.6% |
| `src/engine/gpx.ts` | 🟢 100.0% | 100.0% | 100.0% | 83.3% |
| `src/engine/stitch.ts` | 🟢 100.0% | 98.0% | 100.0% | 85.7% |

Regenerate locally:

```sh
npm run coverage     # writes coverage/ + vitest-results.json
npm run ci:summary   # prints the markdown summary you see above
```

---

## Architecture

```
src/
├── engine/                     ← Pure-logic core (covered by tests)
│   ├── gpx.ts                  ← Parse / write GPX 1.1, haversine, climb stats
│   ├── stitch.ts               ← buildStitch(climbs, bridges) → { points, segments }
│   ├── cut.ts                  ← extractSlice() — interpolated endpoints, cumulativeDistances
│   ├── detect.ts               ← detectClimbs() — sliding-window gradient scan + merge pass
│   ├── profile.ts              ← buildProfileFromPlan() — buckets, segments, gradient colours
│   └── projects.ts             ← localStorage save/load + schema migration
└── components/                 ← React UI
    ├── App.tsx                 ← Top-level state, view router, project menu
    ├── HomeView.tsx            ← Front page / project dashboard
    ├── DropZone.tsx
    ├── ClimbList.tsx           ← Climb cards + bridge editor between each pair
    ├── BridgeDefaults.tsx      ← Bulk bridge controls
    ├── SliceList.tsx           ← Slice cards with sparklines
    ├── SliceDetail.tsx         ← Active slice editor with isolated chart
    ├── ElevationChart.tsx      ← uPlot chart with bucket bars + slice drag-select + handles
    ├── Map.tsx                 ← Leaflet floating panel
    ├── ThreeDView.tsx          ← Three.js 3D wall modal
    └── ProjectMenu.tsx         ← Editor header project picker / inline rename
```

### Engine boundaries

The `engine/` directory is the pure-logic core — no DOM access, no React, no
side effects (except `localStorage` in `projects.ts`). The same `Profile` shape
flows from `engine` into both `Map` and `ElevationChart` so the two views can
never disagree about colours, bucket boundaries, or per-segment stats.

### Stitch algorithm

For each climb after the first, translate the climb's lat/lon and elevation
so its first point coincides with the previous segment's last point. Distance
is preserved (haversine is translation-invariant on small scales). Gradients
are preserved because elevation deltas don't change under translation. If a
bridge sits between two climbs, its points are generated in a straight line
extending the previous climb's bearing, with elevation interpolated linearly
from gradient + length.

### Climb detection

1. Resample the route every 50m, computing a 100m-window smoothed gradient.
2. Seed a climb where the smoothed gradient hits **≥5%**.
3. Continue the climb while the smoothed gradient stays ≥2%; tolerate mild
   descents down to −3% as "gap"; allow 400m of gap before ending the climb.
4. End the climb at the **highest elevation reached**, not the last climbing
   sample, so the slice cuts at the summit.
5. Extend the **start backwards** up to 1.5km through the ramp-up.
6. Accept the climb if:
   - **short-and-steep:** ≥500m length, ≥4% avg, ≥50m ascent, **or**
   - **long-and-shallow:** ≥3km length, ≥2.5% avg, ≥50m ascent
7. **Merge pass:** combine adjacent climbs separated by ≤1km gap with ≤60m
   net drop (false summits, brief flats).

---

## Tech stack

- **React 18** + **TypeScript** + **Vite 5**
- **Leaflet** (OSM dark tiles via CARTO) — map view
- **uPlot** — elevation chart (canvas, 40 KB, screaming fast)
- **Three.js** (`OrbitControls`, `TubeGeometry`, custom wall mesh) — 3D viewer
- **Vitest** + **@vitest/coverage-v8** + **jsdom** — testing
- Project storage: browser **localStorage** (~5MB practical limit)
- Build output: static files — host on Cloudflare Pages, Netlify, GitHub
  Pages, or anywhere

---

## Roadmap

- [x] **iter 01** — drop / stitch / normalise / download
- [x] **iter 02** — cut mode with auto-detect + multi-source + drag handles
- [x] **iter 03** — flat bridges (configurable length / gradient, bulk actions)
- [x] **bonus** — 3D viewer with stats row + vertical exaggeration
- [x] **bonus** — projects (save/load, home page, autosave)
- [ ] **iter 04** — per-file trim handles, preset bridge packs, route library
- [ ] **iter 05** — routed bridges (real roads via OSRM), Strava segment import

---

## Screenshots

> _Drop screenshots into `docs/screenshots/`. Each is referenced from this README._

- **Front page** — `docs/screenshots/home.png`
- **Splice mode** — `docs/screenshots/splice.png`
- **Cut mode** — `docs/screenshots/cut.png`
- **3D viewer** — `docs/screenshots/3d.png`

---

## Where to get climb GPX files

| Source | Free? | Notes |
| --- | --- | --- |
| [Climbfinder](https://climbfinder.com) | Yes | European cols already isolated to the climb |
| [cyclingcols](https://cyclingcols.com) | Yes | Deep DB of Alpine/Pyrenean climbs |
| [Strava](https://strava.com) | Freemium | Public activities/routes export; segments need premium |
| [Ride With GPS](https://ridewithgps.com) | Freemium | Huge user library; GPX export on free tier |
| [Komoot](https://komoot.com) | Freemium | Strong UK/EU coverage |
| [PJAMM Cycling](https://pjammcycling.com) | Freemium | Iconic + obscure climbs worldwide, paid GPX |
| [Garmin Connect](https://connect.garmin.com) | Yes | Your own activities — best when paired with a barometric head unit |

For Rouvy compatibility: ideally use **recorded activity GPX from a barometric
altimeter** (Garmin Edge / Wahoo). Route planners that use SRTM satellite
elevation often smooth steep kickers out of the data.

---

## License

MIT

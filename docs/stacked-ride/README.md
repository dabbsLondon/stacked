# Stacked Ride · design notes

The companion app to Stacked — a thick-client desktop app (Electron) that
turns your stacked routes into actual rides on your turbo trainer.

This directory holds the design doc for the future
**[dabbsLondon/stacked-ride](https://github.com/dabbsLondon/stacked-ride)**
repo. Nothing here ships in Stacked itself; it's a pre-flight spec so the
two projects start with a shared understanding of how they fit together.

## View the plan

```sh
open docs/stacked-ride/plan.html
```

Or open it in any browser. Same visual theme as the top-level
`plan.html` that drove Stacked, just in the indigo / sky palette to
mark it as the sibling project.

## What's in the plan

- **The loop** — sense → physics → render → record at 60 Hz.
- **Relationship to Stacked** — read GPX routes from the shared
  PocketBase, write `rides` rows back, share users + auth.
- **Tech stack** — Electron + React/Vite/TS (same as Stacked) + Three.js +
  `noble` for BLE + `ant-plus-next` for ANT+ + `fit-encoder` for export.
- **Hardware compatibility** — covers BLE and ANT+ trainers, HRMs, power
  meters, cadence sensors.
- **Data schema** — two new PB collections (`rides`, `strava_tokens`).
- **Roadmap** — six iterations from a connectivity spike through to
  multiplayer + route discovery.
- **Risks** — the honest list of things that can break.

## How to start when ready

1. Run the Step-00 spike (~1-2 days) in this repo or a throwaway one to
   confirm your trainer behaves over BLE / ANT+.
2. Create `dabbsLondon/stacked-ride`.
3. Copy this `plan.html` over as its design doc.
4. Point its config at the existing PocketBase instance.
5. Build milestone 01 — flat 2D ride loop, no 3D, no Strava.

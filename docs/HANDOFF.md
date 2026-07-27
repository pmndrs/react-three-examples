# Session Handoff — 2026-07-27 (overnight, continued: repo live + M2 dry-run wave)

Read AGENTS.md first (v0.4 — conventions + stack pins + gotchas), then
[UPSTREAM.md](UPSTREAM.md) (the patch/override ledger + upstream fix briefs Dennis
asked for), then this.

## Where we are

**M1 complete** (Dennis signed off on grid/leva/titleblock look; both gate ports
reviewed). **M2 is well underway**: repo live at
github.com/pmndrs/react-three-examples, CI green, and the 5-port dry-run wave is
merged. **9 examples total**, all green locally (tsc/lint/build/smoke 9/9).

### The M2 dry-run wave (all single-Sonnet agents, AGENTS.md-steered)

| # | Example | Notes | Agent cost |
|---|---------|-------|-----------|
| gate#2 | skinning-instancing | instancing + TSL range + blur pipeline | 146k tok |
| gate#3 | postprocessing-bloom-emissive | MRT selective bloom | 93k |
| 1 | sky | SkyMesh + CubeCamera; slug-rule violation (fixed + doc reworded) | 111k |
| 2 | rtt | pipeline subsumes manual RTT; cleanest port | 78k |
| 3 | shadow-contact | first folder-pattern; `before:'render'` capture pass | 181k |
| 4 | tsl-halftone | deepest TSL; found the WGSL-identifier trap | 201k |
| 5 | sprites | SpriteNodeMaterial + userData node + scene.fogNode | 128k |

Review cost stayed cheap: every port needed at most a slug rename / one-prop
consistency fix. Cost tracks example difficulty, not doc decay — simple ports got
cheaper as AGENTS.md absorbed each round's lessons (now at v0.4, see its changelog).

### CI (github.com/pmndrs/react-three-examples/actions)

- checks (lint+build) + smoke (headed Chromium under Xvfb + SwiftShader Vulkan) —
  **the research-designed WebGPU path is proven on free runners**.
- `packageManager` pin + vendored fiber tarball (1.3MB, UPSTREAM.md A1) were needed
  to make CI installable.
- **SwiftShader stall pattern (open investigation)**: examples combining drei's Grid
  WITH a custom node graph (render pipeline or custom outputNode) hang readiness
  silently — zero page errors, 2×180s. Grid-only passes; custom-nodes-only passes.
  Affected: skinning-instancing, rtt, tsl-halftone → `ciSkip` in the manifest
  (exception list per SPEC §10, each with the reason). All three pass on Metal/real
  GPUs. Bisect idea: CI matrix job rendering rtt with grid off vs on. Possibly a
  drei-Grid-shader trigger (fwidth/discard under SwiftShader) — could merge with
  UPSTREAM B6 once bisected.

## For Dennis

1. **Review the wave**: `pnpm contact-sheet` → screenshots/index.html (9/9), or the
   live routes. Per-port DIVERGENCE notes are in each file header.
2. **UPSTREAM.md is the ledger you asked for**: Part A = the 8 things this repo
   carries with unwind conditions; Part B = 11 agent-ready fix briefs (B1 fiber
   UniformNode types — verified still real on v10 HEAD `dc6bbd7`, the improved alias
   pins `TNodeType=unknown`; B9 useThree renderer union; B10 three Fn params;
   B11 @types/three Scene.fogNode; plus the known packaging/rename items).
3. When you push fiber/drei alphas: A1/A2 unwind steps are in the ledger.
4. Repo hygiene when you get a minute: branch protection, and whether to keep
   pushing straight to main or move to PR flow now that CI gates exist.

## Next work (M2 continuation)

1. Wave 2 (~5–10 ports) — pipeline is proven; candidates from the dual-renderer list
   (shadowmap variants, reflection, tonemapping, procedural_texture, sprites/points
   siblings). Same loop: port → review → doc amendments between waves.
2. Screenshot-regression tier (tier 2): goldens on the SwiftShader path, changed
   examples only.
3. Site v1 gallery (M2 list): gallery grid, tag filters, per-example page (code
   view + agent buttons) — the titleblock/manifest already carry the data.
4. SwiftShader stall bisection (see CI section above).

## Session environment notes

- A background `pnpm dev` may still hold :5173 — kill/restart freely.
- `git config http.postBuffer` was raised locally (tarball push exceeded 1MB buffer).
- The repo (AGENTS.md + docs/) is the single source of truth.

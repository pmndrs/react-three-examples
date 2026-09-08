# Review queue — things that need Dennis's eyes

Judgment calls that agents (and I) deliberately did **not** decide alone. Each entry says
what it is, why it needs a human, and what I'd do — so a review is a yes/no, not an
investigation.

**Working agreement**: agents never resolve an entry here. They add one (or drop a
`REVIEW(<topic>):` comment in the code, which the table below mirrors) and move on.
Resolved items move to the bottom with the decision recorded, because the _reasoning_ is
what stops the same question being re-litigated three waves later.

Status: 🔴 blocking a decision · 🟡 wants a look · ⚪️ FYI, no action expected

---

## 🔴 Decisions I can't make for you

_None open as of 2026-09-08._ Both entries formerly here were triaged per Dennis's
2026-09-07 instruction (best judgment: do it now if easy and site-wide/a real defect,
file an issue if it's real work or single-demo, decide-and-record if the entry already
carried a "keep it" recommendation):

- **#1** (`compute-reduce`'s dropped DOM timing readout, covering `storage-buffer` too) —
  single-demo(-pair) polish, new convention needed → **tracked in issue #1**.
- **#1b** (Phase 2 unknowns) — the WebXR and `@react-three/rapier` parts were already
  decided; recorded below in Resolved. The remaining OffscreenCanvas part is blocked on
  upstream work → **tracked in issue #2**.

## 🟡 Worth a look

_None open as of 2026-09-08._ All fourteen entries formerly here were triaged the same
pass: ten were "keep it as shipped" calls with no code change (recorded in Resolved
below), one was a real site-wide fix (#12, done — see Resolved), and three flagged real
but non-urgent work now tracked as issues (#8, #15, #16 — see below).

## Tracked as issues

Real work, or single-demo polish, or blocked on something outside an agent's rules of
engagement this wave — filed in `pmndrs/react-three-examples` rather than decided here.

| review-queue entry                                                                                       | issue                                                         |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| #1 `compute-reduce` / `storage-buffer` dropped DOM timing readout                                        | [#1](https://github.com/pmndrs/react-three-examples/issues/1) |
| #1b OffscreenCanvas worker/`createRoot` story (blocked on upstream — UPSTREAM.md B54)                    | [#2](https://github.com/pmndrs/react-three-examples/issues/2) |
| #8 Seven `REVIEW(shared-instance)` markers — candidates for `<Instances>`                                | [#3](https://github.com/pmndrs/react-three-examples/issues/3) |
| #15 `webgl_batch_lod_bvh` blocked on `@three.ez/batched-mesh-extensions` packaging gap (UPSTREAM.md B51) | [#4](https://github.com/pmndrs/react-three-examples/issues/4) |
| #16 `as unknown as X` → `as X` minimization sweep (~10 files)                                            | [#5](https://github.com/pmndrs/react-three-examples/issues/5) |

## ⚪️ FYI — known, tracked, no decision needed

- **Per-object `onPointerMissed` is not "click on nothing".** fiber calls it for every
  interactive object a pointer event did not hit — including on `pointerover`, before any
  click — so `<mesh onPointerMissed={deselect}>` fires the instant a hover selects the mesh.
  Only the Canvas-level `onPointerMissed` is click-gated (`isClickEvent && !hits.length &&
delta <= 2`). Cost `geometry-spline-editor` a round of debugging; its selection state now
  lives with the `<Canvas>` for that reason. Worth one sentence under § React and the
  ecosystem.

- **The whole corpus, measured both ways** (`pnpm compare --all`, 196 examples with an
  `original` URL): **29,788 vs 34,069 code lines (−12.6%)** and **925,251 vs 1,197,585
  non-whitespace chars (−22.7%)**. 159 are smaller by line; **191 are smaller by content**.
  The gap is prettier's 120-col wrapping of dense TSL — 32 examples read as bloated by line
  and lean by content (`volume-fire` +24.3% / −4.8%, `lights-rectarealight` +20.4% / −17.8%,
  `postprocessing-ao` +14.5% / −15.9%). If any of those were reported to you as regressions
  during the restyle, they weren't.
  The only **five** genuinely larger by content:

  | example                          | lines  | chars  |
  | -------------------------------- | ------ | ------ |
  | `backdrop-water`                 | +59.2% | +18.0% |
  | `geometry-loft`                  | +24.7% | +11.6% |
  | `compute-rasterizer-ibl`         | +40.6% | +8.5%  |
  | `backdrop`                       | +37.0% | +5.1%  |
  | `skinning-instancing-individual` | +44.4% | +3.9%  |

  Three of the five are hand-tuned files of yours, so they are presumably deliberate.

- **Multi-`<Canvas>` examples are half-tested.** Smoke and contact-sheet both capture
  `locator('canvas').first()`, so `camera-logarithmicdepthbuffer`'s second canvas is never
  asserted or photographed. Documented in AGENTS.md § Verification.
- **B28 flakes**: `tsl-wood` (~1 in 5) and `loader-gltf-dispersion` (~3 in 5) fail smoke on
  `PMREM.cubeUv`. Console-only — the canvas renders. 27 examples use drei `<Environment>`,
  so any of them can hit it.
- **`loader-materialx` ships 28 of 31 upstream samples.** Three
  (`standard_surface_brass_tiled`, `_brick_procedural`, `_wood_tiled`) reference sibling
  texture files that don't exist at that path in the upstream `materialx/MaterialX` repo —
  the images live under `resources/Images/`. Verified via the GitHub API; the official
  three.js demo points at the same raw path and 404s identically today. Dropped rather
  than fabricating a corrected path.
- **Tag vocabulary grew by five this wave**: `upscaling` (2 uses), `color-grading`, `crt`,
  `dithering`, `blur` (1 each). Consistent with the ~70 existing single-use effect tags,
  but the vocabulary is meant to be tight — worth a pass once porting is done.
- **Deferred follow-ups** (recorded, not lost): `tsl-vfx-flames/Flames.tsx` and
  `tsl-vfx-tornado/Tornado.tsx` still build materials with `new SpriteNodeMaterial()` +
  post-construction `.colorNode =` (the rule-3 pattern fixed in `Terrain.tsx`);
  `volume-caustics` calls `useUniforms` after suspending loaders (reverse of B18-safe
  order — works today, wants a dedicated audit).

- **B11's `Scene` half is fixed in `@types/three` 0.185.1 — the currently installed
  version, not a future bump.** `declare module "../../scenes/Scene.js" { interface
Scene { environmentNode?; backgroundNode?; fogNode?; } }` lives in
  `renderers/common/Renderer.d.ts` right now (verified: a bare `scene.backgroundNode =
node` with no cast typechecks clean against the installed package). Every
  `scene as unknown as { backgroundNode: Node | null }` cast in the corpus (34 sites,
  33 files) was dead weight — removed in the R3 sweep, comments updated to say so instead
  of "documented cast." `NodeMaterial.colorNode` is ALSO now declared on the base class
  (not just `MeshStandardNodeMaterial`), so a `material` typed as `NodeMaterial` needs no
  cast for `.colorNode` either — checked case by case, since a `material` typed as the
  classic `MeshStandardMaterial`/generic `Material` (the GLTF-loader-return shape) still
  needs one. `emissiveNode`/`clearcoatNode`/light `.colorNode` remain undeclared — B11
  is NOT fully closed, only the `Scene` + base-`NodeMaterial.colorNode` slice of it.
  AGENTS.md's B11 bullet needs a wording pass so the next agent doesn't re-add the cast
  by copying an older example (proposed wording handed to Dennis with the R3 report).

---

## Resolved

| 2026-09-07 | 1c `webgl_morphtargets_webcam` (MediaPipe + webcam) | **Skip.** Not ported; struck in the Phase 2 backlog with the reason. |
| 2026-09-07 | 1d loader gallery: `gltf_progressive_lod`, `gltf_animation_pointer` (Needle packages + off-mirror assets), `loader_3dtiles` (five packages, Cesium key) | **Skip.** Struck in the Phase 2 backlog with the reason. |
| 2026-09-07 | 2 — a slider for a constant the original hard-codes (`pmrem-cubemap`, `cubemap-mix`, `compute-texture-3d`) | **Allowed.** The three keep their slider; rule 4 now says ONE slider, on a constant the demo is about, a handful of lines. |
| 2026-09-03 | webaudio (from 1b) | **Greenlit and ported** — 5 examples in the new `audio/` category, `startClick` manifest field + `<StartOverlay>`; WebXR stays in 1b. |
| 2026-09-03 | `@types/three` `AudioContext.getContext()` mistyped (was #16) | **Ledgered as UPSTREAM B53**; the documented cast stays in `src/utils/resumeAudioContext.ts` until it lands. |
| 2026-09-08 | 1b WebXR (26 + 3 `webgpu_xr_*`) | **Deferred, confirmed** (Dennis, 2026-09-07). Leave for later; when it comes, port and verify a representative 3–4 by hand (`xr_cubes`, `xr_dragging`, `ar_hittest`, `vr_teleport`). |
| 2026-09-08 | 1b `@react-three/rapier` on fiber v10 | **No action.** Declares peer `^9`; the `rapier-basic` probe will report whether it works, and the fallback (inlined three addon over the installed `@dimforge/rapier3d-compat`) is already specified if it doesn't. Revisit only if the probe fails in a way the fallback doesn't cover. |
| 2026-09-08 | 3 Category call: `skinning-instancing-individual` in `animation/` vs `geometry/` | **Keep in `animation/`.** Either is defensible (subject is skinning, technique is instancing); moving it buys nothing. Single-demo taste call, left as shipped. |
| 2026-09-08 | 4 `compute-rasterizer-ibl` size (1535 vs 1092 lines, +40.6%) | **Keep.** By content it's +8.5%, not +40.6% (prettier's 120-col wrapping of dense TSL inflates the line metric). `RasterizerIbl.tsx` at 577 lines is the real number to weigh — it already splits four ways by scene role; splitting further would be splitting to hit a number, which rule 7 says not to do. |
| 2026-09-08 | 5 `tsl/shadertoy` runs indirect `eval` at graph-build time | **Keep, don't generalize.** The transpile IS the demo; it's the only `eval` in the corpus and load-bearing for this one example, verified safe in the production bundle. Not a precedent for anything else. |
| 2026-09-08 | 6 `storage-buffer` drops the original's WebGL-vs-WebGPU backend comparison | **Leave WebGPU-only.** The repo is WebGPU-first by charter; a half-tested second canvas (smoke/screenshot tiers only ever see canvas one) showing a backend we don't otherwise ship is a poor trade. |
| 2026-09-08 | 7 `postprocessing-retro/Smoke.tsx` and `postprocessing-3dlut/Smoke.tsx` duplicate a ~60-line TSL shader | **Leave duplicated.** The two upstream originals also duplicate it, so this is faithful; `src/utils/` is for pieces drei lacks, not shared example assets. Revisit (a `src/assets/`-style home for shared scene pieces) only if a third example wants the same shader. |
| 2026-09-08 | 9 `scene/backdrop-area.tsx`'s "N materials built up front, one live" pattern has no name in rule 3 | **Leave as `REVIEW(shared-instance)`.** Only one occurrence so far; not worth naming a new pattern for a single site. Revisit if it recurs. |
| 2026-09-08 | 10 `loader-texture-ktx2` introduces `ErrorBoundary` — new precedent | **Blessed.** Reasonable for a 16-variant format gallery where one unsupported KTX2 variant should degrade instead of killing the page. Precedent stands for the same shape (per-resource degradation in a multi-item gallery); not a general error-boundary invitation. |
| 2026-09-08 | 11 Files over the ~200 code-line split guideline (`RasterizerIbl.tsx` 577, `VolumeFire.tsx` 367, `Water.tsx` 362, `Exhibits.tsx` 257, `Herd.tsx` 233, `Birds.tsx` 232, `Cloth.tsx` 225) | **Accept as-is.** The guideline is "split by scene role," not "hit a number under 200" — each of these already splits by role, and the largest three are hand-tuned files, presumably deliberate. |
| 2026-09-08 | 12 Site: search filtered the sidebar but not the home gallery | **Fixed in code.** Filter state (free-text `?q=` + `?tag=`) lifted into a shared `src/app/useExampleFilter.ts` hook, consumed by both `Layout.tsx` (sidebar) and `Home.tsx` (gallery) — a search or tag pick made in either place now narrows both, deep-links on first paint, and the gallery shows a result count + empty state. Verified with a scratch Playwright script (typed search narrows the gallery card count and updates the header count; a tag chip click narrows it and updates the URL; `?tag=` and `?q=` deep links filter on first paint; a no-match query shows the empty state) plus `npx tsc --noEmit && pnpm lint && pnpm build`. |
| 2026-09-08 | 13 drei `<Html>` (non-transform) loses a label on a STATIC object under StrictMode | **Fully resolved, no further action.** Workaround (`eps={-1}` + `REVIEW(drei-html-eps)`) already shipped in `scene/label.tsx`; AGENTS.md § React and the ecosystem documents the trap; UPSTREAM.md brief **B50** already filed with the fix recommendation. |
| 2026-09-08 | 14 `css3d_sprites` → slug `css3d-sprites` (prefix kept on collision) | **Accepted, already documented.** AGENTS.md § Files, routes, manifest already states the collision rule ("when the bare name collides with a shipped slug, keep the original's prefix"). No further action. |

| decided    | what                                                                    | outcome                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-02 | Rule 3 vs `useMemo`'d materials shared across many meshes               | **Performance wins when sharing is real**, but flag it with `REVIEW(shared-instance):` so a human can check whether `<Instances>` is the better answer. Rule 3 amended.                                                                                                                                                                                                                           |
| 2026-09-02 | `postprocessing.tsx`'s 4 sliders for constants the original hard-codes  | **Keep.** They adjust hidden constants and cost ~8 lines.                                                                                                                                                                                                                                                                                                                                         |
| 2026-09-02 | Formatter                                                               | **Prettier, r3f's config, with `semi: true`** — Dennis writes semicolons and `semi: false` was deleting them.                                                                                                                                                                                                                                                                                     |
| 2026-09-02 | Which unported examples to cut                                          | **10 excluded** (renderer-internal/benchmark pages) + **7 deferred** by rules SPEC §4 already had (WebXR, webaudio, TSL tooling). Enumerated in SPEC §4.                                                                                                                                                                                                                                          |
| 2026-09-02 | Action-bar buttons                                                      | **Real brand icons**, not text monograms.                                                                                                                                                                                                                                                                                                                                                         |
| 2026-09-02 | `materials-texture-html`'s runtime CDN import of `three-html-render`    | **Keep the CDN import, matching the original.** The rule Dennis set: a stable library gets installed properly; a shim for an unshipped browser API does what upstream does. WICG HTML-in-Canvas ships nowhere stable, so the polyfill stays a pinned, feature-detected runtime import rather than a 0.1.x lockfile entry we'd remove once the API lands. AGENTS.md § Repo format now states this. |
| 2026-09-02 | `skinning-instancing-individual` at "+44%, worst overrun in the corpus" | **Closed — the premise was a measurement artifact.** +44.4% by line but **+3.9% by content**; `pnpm compare` now prints both. Corpus-wide, 191 of 196 examples are smaller than their original by content and only 5 are genuinely larger. Compute-instanced skinning at +3.9% is squarely the irreducible-work category.                                                                         |
| 2026-09-03 | `<threeLine>` crashes on its first prop update (fiber alpha.4)          | **Fixed in code + filed as B44.** `src/assets/ThreeLine.ts` shims `extend({ ThreeLine: Line })`; imported by `decals`, `geometry-nurbs`, `lines-dashed`, `modifier-curve`.                                                                                                                                                                                                                        |
| 2026-09-03 | drei `<TransformControls>` never mounts `getHelper()` — no gizmo        | **Fixed in code + filed as B46.** `geometry-spline-editor` and `modifier-curve` both render `{gizmo && <primitive object={gizmo.getHelper()} />}` via the setter-as-ref pattern, marked `TODO(drei-gap):`.                                                                                                                                                                                        |
| 2026-09-03 | fiber `diffProps` resets a dropped node-material prop to `0`            | **Fixed in code + filed as B47.** `BlobMaterial.tsx` remounts on switch (`<Fragment key={name}>`) instead of relying on the diff; AGENTS.md § React and the ecosystem documents the trap.                                                                                                                                                                                                         |

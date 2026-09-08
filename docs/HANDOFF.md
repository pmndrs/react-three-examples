# Session Handoff — 2026-07-27/29 (overnight, continued: repo live + M2 waves 1–3)

## 2026-09-08 — CI fixed, upstream handed off directly

**Nightly root cause was NOT B28.** A week of red runs contained zero `PMREM.cubeUv`
occurrences; all 11 affected examples hit `WebGPU Device Lost` — SwiftShader dropping the
device under memory pressure across a 1.5h SERIAL run in one browser process (253 passed,
4 failed, 7 flaky). Fixed three ways: the smoke job is now a 4-way `--shard` matrix;
`fullyParallel` is enabled in CI because **`--shard` splits by FILE, and the whole corpus
is one spec file** — without it shard 1 would have taken all 268 tests and shards 2-4 none
(verified 268/0/0/0 with `--list`, 67x4 after), a silent no-op that would have looked like
a working matrix; `workers: 1` per shard keeps concurrent WebGPU contexts off one
rasterizer. `WebGPU Device Lost` is now a named CI-only tolerated environment fault
(`CI_ENVIRONMENT_FAULTS` in `tests/smoke.spec.ts`), reported as a warning — it is
renderer-emitted, never reproduces on Metal, and every assertion proving the example works
runs before the console check. Local runs stay strict. All GitHub actions bumped to Node
24 majors; the deploy workflow's deprecation warning went 2 -> 0.

**Upstream handed off directly** (Dennis, 2026-09-08) — no issues filed from
`docs/upstream-issues/`; those drafts are now evidence, not a queue. UPSTREAM.md's filing
plan is marked superseded.

## 2026-09-07 — Pages live, upstream audit folded in, B48 fixed

Site deployed: https://pmndrs.github.io/react-three-examples/ (`deploy.yml`, BASE_PATH
variable, 404 fallback; first run green, live URL curl-checked). Upstream audit (Sonnet,
four sub-checks) folded into UPSTREAM.md: every brief has a `Status 2026-09-07` line; B18
retired (fixed in alpha.4, nobody had marked it); B13 stale; B10 reshaped (`Fn` params are
silent `any`); B29 fixed upstream, lands with r186; B1/B45 already filed (do not refile);
B54 new (fiber OffscreenCanvas story, Dennis wants it). 27 drafts in `docs/upstream-issues/`
with an index; drei drafts must be checked against Dennis's own drei "WebGPU Correctness"
milestone (#2801–#2828) first. B48 fixed in `camera/controls.tsx` (ArcballControls gizmo
added to the scene by hand, `TODO(drei-gap)`). One agent claim was wrong and corrected:
`Scene.*Node` IS typed in 0.185.1 via a `declare module` augmentation in `Renderer.d.ts`,
not `Scene.d.ts` — reading only `Scene.d.ts` misleads.

## 2026-09-07 — R3 + R4 landed on Sonnet agents

**R4 site v1** (`4b2d669`): sidebar tag filter (`?tag=`), code view (`ExamplePage.tsx` +
`CodePanel.tsx`, `?raw` glob, leva hidden while open), `pnpm thumbs` → `public/thumbs/*.jpg`
(268/268, 3.6MB, 8 flagged dark were real dark scenes), OG tags + `public/og.jpg`,
`useDocumentMeta`. Per-route OG for crawlers still needs a prerender step (SITE.md). Wanted
dependency: `shiki`.
**R3 corpus polish**: credits — 2 of 93 blank entries filled (`compute-reduce`,
`postprocessing-ssaa`), 91 confirmed unattributed in the original. B41 audit: `lights-dynamic`
was a second live case (DynamicLighting never engaged; moved to the renderer factory,
before/after screenshot proves it). Casts 97 → 60, families in AGENTS.md; `scene.*Node` is
typed in `@types/three` 0.185.1 so B11 narrows. 38 touched examples green on smoke+animates.
Agent added REVIEW-QUEUE #16 (double-hop vs single casts) and flagged #11's file table stale.

## 2026-09-07 — pushed, MIT, drei alpha.7, decisions recorded

Dennis's status audit (artifact "Road to 1.0") led to: `main` pushed (39 commits, first push
since Jul 28), `LICENSE` MIT, `package.json` license field, README count fixed. Decisions:
XR deferred; OffscreenCanvas WANTED (stays blocked on a fiber worker/createRoot story — the
upstream audit drafts the ask); MediaPipe webcam + Needle loaders + 3D Tiles skipped;
rule-4 slider allowed at one per example. `compute-reduce` Dennis takes himself. drei bumped
to 11.0.0-alpha.7 (no dev server was running; `node_modules/.vite` wiped; tsc/lint/build
clean; scoped smoke on `controls`, `geometry-spline-editor`, `label`, `orientation`,
`loader-gltf`). Next: R3 corpus polish + R4 site v1 + upstream/types audit on Sonnet agents.

## 2026-09-03 — webaudio wave: 5 examples, `audio` category, `startClick`

Dennis greenlit webaudio after a Sonnet feasibility pass (XR stays deferred: no automated
session verification, and `XRGPUBinding` is unshipped so even `webgpu_xr_*` runs through a
WebGL renderer swap fiber can't express — REVIEW-QUEUE 1b has the detail). A Sonnet agent
ported `orientation`, `sandbox`, `timing`, `visualizer` (WebGLRenderer originals → WebGPU)
and `compute-audio` into new `src/examples/audio/`, all five green on tsc/lint/build/smoke/
animates, screenshots checked here. Harness: manifest `startClick` (CSS selector clicked
before readiness in smoke, animates and the contact sheet — a trusted Playwright click was
enough, no autoplay flag). Shared `src/utils/StartOverlay.tsx` + `resumeAudioContext.ts`.
Four real bugs the agent found by running, not reading: CORS-tainted `MediaElementSource`
outputs zeros without `crossOrigin="anonymous"`; `setMediaElementSource` is once-per-element
and StrictMode remounts call it twice (guard on `hasPlaybackControl`); `compute-audio`'s async
effect deadlocked itself under StrictMode (replaced with latest-run-wins); `sandbox` was black
because fiber's default `lookAt` poisons `<FirstPersonControls>` permanently. All four are now
AGENTS.md bullets (v1.3). UPSTREAM **B53** filed (`@types/three` `AudioContext.getContext()`).
Corpus **263 → 268**; AGENTS.md categories list was stale at 15 (never got `physics`) — now 17.

## 2026-09-03 — TSL tooling pages excluded; inventory now quotes reasons

Dennis ruled `webgpu_tsl_editor`, `webgpu_tsl_transpiler` and `webgpu_tsl_graph` **internal
tooling, not porting** (their UI — Monaco, the Inspector graph — is the demo; the transpiler
runtime already ships inside `shadertoy`). SPEC §3/§4 (v1.2 amendment), ROADMAP and the Phase
1 backlog updated; final phase is WebXR + webaudio only (4 deferred, 13 excluded).
`pnpm inventory` now carries the backlog's own reason text into every "not worth a page" row
(previously a bare "skipped with a recorded reason (Phase 2 backlog)" pointer) and runs
prettier on its output, so [DEMO-INVENTORY.md](DEMO-INVENTORY.md) answers "why not" by
itself. Counts after: WORTH 314, HAVE 274, BLOCKED 6, LATER 34, GAP 0.

## Wave 4 — Phase 2 end-of-wave compile (2026-09-03)

Every porting agent from "Phase 2 greenlit" (below) finished; this session ran the
mechanical close-out — environment, one last port, full verification, measurement,
docs, review-queue tidy. It did not see the individual batch transcripts, so the
per-batch narrative below is reconstructed from what the repo shows (examples.json,
REVIEW-QUEUE.md, UPSTREAM.md, the backlog checkboxes), not from agent self-reports.

**Corpus**: 198 → **263** examples (+65, all Phase 2 — Phase 1's 197 `webgpu_*` ports +
`hello-webgpu` were already complete going into this wave). 16 categories (`physics` was
added). Backlog: **66 of 72 planned ports done, 8 skipped, 6 review-queued, 0 rows left
undecided** ([PORTING-BACKLOG-PHASE2.md](PORTING-BACKLOG-PHASE2.md)) — geometry addons,
modifiers/marching-cubes, interaction/picking, the six `physics/rapier-*` + `games_fps`
probe, `misc_controls_*` (collapsed to one `controls` page), `misc_exporter_*` (collapsed
to one `exporter` page), `css2d_`/`css3d_` → drei `<Html>`, and the loader-gallery/Class-C
re-check batches all landed. Measured whole (`pnpm compare --all`, 262 of 263 examples
carry an `original` anchor): **37439 vs 45126 lines (−17.0%), 1,154,680 vs 1,537,734
chars (−24.9%)**; 217/262 smaller by line, **251/262 smaller by content**. The Phase-2-only
slice (65 examples, non-`webgpu_` anchor) reads leaner than Phase 1's: **−32.1% lines,
−34.2% chars** — expected, since Phase 2 was picked for exactly the scene-graph/event
demos where R3F collapses hardest.

**This session's own close-out work**: ported the last easy Phase 2 item,
`texture-lottie` (`webgl_loader_texture_lottie` → `src/examples/textures/`) — `lottie-web`
installed as an ordinary dependency (not a CDN import; it's a real library, not an
unshipped-API polyfill) per REVIEW-QUEUE's prior call, RoomEnvironment + RoundedBoxGeometry
reused from existing corpus precedent, +11.8% lines / **−12.4% chars** against the
original. Full smoke sweep: **261/263**, both failures the known B28 `PMREM.cubeUv` flake
(`tsl-wood` reproduced consistently this run — this machine had several other concurrent
Claude Code sessions competing for the GPU at the time, a plausible aggravating factor;
`materials-car`, not previously a documented B28 site, passed clean on a scoped re-run,
confirming a one-off hit rather than a regression).

**B44–B52 filed or closed this wave** (one clause each): **B44** `<threeLine>` crashes on
its first prop update, shimmed (`src/assets/ThreeLine.ts`) — **fixed in code**. **B45**
drei `<Hud>` double-renders the default scene on v10. **B46** drei `<TransformControls>`
never mounts `getHelper()`, no gizmo/drag — **fixed in code** (`geometry-spline-editor`,
`modifier-curve`). **B47** fiber `diffProps` resets a dropped node-material prop to `0`,
not its default — **fixed in code** (`BlobMaterial.tsx` remounts on switch instead).
**B48** drei `<ArcballControls>` built without `scene`, gizmo can never appear. **B49**
drei's `/webgpu` build reads the deprecated `state.gl` alias in 33 places. **B50** drei
`<Html>` parks at −9999px forever on a static object under StrictMode, workaround
`eps={-1}`. **B51** `@three.ez/batched-mesh-extensions`'s `package.json` `exports` maps
only the WebGL build though a WebGPU one ships on disk — blocks `webgl_batch_lod_bvh`.
**B52** `@react-three/eslint-plugin`'s `no-clone-in-loop` matches the bare identifier
`clone`, not `.clone()` calls — a `for (const clone of clones)` loop variable false-
positives.

**Every batch's real bugs were found by an interactive probe, not by either test tier** —
this is now the clearest pattern across the whole Phase 2 wave, and it's the reason
AGENTS.md § Verification now requires one click-through for any control-heavy port.
Evidence, all from this wave: `<threeLine>` (B44) only crashes on a parent RE-RENDER,
which neither smoke nor animates ever causes; drei `<TransformControls>` (B46) mounts
clean and reports the right hover/select state while silently drawing no gizmo and
accepting no drag; `fiber diffProps` (B47) only shows up when a material element's PROP
SET changes between two renders, not on any single render; drei `<Html>` (B50) only fails
under StrictMode on an object that never moves, which a static screenshot can't
distinguish from working. This session added a seventh: `exporter`'s Export button
silently no-opped on **every** format, every click, because leva's `button()` callback
hands you `store.get` directly (`leva/dist/leva.esm.js:1379,1425`) — not the folder-aware
`get()` `useControls`'s object form gives you — so the bare sibling key `get('format')`
resolved to `undefined` inside the named `'Export'` folder with no error anywhere. Found
only because this compile explicitly clicked all 8 format buttons and asserted a real
`download` event; fixed by qualifying the path (`get('Export.format')`). Six drei/fiber
issues plus this one leva issue are the set that would have shipped silently broken behind
a green two-tier CI and a clean default-state screenshot: `<threeLine>`, `<TransformControls>`
gizmo, `diffProps`→`0`, `<Html>` eps, `<ArcballControls>` gizmo (B48, not yet worked
around in `camera/controls`), `material.clippingPlanes` (inert on WebGPU — see AGENTS.md),
and leva's unqualified-`get()` footgun.

**What's left**: the 6 review-queued Phase 2 items (`webgl_batch_lod_bvh` — packaging gap,
B51; `webgl_morphtargets_webcam` — needs `@mediapipe/tasks-vision` + a recorded-video
fallback; the three needle-tools/3D-tiles loader blockers; `webgl_worker_offscreencanvas`
— no fiber worker-root story) all have a REVIEW-QUEUE entry with a recommendation, none
need more agent time to resolve — they need Dennis's yes/no. The XR (26) + webaudio (4)
final phase is unstarted by design (SPEC/backlog 2F): nothing in this environment can
enter an XR session to verify one, so REVIEW-QUEUE recommends Dennis port and hand-verify
3–4 representative examples himself rather than agents shipping 30 unverifiable pages.

_A note this session can't independently confirm: whether later Phase 2 batches ran on a
different underlying model than earlier ones. Nothing in this session's context (repo
state, docs, REVIEW-QUEUE) carries that information — if it's true and relevant, the
agent or session that ran those batches is the source for it, not this compile._

## Phase 2 greenlit — wave 4 group 1 in flight (2026-09-03)

Dennis: _"continue on the list until we have as much covered as we can; stuck > a few
minutes → REVIEW-QUEUE; mark why we skipped."_ Patterns track is out of 1.0 and likely a
separate repo.

**The webgl audit was re-verified and held**, with two corrections now in
[PORTING-BACKLOG-PHASE2.md](PORTING-BACKLOG-PHASE2.md): 77 non-`webgl_`/`webgpu_` examples
(physics, controls, css3d, games) had never been audited at all, and the audit's
"low-value" test was three.js-technique-centric where ours is "where is R3F clearer".
Result: **77 ports · 50 skips (each with a reason) · 1 review · 31 final-phase (XR/audio,
unverifiable here — review-queued).** Loader rule from Dennis: a loader that just loads a
model is not needed; 12 of 47 earn a page.

Feasibility checked before launch: path tracer is WebGL-only (skip), `AsciiEffect` takes a
`WebGLRenderer` (skip), fiber v10 has no OffscreenCanvas worker story (review), no
`GlitchNode` in r185 TSL (hand-port), `@react-three/rapier` peers on fiber `^9` (**the
`rapier-basic` port is a probe**, fallback specified: inline three's `RapierPhysics`
addon over the installed `@dimforge/rapier3d-compat`, replacing its skypack CDN import).
Deps installed with the server down / cache cleared / restarted / verified, before any
agent launched — the wave-2 lesson.

Group 1 (running): geometry addons ×9, modifiers + marching cubes ×6, interaction/picking
×8, physics probe + 6. Group 2 queued: controls/drei, animation, css3d→`<Html>`, loaders,
materials/misc.

`scripts/tick-backlog.mjs` now reads both backlog files and matches on the manifest's
`original` anchor as well as the slug (Phase 2 lists originals by name).

## Porting wave 3 — the last 31, 168 -> 198 (2026-09-02)

Phase 1 is **effectively complete**: 196 of 214 r185 examples ported, 10 excluded,
7 deferred. Six batches: SSR/SSGI family, compute, misc, filters, AA/DOF, buffers +
upscaling, TSL/caustics — plus `postprocessing-ssgi-ballpool`, which needed a real
dependency (below).

### Three AGENTS.md rules were WRONG, not just incomplete

Each had already cost an agent real time, and each was verified before rewriting:

- **"Addons with no `.d.ts` still typecheck (TS infers from JSDoc)"** — false. There is no
  `allowJs`, so it is `TS7016`. Probed directly by pulling `src/types/meshopt.d.ts` and
  compiling. r185's `meshopt_clusterizer`/`_simplifier` are the live case (B38).
- **"Hold non-node instances in lazy `useState`"** — safe for CPU-side objects, wrong for
  anything the GPU binds. StrictMode double-invokes the initializer; a create-once hook
  keeps the FIRST instance while the component commits the SECOND, so an
  `IndirectStorageBufferAttribute` reaches the graph with no GPU buffer and dies at
  `dispatchWorkgroupsIndirect`. Use `useBuffers`.
- **`useUniforms` reconciles on every React re-render** and writes the declared value back
  over whatever `useFrame` wrote — so dragging an unrelated leva slider resets a
  frame-driven uniform. Verified in fiber's source
  (`reconcile: … if (!equals) existing.value = newVal`). Frame-owned uniforms are plain
  `uniform()` inside `useNodes`. **This one contradicted how much of the corpus reads**,
  which is why it was checked rather than taken on report.

### The line metric was lying, and now there are two

`compute-rasterizer-ibl` reads **+40.6% by line and +8.5% by content**; `postprocessing-retro`
**+3.9% / −14.1%**; `tsl-vfx-linkedparticles` **+15.0% / −17.4%**. Prettier wraps dense TSL
at 120 cols where the original spent one long line — the line count was measuring our
formatter. `pnpm compare` now prints non-whitespace chars alongside. The two agree
everywhere else, which is what makes the divergence diagnostic rather than flattering.

### New tooling, both filling a gap the docs already assumed

- **`pnpm shot:original <name>`** — captures the LIVE three.js original. AGENTS.md has
  always said to compare against the live original rather than the stale gallery
  thumbnail; there was no tool for that half, so it largely didn't happen.
- **`SHOT_DELAY_MS`** on `pnpm shot`, for demos whose picture develops over seconds.

Together they settled `compute-reduce`: our flat square is **faithful** (the original's
planes are flat white too) — but the capture showed the demo's substance lives in the DOM
we drop as page furniture (pass counts, GPU timings, the subgroup explainer). Filed as a
🔴 decision, since `storage-buffer` dropped `trackTimestamp` for the same reason.

### A new dependency, under the rule set the same day

`postprocessing-ssgi-ballpool`'s original drives everything through `@perplexdotgg/bounce`
from a CDN import map. The runtime-CDN-JS rule settled that morning says a CDN import is
only for polyfilling an unshipped browser API — an ordinary library gets installed. So
`@perplexdotgg/bounce ^1.10.0` is now a real dependency (MIT, typed, one transitive dep).
It is newer than the original's 1.8.1.

### Other findings

- **Prototype patching is module-scope mutable state.** `postprocessing-ssr-denoise`'s
  original patches `PhysicalLightingModel.prototype` at module scope; in this SPA that
  would follow the user into every later example. Symmetric `useLayoutEffect` instead.
- **`passes.scenePass` is `undefined` on the first render** — pattern (d) always reads it
  in an effect, and unguarded it surfaces as a readiness timeout, not an error.
- **`<line>` is `<threeLine>`** — fiber omits `line`/`path`/`audio`/`source`; `<line>`
  compiles as SVG and renders nothing.
- New UPSTREAM briefs **B36** (drei `<CurveModifier>` is WebGL-only on the `/webgpu`
  entry), **B37** (`NodeBuilder.context` is `unknown`), **B38** (meshopt declarations),
  **B39** (`PassNode.options` undeclared).
- Two upstream bugs fixed in `tsl-vfx-linkedparticles`: the spawn-rate slider _thins_ the
  emitter (thread count baked at build, ring index uses the live value), and the cursor
  plane normal compounds every frame so the emitter drifts off the cursor as you orbit.

### The wave sweep earned its keep: `lights-clustered` was silently broken

Not a wave-3 example — a wave-2 one that regressed when the environment was reset
(`pnpm add` + a fresh Vite pre-bundle changed the init ordering it had been getting away
with). `Lighting.getNode(scene)` caches into a **module-level** WeakMap, so the first
manager to touch a scene owns its lights node permanently; the renderer's default
`Lighting` was winning, and `renderer.lighting = new ClusteredLighting()` from a Canvas
child changed the field but not the node anyone read back (UPSTREAM B41).

**It took three attempts, and the first two were reasonable and wrong**, which is the part
worth remembering:

1. Moved the install to `onCreated` — this made it strictly LATER. The identical error
   message hid that the change had any effect at all.
2. Probed the actual ordering: **a Canvas child's `useLayoutEffect` runs BEFORE
   `onCreated`.** That inverts the obvious guess, and nothing in the docs said so.
3. Installed it in the renderer FACTORY (`renderer={(props) => …}`) — construction time,
   which is where the vanilla original does it. Green on both tiers, and the screenshot
   confirms ~800 orbs each casting coloured light, so clustered shading genuinely engaged.

**The crash was lucky.** It only threw because the overlay calls a clustered-only method
(`setSize`). An example that merely read the node would have rendered with DEFAULT
lighting — looking plausible, passing smoke, passing animates, passing a screenshot
review. Worth assuming other silent-substitution bugs of this shape exist.

Lesson now in AGENTS.md: not every construction-time concern can move into a React effect,
and when a fix keeps failing with the identical error, probe the ordering rather than
moving the call again.

### Infrastructure note

Three agents were killed mid-flight when the machine slept. Two had written nothing; two
left structurally-complete but **unverified** files that were already registered in the
manifest. Relaunched agents were told to treat those as unreviewed drafts rather than
trust or overwrite them. Worth remembering: a registered-but-unverified example is the
failure mode that slips into a commit unnoticed.

## Porting wave 2 — 21 examples, 147 -> 168 (2026-09-02)

lights 6, scene 7, materials+animation 8. **2584 vs 3143 code lines — -17.8%.**
`pnpm tick` says **31 left to port**.

Standouts: `skinning` 43 vs 84, `multiple-canvas` 77 vs 135, `lightprobe` 59 vs 123,
`loader-materialx` 174 vs 216. Only `lights-clustered` over, at +15.

### Two real bugs found, neither a style nit

- **`lights-clustered` crashed every frame** (`Cannot read properties of null (reading
'toVar')`). The resize effect calling `.setSize()` — which lazily allocates the
  cluster-index buffers the heatmap node reads — was a passive `useEffect`, firing AFTER
  the first RAF render. `useLayoutEffect` fixed it. The "imperative setup that must precede
  first render" rule catching a hard failure.
- **B15 bites at scale, in an unrecognisable shape.** `loader-materialx` renders 28
  independently-suspending samples, each in its own boundary, beside an `<Environment>` in
  a SEPARATE boundary. Some samples built their node material before `scene.environment`
  existed and permanently baked in "no IBL" — solid black, no error. Fix: nest the per-item
  boundaries inside the same outer `<Suspense>` as the Environment. **Many small boundaries
  is the risky shape**, not just one. Added to AGENTS.md.

### New traps documented

- **`useUniforms` takes VALUES, not nodes.** `useUniforms({ tint: color('#f00') })` throws
  `Uniform node not implemented` at shader-build time. Pass `new Color('#f00')`.
- **Multi-canvas: `renderer.domElement` is the PRIMARY canvas.** All roots share one
  `WebGPURenderer` whose `domElement` is fixed at construction, so DOM listeners on a
  secondary canvas attach to the wrong element — `src/utils/CameraControls.tsx` cannot be
  reused as-is there.
- **UPSTREAM B35**: a field declared as a bare `Node` loses the entire fluent TSL surface.
  `LightingModelReflectedLight.directDiffuse` is `Node`, so the canonical
  `reflectedLight.directDiffuse.addAssign(…)` doesn't typecheck. Verified: `addAssign` is
  declared on the TYPED extension interfaces in `OperatorNode.d.ts`. Same family as B10.

### The dead-code rule keeps paying

`volume-lighting-traa`'s original builds a `volumetricIntensity` uniform, wires it to a
slider, and never multiplies it into anything. Verified, then dropped — same class as
`volume_lighting`'s no-op `spotLight.lookAt()`.

### Shared utils grew (second request, so it earned a prop)

`CameraControls` + `DemoHelpers` gained `minAzimuthAngle`/`maxAzimuthAngle`, defaulting to
`±Infinity` so unset means free-spin. `morphtargets-face` was the second port to want a
horizontal-orbit lock and reach for the `controlsRef` escape hatch.

New shared addon: `src/assets/LightProbeHelper.ts` — a cleaner `extend()` candidate than
the imperative helper precedent, because it self-refreshes via `onBeforeRender()`.

### Needs Dennis (in REVIEW-QUEUE.md)

- 🔴 **`materials-texture-html` loads EXECUTABLE JS from a CDN at runtime**
  (`three-html-render@0.1.2`, pinned, feature-detected — the original does the same).
  A new dependency category: § Assets covers hotlinked DATA, not runtime third-party JS
  outside the lockfile. My call: add it as a real dependency if the package is sane.

### FYI

`loader-materialx` ships 28 of 31 upstream samples. Three reference sibling textures that
don't exist at that path upstream (they live under `resources/Images/`) — verified via the
GitHub API; the official three.js demo 404s identically today. Dropped, not fabricated.

### Verified

tsc 0, lint 0, build clean, manifest `--check` clean, smoke **167/168** — sole failure
`tsl-wood`, confirmed by its `PMREM.cubeUv` signature (B28, ~1 in 5).

## Porting wave 1 — 16 new examples, 131 -> 147 (2026-09-02)

First ports against `PORTING-BRIEF.md`. reflections 5, textures+camera 6, geometry 5.

| batch                 | result vs original (code lines, comments stripped BOTH sides) |
| --------------------- | ------------------------------------------------------------- |
| reflections (5)       | 413 vs 497, **-16.9%** — 4 of 5 under                         |
| textures + camera (6) | 643 vs 939, **-31.5%** — 6 of 6 under                         |
| geometry (5)          | 1047 vs 984, **+6.4%** — 4 of 5 under, one big overrun        |

### The measurement was wrong twice, both my fault

1. Agents compared against the extracted `<script>`, not the `.html`, making good ports
   look 2x bloated. The `.html` IS the original. Dennis had corrected me on this earlier in
   the session and I failed to put it in the brief.
2. Then Dennis pointed out I was counting OUR comments against an original that has almost
   none. Built `scripts/compare-lines.mjs` (`pnpm compare <slug>… | --all`) to strip
   comments and blanks from both sides.

That tool then had two bugs of its own, both found by looking at implausible output:

- **slug-equals-category**: `postprocessing.tsx`/`camera.tsx` live in folders named after
  themselves, so sibling-detection swept the whole category — `postprocessing` read 680
  lines instead of 74. Fixed by disambiguating on path DEPTH.
- **regex comment-stripping ate code**: replacing `/* … */` spans deletes their newlines and
  a stray `*/` swallows real lines; a 55-line file counted as 21. Rewritten line-oriented
  with block-state tracking.

**Corpus-wide, corrected: 19,901 vs 22,688 code lines — 12.3% fewer. 111 smaller, 31 larger.**
Biggest wins are scene-graph-heavy (`animation-skinning-blending` 73 vs 301); overruns are
small and pipeline/TSL-heavy, which is the documented parity outcome.

### The find of the wave — silent StrictMode failure

`skinning-instancing-individual` rendered BLACK in dev and worked perfectly in a production
build. Root cause: a `useMemo` mutated the Suspense-CACHED GLTF scene graph
(`source.visible = false`, `parent.add(mesh)`) with no cleanup, so StrictMode's
mount→unmount→remount left two coexisting compute-kernel/storage-buffer sets on one
skeleton and the surviving mount's compute writes never reached the renderer. **No thrown
error, no console warning**; `getArrayBufferAsync` readback showed all zeros. Fixed with a
symmetric `useEffect`. Added to AGENTS.md — the existing StrictMode rule only covered
material disposal, this is a distinct second case.

### Other findings

- **UPSTREAM B32** — `three/addons/libs/demuxer_mp4.js` ships NO type declarations at all
  (not even JSDoc-inferable). Needed `src/types/demuxer-mp4.d.ts`.
- **UPSTREAM B33** — `VideoFrameTexture.image` is `VideoFrame | {}`; `instanceof` narrowing
  doesn't reach `.close()`, forcing a cast on the call that prevents a GPU-memory leak.
- **UPSTREAM B34** — `count` is declared on `Mesh` but NOT `Points`/`Line`, though the
  renderer honours it on all three. Two corpus casts are therefore correct and must stay.
  (The `Mesh` half was fixed in 0.185.1 — `instance-path` sets `<mesh count>` uncast.)
- **AGENTS.md § Verification**: multi-`<Canvas>` examples are only half-tested — smoke and
  contact-sheet both capture `locator('canvas').first()`.
  `camera-logarithmicdepthbuffer` is the first example that genuinely needs two.
- `loader-texture-ktx2` introduces the corpus's first `ErrorBoundary` (per-texture, so an
  unsupported format degrades instead of killing the page). New precedent.
- `video-frame` needed `DefaultLoadingManager.itemStart/itemEnd` around the first decode —
  without it readiness fired on a black plane and both smoke and `pnpm shot` raced the
  network.

### Needs Dennis

- `skinning-instancing-individual` is **462 vs 320 (+44%)**, the worst overrun in the wave.
  `rig.ts` is genuine CPU-side data prep the original also does (verified), and it carries
  the StrictMode fix, but it is the one to look at.
- `skinning-instancing-individual` was moved to `animation/` (from the geometry batch) to
  sit beside `skinning-instancing`. Reasonable, but a category call.

### Verified

tsc 0, lint 0, manifest `--check` clean, smoke **145/147** — both failures the known B28
flakes (`tsl-wood` with the signature, `loader-gltf-dispersion` passing on retry).

### Remaining

**52 to port** (68 minus this wave's 16). Backlog in `docs/PORTING-BACKLOG.md`.

## Site shell — home, search, action bar (2026-09-02)

Built by an agent in an isolated worktree, then merged. `src/app/` went 158 -> ~1000 lines.

- **Home page** at `/` replacing the redirect-to-first-example: hero, GitHub link, and the
  full gallery grouped by category. Screenshots were NOT used — `screenshots/` is
  gitignored and unserved (the agent checked before depending on it), so cards use a
  per-category accent instead.
- **Sidebar**: grouped by category, sorted within group, live substring search over
  title/slug/tags/category, dependency-free. Active item auto-scrolls into view on
  navigation but not on keystroke.
- **Action bar** (`src/app/agentLinks.ts`): GitHub source, StackBlitz, vscode.dev,
  Codespaces, Claude Code, Cursor. Rejected per `research/agent-open-buttons.md`:
  OpenAI Codex (no URL-launch scheme) and CodeSandbox (repo imports dead since Apr 2026).
- **`category` in the manifest**, plus tag normalisation 172 -> 162 distinct
  (`post-processing`->`postprocessing` x10, `shadow`->`shadows`, kebab-casing 15 outliers).
  Generated by `scripts/generate-manifest.mjs` (`pnpm generate:manifest`, `--check` for CI).

### MY ERROR: the worktree branched from a stale commit

I launched the worktree without pinning it to HEAD, so it branched from **`07c34b6` —
four commits behind**, before the category reorg, AGENTS v1.1 and prettier. The agent
handled it correctly: it detected the drift, matched the tree it actually saw, and
documented the discrepancy rather than assuming the brief was right.

Fixing it took a merge with 7 conflicts:

- `routes.ts` — hand-merged: main's depth-agnostic basename-vs-manifest matching PLUS the
  agent's new `exampleFilePaths` export, both now derived from the SAME glob.
- `generate-manifest.mjs` — the agent hand-maintained a 165-line `slug -> category` table
  because the stale base had no category folders. **Rewritten to read category off the
  folder**, which is what the layout now supports and removes a drift class (a moved
  example silently keeping a stale category). Script 299 -> 167 lines.
- `examples.json` — took main's, re-derived via the fixed generator.

**Lesson: pin a worktree to current HEAD when launching it.**

### Two bugs I found by verifying rather than trusting the report

1. **StackBlitz URL was wrong.** It pointed at the example's DIRECTORY. The research doc's
   "best-in-class subfolder support" is true for MONOREPOS where the subfolder is a
   project — this repo is ONE Vite app, so `src/examples/<category>/` has no package.json
   and the link boots nothing. Fixed to repo root + `?file=` to focus the example.
2. **`examples.json` had two owners.** `pnpm lint` (prettier) and
   `generate:manifest --check` disagreed forever — prettier collapses short arrays at 120
   cols, the generator always expands. Added it to `.prettierignore`; the generator owns it.

### Verified

tsc 0, lint 0 (eslint + prettier), build clean, smoke 130/131 (`tsl-wood` = B28), home and
example routes 200, search exercised in a real browser (9 results for "bloom", console
clean).

### Open / taste calls for Dennis

- Action-bar buttons are text monograms (GH / SB / VS / CS / CC / CX) with title
  tooltips. Legible but cryptic — real icons would read better.
- Searching filters the SIDEBAR only; the home gallery does not filter. Arguably it should.

## Restyle wave 4 — COMPLETE: 131/131 restyled (2026-09-02)

compute 9, tsl 7, loaders 5, textures 5, render-targets 6, reflections 6, volume 5.
**Every example in the corpus is now restyled against AGENTS.md v1.1.**

Verified: tsc 0, **lint 0 errors AND 0 warnings**, build clean, smoke 130/131 (sole
failure `tsl-wood` = B28 at its measured rate), animates 130 passed + 1 skipped.

### Both lint ratchets are now ERROR

- `corpus/no-retired-patterns` — 36 sites swept, promoted 2026-09-02.
- `corpus/import-hierarchy` — 137 sites swept, promoted 2026-09-02.

Three mechanical corpus rules are now enforced rather than reviewed: header block,
import hierarchy, retired patterns.

### The `as unknown as Node<'float'>` sweep: 87 -> 23

All 87 were justified by a comment claiming _"fiber's `UniformNode<T>` pins the TSL
node-type param to `unknown`"_. **The claim was false.** Four agents disproved it
independently — via the fiber type chain (`UniformNodeFor<V>` -> `UniformNode<'float',
number>` -> structurally satisfies `Node<'float'>`), via the runtime source
(`createUniform()` calls TSL's own `uniform()`), and empirically.

Method: strip all 87 -> `tsc` -> 28 errors in 5 files -> restore exactly those, clean the
orphaned imports from the rest. **Per-site, compiler-adjudicated, not pattern-matched.**

The 23 survivors are a DIFFERENT family and are correct: struct `.get()` returning bare
`Node`, custom node classes, `cubeTexture()`, one `select()` wanting `bool` — the B10/B11
gaps. Files: `compute-water/Water.tsx`, `compute-particles-rain/Rain.tsx`,
`skinning-points`, `geometry/instance-uniform.tsx`, `tsl-vfx-tornado/Tornado.tsx`.

**A wrong comment is more contagious than wrong code.** Third instance this session, after
"no declarative form exists for a camera-attached light" (3 files) and B16 citations
justifying unscoped stores. Agents treat a confident comment as evidence. After the casts
were removed, 12 files still carried the orphaned comment — those were deleted too, or the
next agent would have re-added the casts from them.

### Doc corrections this wave

- **UPSTREAM.md B9/B12/B16/B17 now marked `~~FIXED in fiber alpha.4~~`** with "do NOT cite
  in new code". They read as OPEN, which is why example comments kept citing B16 to
  justify going unscoped.
- **Rule 8**: order is enforced, blank line between tiers is OPTIONAL — the hand-tuned
  corpus does both (`lights-phong` separates; `materials-basic`/`tsl-earth` don't), and two
  agents flip-flopped on it.
- **`useLocalNodes` is exempt from the B18 hazard** — pure `useMemo` wrapper, no
  `store.setState`, unlike `useUniforms`/`useNodes`.
- **`mrtNode` needs no cast** — the doc already said so; the CODE was stale. First
  finding this session where the doc was right and the code wasn't.
- **`docs/style-drafts/lights-phong-alt.tsx` banner-marked NOT CANONICAL.** I parked that
  broken sketch there earlier this session and an agent modelled `useLocalNodes` on it —
  it doesn't typecheck. My mess, now labelled.

### Process finding

The `compute` batch agent spawned 6 subagents and returned before they finished, so its
report was empty and concurrency jumped to 8 against one dev server. Brief v2 now says:
do the work yourself, no subagents, work sequentially.

### Follow-ups (not done, deliberately)

1. `tsl-vfx-flames/Flames.tsx` and `tsl-vfx-tornado/Tornado.tsx` still build materials via
   `new SpriteNodeMaterial()` + post-construction `.colorNode =` in a `useMemo` — the
   rule-3 pattern that WAS fixed in `Terrain.tsx`. Tornado has 3 materials across 2 meshes
   sharing helper `Fn`s; left as a scoped follow-up rather than rushed.
2. `volume-caustics` calls `useUniforms` AFTER suspending loaders (reverse of B18-safe
   order). Works today; flagged for a dedicated B18 audit.
3. `backdrop-area`'s 4-material runtime switcher — a third material pattern the doc
   doesn't name. Marked `REVIEW(shared-instance)`.
4. **prettier fails repo-wide** including on hand-tuned files; `pnpm lint` is eslint-only.
   Adopting it is a repo-wide diff — Dennis's call.

### Note on hand-tuned files

To reach zero lint warnings I reordered imports in 3 hand-tuned files
(`tsl-raging-sea/{tsl-raging-sea,seaNodes}`, `volume-fire/fluidKernels.ts`) plus
`loader-gltf-compressed`. **Import ORDER only — no semantic change.**

### Remaining work

- **85 examples still to PORT** (Phase 1 webgpu). The restyle backlog is zero.
- Stream C (sidebar grouping + working search) and Stream D (upstream fixes) still parked.

## Restyle wave 3 + corpus sweep — materials, scene, shadows (2026-09-02)

33 more examples. **79 of 131 restyled; 52 left** (compute 11, tsl 10, loaders 7,
render-targets 7, reflections 6, volume 6, textures 5).

### The corpus sweep — retired patterns are GONE and now an error

24 `as WebGPURenderer` (retired B9) + 12 `useFrame((_, delta) =>` (rule 10) = **36 sites,
now 0.** `corpus/no-retired-patterns` promoted from `warn` to **`error`**.

I under-reported this twice: first "3 files" (my grep only matched
`s.renderer) as WebGPURenderer`; the bulk bind through `rawRenderer`), then the materials
agent found 2 more. **A narrow grep is not a survey — write the AST rule instead.** Some
of these survived in categories that had ALREADY been restyled, because each agent only
fixed the instances its brief named.

Codemod handled 13 files and REFUSED 7 with different binding shapes rather than guessing;
those were done by hand. Import cleanup needed three passes (multi-line members, inline
members, type-only imports).

Lint warnings 129 -> 75, now exclusively import-hierarchy in the 4 remaining categories.

### AGENTS.md: pattern (b) had a silent precondition

The (b)/(c) selection rule I wrote in wave 1 was incomplete. What matters is not "does the
node expose a writable uniform field" but **WHEN it reads that field**:

- `BloomNode` reads `this.threshold` in `setup()` (at compile) -> field swap works, (b).
- `SkyMesh` assigns `material.colorNode` inside its CONSTRUCTOR, capturing
  `this.turbidity` on the spot (`objects/SkyMesh.js:371`) -> the field swap does nothing
  and the control silently freezes. `WaterMesh` is the same. Those need `.value` mutation,
  pattern (c).

Failure mode is invisible: renders perfectly, knob just doesn't work. Documented.

### UPSTREAM B31 filed — camera typing, NOT B9

`RootState.camera` is typed base `Camera` (`fiber/dist/webgpu/index.d.ts:170`), so reading
`.near`/`.fov` needs a cast. Several in-repo comments called this "the same shape as B9" —
but B9 is FIXED, so those comments taught that a still-necessary cast was obsolete. Filed
separately; comment repointed.

### Agent self-verification is not reliable

The shadows agent reported "0 tsc errors" with **two in its own file**: moving the CSM
`mode` control into `CsmLight` made leva's `select` return `string` where
`CSMShadowNodeMode` was required. Fixed by constraining the control
(`satisfies CSMShadowNodeMode[]`), not by casting at each use site. Second agent this
session whose self-report was wrong — verify every batch independently.

### Worth featuring

`ocean` 200 -> 86, `custom-fog` 220 -> 83, `sky` gained a real `<skyMesh>` intrinsic
(new `src/assets/SkyMesh.ts`) replacing `new SkyMesh()` + `<primitive>`, and
`shadowmap-csm`'s `CsmLight` went from **14 props to 1**.

### Verified

tsc 0, lint 0 errors, build clean, **smoke 130/131** — sole failure `tsl-wood`, the
measured B28 flake (1-in-5), in 3.5m normal timing.

### Open for Dennis

- **prettier fails repo-wide**, including on the hand-tuned `lights-phong.tsx`.
  `pnpm lint` is eslint-only, so formatting has never been enforced. Deciding whether to
  adopt it is a repo-wide diff — not taken unilaterally.
- `backdrop-area`'s 4-material runtime switcher is a THIRD material pattern that neither
  "declarative JSX" nor "shared instance" describes. Marked `REVIEW(shared-instance)`.

## Restyle wave 2 — lights, animation, camera, geometry (2026-09-01)

25 more examples restyled against AGENTS.md v1.1 (brief v2). **44 of 131 done**
(postprocessing 17, lights 8, geometry 8, camera 6, animation 5); **87 remaining.**

**This wave proved the thesis where the pilot could not.** Verified against the real r185
sources:

| example                       | ours    | vanilla original                               |
| ----------------------------- | ------- | ---------------------------------------------- |
| `animation-skinning-blending` | **102** | **514** (`webgl_animation_skinning_blending`)  |
| `clipping`                    | **157** | **278**                                        |
| `materials-displacementmap`   | **191** | **267**                                        |
| `camera`                      | 268     | 268 — parity, viewport/scissor-heavy, expected |

`lensflares`: the original builds **3000 individual `THREE.Mesh`** objects and bakes
transforms with `matrixAutoUpdate = false`; now one drei `<Instances>` — one draw call,
and the ref + `useLayoutEffect` + matrix machinery is gone.

### Real bugs found (not style)

- **Three files carried a FALSE comment** asserting no declarative form exists for a
  camera-attached light (`morphtargets`, `materials-displacementmap`, `layers`). AGENTS.md
  documents `<PerspectiveCamera makeDefault><pointLight/></PerspectiveCamera>` and
  `skinning-instancing`'s own header cites it correctly. Fixed all three;
  `skinning-instancing` keeps its imperative version as the deliberate showcase.
- `layers` lost an imperative `useLayoutEffect` + `camera.layers.enable/disable` component
  for a declarative `layers-mask` prop.
- Two more rule-10 violations (`useFrame((_, delta) =>`) in `lights-rectarealight` and
  `instance-uniform` — endemic, worth an eslint rule of its own later.

### Mechanized: `eslint-rules/import-hierarchy.js`

Import order was wrong in 9 of 11 files in one category, and every batch had been fixing
it by hand. New local rule (no new dependency, matches `require-header-block`). Found
**137 violations corpus-wide**; now 132 and set to **`warn`** as a ratchet so it cannot
turn the corpus red under an in-flight agent. **Promote to `error` once clean.**
The remaining warning count is an exact progress meter for the restyle backlog:
`scene` 29, `compute` 21, `shadows` 15, `tsl` 14, `materials` 13, `reflections` 12,
`volume` 9, `render-targets` 8, `loaders` 6, `textures` 5. All restyled categories: 0.

### Verification, and a false alarm worth remembering

Final: `tsc` 0, `pnpm lint` 0 errors, `pnpm build` clean, **smoke 129/131** with both
failures characterized as known flakes (below).

An intermediate sweep failed 6 examples and took **32.6m instead of 2.5m**. Not a
regression: a subagent had run `rm -rf node_modules/.vite` against the RUNNING dev server,
so it served `504 (Outdated Optimize Dep)` for every dynamic import, and the smoke tests
run against that server. Kill server -> clear cache -> restart, and all 6 passed in
1.4-4.8s. **A sweep that suddenly takes 10x longer is an environment tell, not a code
tell.** AGENTS.md § Environment gotchas amended; brief v2 forbids agents touching shared
state (vite cache, dev server, `pnpm install`, git).

### B28 rescoped with measurement

B28 is NOT `tsl-wood`-specific. 5 scoped runs each: `tsl-wood` fails 1/5, but
**`loader-gltf-dispersion` fails 3/5 and every failure carries the `PMREM.cubeUv`
signature** — it is the better upstream repro. Both drive `scene.environment` from an HDR
via drei `<Environment>`; **27 corpus examples import it**. Console-only: the canvas
renders, the console-clean assertion fails. Details in UPSTREAM B28.

### Still open for Dennis

- Scale: 87 examples left to restyle (materials 14, scene 13, compute 11, tsl 10,
  shadows 8, loaders 7, render-targets 7, reflections 6, volume 6, textures 5), 85 left
  to port. Streams C (sidebar/search) and D
  (upstream fixes) still parked.

## Postprocessing restyle pilot — COMPLETE (2026-09-01)

The M1-style gate on restyling the corpus against AGENTS.md v1.0. All 17
`postprocessing` examples (31 files) restyled: 1 by hand as the worked exemplar
(`postprocessing-bloom`), 16 by five Sonnet cluster batches.

**Result: 2641 -> 2395 code lines (-9.3%), 3981 -> 3400 total.** Entry files carried it
(`-lensflare` -40, `-anamorphic` -27, `-ao` -24, `-godrays` -20, `-outline` -18). One
file went UP: `postprocessing-ca/Shapes.tsx` +2, the cost of colocating `useControls` to
delete a prop-drill — accepted.

Verification: tsc 0, lint clean, build clean, **smoke 131/131** (tsl-wood's B28 flake did
not reproduce), animates 130 passed + 1 skipped, all 17 screenshots reviewed by eye.

### What the pilot changed in the doc (AGENTS.md v1.1)

The doc was wrong in ways only running it could reveal:

- **§ Post-processing: 3 dynamism patterns -> 4, and the selection rule now stated.**
  Its absence was the single biggest source of agent guessing. `dof()` was misfiled
  under (c) — it exposes public writable `*Node` fields like every node-class factory.
  (c) narrows to two verified cases: `Fn()` helpers with no instance (`depthAwareBlend`)
  and int/uint fields `useUniforms` can't produce (`godrays().raymarchSteps`).
- **New (d) structural toggle**, with an explicit carve-out from rule 5. Its read-back
  cast is forced by `PassRecord = Record<string, any>` — filed as **B30**.
- **B29 rescoped**: identity loss on factory arguments is per-factory and invisible at
  the call site (`bloom`/`dof` preserve, `dotScreen`/`rgbShift` don't). Only
  assign-after-construct is right everywhere.
- **Rule 1**: added the two-sibling-consumer case, and the colocation -> B18 hazard —
  colocating controls makes a component a creator-hook component, which is a live bug if
  it renders after a Suspense boundary. Found as an actual latent bug in
  `postprocessing-ao`.
- **Rule 7**: markers are file-level only.

### Open, needs Dennis

1. **Rule 3 vs. shared material instances.** `postprocessing-ao/Furniture.tsx` and
   `Gallery.tsx` use `useMemo(() => new MeshStandardMaterial())` + `material={...}`
   across many meshes — literally what rule 3 forbids, but inlining would create N
   instances instead of 1. Read literally, rule 3 makes those files worse. Left
   unchanged pending a ruling.
2. **`postprocessing.tsx` has 4 leva sliders the original hard-codes** (dotScreen
   scale/angle, rgbShift amount/angle). Strictly rule 4; costs ~8 lines; rule 4 does
   permit exposing a hidden constant. Left in, flagged.
3. **Scale decision**: whether to run the remaining ~98 restyles, a flagship subset, or
   stop. That was always the point of gating here.

### Corpus debt this surfaced (not fixed — outside the pilot's scope)

- The **retired B9 cast is still live in 3 files**: `materials-envmaps-groundprojected`,
  `scene/custom-fog/SunSky`, `scene/ocean/OceanSky` still carry
  `useThree((s) => s.renderer) as WebGPURenderer`. Retiring a rule did not clean the
  corpus — sweep these when those categories are restyled.
- Working tree is STAGED BUT UNCOMMITTED (230 files: the category reorg, AGENTS.md v1.1,
  SPEC v1.1, the pilot). Pre-restyle sources snapshotted outside the repo.

## Halftone graph simplification (2026-09-01)

- Replaced `useHalftoneComposite` and its manual uniform-node dependency list with
  one `useNodes`-owned output graph shared by the primitive and GLTF materials.
- Co-located the controls and graph wiring in the entry file as a local Canvas child;
  removed the now-unnecessary `HalftoneScene.tsx`.
- Kept the original per-layer TSL math as a typed graph helper. This avoids the
  current `Fn` parameter-width inference gap without TypeScript casts or runtime
  coercion nodes; Leva's plain-object purple direction is normalized to `Vector3`
  at the uniform boundary.
- Verification: typecheck, scoped lint, `test:changed tsl-halftone` (smoke +
  animates), and screenshot all pass.

## Postprocessing controls cleanup (2026-09-01)

- Moved the dot-screen and RGB-shift Leva controls into `PostFX`, beside the
  uniforms they update. Removed the page-level controls, props interface, and prop
  drilling.
- `useUniforms` now creates the canonical nodes and assigns them directly to the
  addon's public pass fields before shader compilation. This removes pass registration
  and the synchronization effect; live Leva edits were verified in-browser. Logged
  the factory's supplied-uniform identity loss as three.js#34416 / UPSTREAM B29.
- Applied the same pattern to `postprocessing-bloom-emissive`: bloom controls now
  live in `PostFX`, exposure lives in `ToneMappingExposure`, and creator hooks render
  before the suspending Environment/model subtree.
- Verification: typecheck, scoped lint, scoped smoke + animates, and screenshots pass
  for both postprocessing examples.

## Compute texture controls cleanup (2026-09-01)

- Moved the pattern-scale Leva control into `ComputedPlane`, beside its `useUniforms`
  node and dispatch effect. Removed prop drilling, redundant manual uniform
  assignment, obsolete alpha.3 casts, and the old unscoped-node workaround.
- Scoped `useNodes` is now used directly on fiber alpha.4. A live browser edit from
  scale 50 to 100 confirmed that the uniform updates before the on-demand compute
  redispatch.
- Verification: typecheck, scoped lint, `test:changed compute-texture`, and screenshot
  pass.

## Compute particles controls cleanup (2026-09-01)

- Moved gravity, bounce, friction, and size controls into `Particles`, directly beside
  their `useUniforms` nodes. Removed the page props/interface and all obsolete
  UniformNode/WebGPU renderer casts.
- Re-enabled scoped `useBuffers` and `useNodes` on fiber alpha.4 and simplified the
  three compute kernels without changing their once/frame/event dispatch cadences.
  The event-driven pointer uniform remains graph-owned so React cannot reset it.
- Restored the init dispatch to `useEffect` so the `useNodes` creator remains pure.
  Opened [react-three-fiber#3896](https://github.com/pmndrs/react-three-fiber/issues/3896)
  for root-scoped, versioned dirty signals that let independent frame jobs react once
  to shared mutable-state changes; targeted to the v10.1 milestone.
- Verification: typecheck, scoped lint, `test:changed compute-particles`, and
  screenshot pass.

## Geometry loft + volume fire controls cleanup (2026-09-01)

- Moved geometry-loft's display/turntable controls into `Exhibits`, their actual
  consumer. These remain ordinary React values because they drive CPU scene state,
  not shader inputs.
- Removed volume-fire's 20-value prop chain. `VolumeFire` now owns its four Leva
  groups and registers one canonical uniform bag through creator-form `useUniforms`;
  a same-scope value-form call updates only the controlled subset.
- Denoise and bloom controls now feed their TSL nodes directly before pipeline
  compilation. Removed the broad uniform synchronization effect; only CPU-side
  material step count and pass resolution retain focused effects.
- Scoped `useGPUStorage`/`useNodes` now use the alpha.4-safe `volumeFire` scope, and
  frame-driven uniforms remain isolated from React control updates.
- Verification: typecheck and scoped lint pass. `test:changed geometry-loft` passes
  smoke with its existing ledgered animation skip; `test:changed volume-fire` passes
  smoke + animation. Both screenshots pass.

## Shared teapot geometry (2026-08-31)

- Centralized the `TeapotGeometry` addon import and idempotent JSX registration in
  `src/assets/TeapotGeometry.ts`; its shared `teapotGeometry` intrinsic declaration
  now lives in `src/types/r3f.d.ts`.
- Migrated all six consumers to the shared asset. `lights-phong` now uses a single
  side-effect import instead of repeating `extend()` and module augmentation, while
  imperative consumers still construct the size/segment variant they need.
- Verification: typecheck, lint, build, and scoped `lights-phong` smoke + animation
  tests pass.

## Raging sea cleanup (2026-07-29)

- Replaced the original `tsl-raging-sea` port's prop-heavy `Sea` wrapper with the
  existing v10 example pattern: Leva values feed `useUniforms`, then one `useNodes`
  creator builds the position, normal, and emissive graph for a declarative
  `meshStandardNodeMaterial`.
- Consolidated the reusable graph and control definitions in
  `src/examples/tsl-raging-sea/seaNodes.tsx`; removed the duplicate
  `Sea.tsx` and `WebGPURagingSea.tsx` implementations.
- Promoted `TerrainGeometry` to `src/utils/` and changed its guarded geometry
  rotation to `useLayoutEffect`, ensuring the horizontal vertex data is ready before
  the first shader build.
- Verification: typecheck, scoped lint, build, `test:changed tsl-raging-sea`
  (smoke + animates), and screenshot all pass. Visual output retains the original
  black background, directional lighting, violet water, and emissive pink troughs.

## Wave 13 (2026-07-29) — the CHEAP-MODE wave: cluster batches, 95 → 131

Dennis approved resuming under the cost plan from the 07-28 policy change. This wave
changed HOW we port, not just what:

| Change                                            | Effect                                                                                              |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **4 sibling examples per agent** (was 1)          | The ~15k-token doc read + pattern discovery amortize across the batch                               |
| **Agents own visual review**                      | Screenshots never enter the orchestrator context; justified by 40 consecutive zero-review-fix ports |
| **Scoped tests during the batch** (`-g "<slug>"`) | Full suite runs ONCE at wave end                                                                    |
| **Agents don't commit or edit docs**              | Rule candidates reported; one batched doc pass (this entry + AGENTS.md v0.26) instead of 4 per wave |
| **`model: 'sonnet'` pinned explicitly**           | Session parent is Opus; unpinned agents would inherit it                                            |

**Measured result: ~115k → ~60k tokens per port**, roughly 2× cheaper, on top of a
much smaller orchestrator burn (no per-pair screenshot reads, gate output, or doc
edits).

| Quartet           | Ports                                                                  | Tokens       | Per port |
| ----------------- | ---------------------------------------------------------------------- | ------------ | -------- |
| postprocessing    | sobel, fxaa, smaa, ca                                                  | 171k         | 43k      |
| lights            | selective, ies-spotlight, projector, physical                          | 209k         | 52k      |
| bloom/glow        | bloom, bloom-selective, anamorphic, lensflare                          | 230k         | 58k      |
| materials-texture | arrays, video, texture-manualmipmap, cubemap-mipmaps                   | 162k         | 41k      |
| shadowmap         | opacity, array, csm, progressive                                       | 317k         | 79k      |
| compute           | points, geometry, texture-pingpong, texture-3d                         | 352k         | 88k      |
| MRT/render-target | mrt, mrt-mask, multiple-rendertargets, …-readback                      | 271k         | 68k      |
| volume            | perlin, caustics, lighting, lighting-rectarea                          | 269k         | 67k      |
| array-texture     | partialupdate, 2d-array, 2d-array-compressed, rendertarget-2d-array-3d | (stalled 3×) | —        |

Hard clusters (shadowmap, compute) ran hot as expected — thin training data, three
folder-pattern ports, addons with no `.d.ts`. Routine clusters landed near 40k.

**Findings worth keeping:**

- **A real bug in a shipped three.js example** (UPSTREAM B22): `MRTNode.setup()`
  name-matches outputs against the bound target's textures and silently drops
  unmatched ones; `webgpu_multiple_rendertargets_readback` never names its readback
  target's textures, so that path compiles to an empty struct. Our port fixes it.
- Two originals carried dead/no-op code (unused floor texture in `volume_caustics`,
  no-op per-frame `lookAt()` in `volume_lighting`), plus unreachable animation code in
  `postprocessing_ca`. All dropped with DIVERGENCE bullets → new AGENTS.md rule.
- `compute-points` shipped a pointer-uniform bug that collapsed 300k particles into
  the origin in ~2s — **caught by the animates tier, invisible to smoke**. Second time
  that tier has paid for itself.
- `shadowmap-csm`'s tone-mapping error was caught **only by the agent's screenshot** —
  both test tiers passed it. Evidence that agent-owned visual review is load-bearing,
  not ceremony.
- New util extracted: `src/utils/VolumetricFog.ts` (the tiled-3D-Perlin density block
  three volume originals duplicate verbatim).
- Flagged once, not yet a rule: drei's `useKTX2` types its result's `image` as
  `unknown` (documented cast in `textures-2d-array-compressed`).

**Process notes for next time:**

- The array-texture agent **stalled three times**, always on an open-ended screenshot
  wait. Resuming via message preserved its context and lost no work, but the fix is
  prescriptive: screenshot scripts need a hard timeout + always-run `browser.close()`
  (now in AGENTS.md §Verification). Its 4th port needed a `tsc` fix by hand — an agent
  that stalls before its own verification step can leave a registered-but-unverified
  example, so the wave-end full gate is non-negotiable.
- Full smoke is now **18.7m** locally and animates **1.4h** at 131 examples. Both
  produce contention flakes (1 smoke, 5 animates this run — all passing in isolation).
  The suites need sharding or a scoped default before the corpus grows much further.
- **Watch item: `loader-gltf-iridescence`** failed animates TWICE (full suite, then
  again immediately after 16.8m of same-process loader-gltf runs), then passed 4/4
  consecutively in isolation. Both failures followed long multi-example processes, so
  the read is contention — but it is the only example to fail twice, so re-check it
  before assuming. Every other failure this run passed first retry.

Cumulative: **131 examples**, 36 ports this wave.

## POLICY CHANGE — porting cadence + CI cost (2026-07-28, Dennis)

Dennis hit Claude usage limits and called a slowdown. Two decisions:

1. **CI smoke no longer runs on push.** ~30 min per run at corpus scale (95
   examples × SwiftShader software raster). Now: PRs + nightly 04:00 UTC +
   `gh workflow run ci.yml`. The fast `checks` job (lint/build, ~2 min) still
   gates every push. Local Metal remains the oracle (SPEC §10) — every port is
   verified green on smoke + animates + contact sheet before it lands, so
   per-push SwiftShader was belt-and-braces. Revisit when the corpus is complete
   and pushes drop to a few a month.
   - Cloudflare Workers were considered and rejected: Workers are V8 isolates
     with no browser/GPU, and Browser Rendering is headless Chrome — which never
     presents the WebGPU canvas on Linux (the reason our CI runs headed under
     Xvfb; see research/webgpu-ci-github.md). No offload path exists; running it
     less often IS the fix.

2. **Porting waves paused.** The 8-ports-per-wave cadence is what consumes the
   budget: ~120k subagent tokens per port, ~1M per wave, and 95 examples ≈ 11M
   tokens of agent work. Everything else (CI polling, screenshot review, gates)
   is under ~5% combined. Marginal doc/upstream yield has also plateaued — the
   last several waves were zero-review-fix AND zero-rediscovery.
   - **Cost lever for resumption: pin `model: 'sonnet'` on port agents.** They
     were Sonnet all session by inheriting a Sonnet parent; the session is now
     Opus, so unpinned agents would inherit Opus and cost several times more per
     port. Never launch an unpinned port agent again.
   - Resume shape when Dennis says go: 1 pair (2 ports) per check-in, ~250-300k
     tokens, Sonnet-pinned; scope smoke/contact-sheet to the new slugs during the
     pair and run the full sweep only at wave end.

## Wave 11 (into the early hours of 07-28)

8 ports, 4 pairs. **89 examples total, 89/89 smoke + contact sheet + animates
green on Metal. FIFTH consecutive zero-review-fix wave** (one retrofit landed
alongside: skinning-instancing now plays SambaDance by name).

| Example                    | Notes                                                                                                      | Cost |
| -------------------------- | ---------------------------------------------------------------------------------------------------------- | ---- |
| postprocessing-godrays     | raymarch vs cube shadow map; samples:0 extended to arbitrary-UV depth sampling                             | 118k |
| postprocessing-motion-blur | first setupCB MRT on main pass; third cold-start signature isolated (falsified own hypothesis)             | 124k |
| mesh-batch                 | 20k BatchedMesh + radix custom sort; remount-over-dispose                                                  | 114k |
| skinning-points            | compute kernel AS positionNode; **found B21** (fiber module augmentation shadows @types Fn); .mix landmine | 161k |
| occlusion                  | WebGPU occlusion queries; state flip captured live; occlusionTest DT gap flagged                           | 91k  |
| layers                     | blossom storms on camera layers; first consumer of the fresh .mix rule                                     | 114k |
| pmrem-equirectangular      | pmremTexture live level uniform; **B13 sharpened** (UltraHDRLoader works via useLoader)                    | 101k |
| reflection-blurred         | depth-masked hashBlur reflector; @types-newer-than-runtime drift found; reflection retrofit candidate      | 131k |

Cumulative: **95 agent ports across 11 waves + 2 gate ports, zero manifest
clobbers across 48+ concurrent pair-registrations.** AGENTS.md v0.21→v0.24;
UPSTREAM briefs at B21.

## Wave 10 (same night) — and the animates tier

8 ports, 4 pairs, plus two infra items between pairs. **81 examples total,
81/81 smoke + contact sheet green on Metal, 80/81 animates (+1 ledgered
skip). Fourth consecutive zero-review-fix wave** (rain self-fixed its own
find pre-report).

| Example                           | Notes                                                                                          | Cost |
| --------------------------------- | ---------------------------------------------------------------------------------------------- | ---- |
| compute-particles-rain            | live scene collision via layer-routed height prepass; **found the B18→B17 sibling escalation** | 131k |
| compute-particles-snow            | self-feeding accumulation (settled flakes render into the collision map); lazy-useState rule   | 149k |
| materials-transmission            | 10 knobs → plain JSX props (reference-backed rule now default, 3rd confirmation); B13 hit #5   | 102k |
| materials-alphahash               | ssaaPass joins the samples:0 list (self-corrected mis-reasoning → bullet hardened)             | 102k |
| cubemap-dynamic                   | live CubeCamera reflections; pure pattern reuse, zero rediscovery                              | 108k |
| materials-envmaps-groundprojected | Ferrari beach classic; TSL ground projection with live uniforms                                | 126k |
| materials-lightmap                | baked castle scene; slider starts at the value the JSON ships (upstream GUI quirk fixed)       | 99k  |
| parallax-uv                       | ice-sheet parallaxUV + blendOverlay; zero rediscovery                                          | 89k  |

**Infra shipped mid-wave:**

- **The animates tier** (tests/animates.spec.ts, `pnpm test:animates`): two-frame
  pixel diff + frame-loop liveness + dual-root-warning capture. 18 confirmed
  statics flagged in the manifest; geometry-loft carries the one animatesSkip
  (ledgered B17 anomaly). Port checklist gained step 0; local-only pending
  SwiftShader window tuning. SPEC §10 tier-1.5 amendment is a candidate for
  Dennis.
- custom-fog ciSkip #3 (deterministic WebGPU Device Lost on SwiftShader).

Cumulative: **79 agent ports across 10 waves + 2 gate ports, zero manifest
clobbers across 40+ concurrent pair-registrations.** AGENTS.md v0.18→v0.21.

## Wave 9 (same night) — and the CI milestone

8 ports, 4 pairs. **73 examples total, 73/73 smoke + contact sheet green on
Metal. Third consecutive zero-review-fix wave.** And the big one: **CI smoke is
BLOCKING and green** — the B17 repair resolved the SwiftShader stall matrix
(all four former stalls pass; run 30261064018), exception list down to 2
legitimate ciSkips (volume-fire perf, geometry-loft B17-anomaly).

| Example          | Notes                                                                                           | Cost |
| ---------------- | ----------------------------------------------------------------------------------------------- | ---- |
| ocean            | WaterMesh/SkyMesh + per-sun-move PMREM bake; safe primitive-reparenting pattern                 | 95k  |
| clearcoat        | 4 physical spheres over Pisa HDR cube; found B20 (Environment can't load HDR cubemaps)          | 114k |
| mirror           | two TSL reflectors (decal-masked floor, rippled blue wall)                                      | 108k |
| materials-sss    | first FBX port; MeshSSSNodeMaterial, zero casts                                                 | 111k |
| custom-fog       | showpiece: procedural alpine valley, 500k trees, triNoise3D fog wisps; leva onEditEnd bake gate | 132k |
| fog-height       | exponential height fog, uniform-driven (no rebuilds)                                            | 89k  |
| instance-points  | PointsNodeMaterial fat points + compute pulse + inset (top-origin fix reapplied)                | 121k |
| instance-uniform | custom InstanceUniformNode (per-object uniform updates) ported faithfully                       | 115k |

Watch: custom-fog (500k trees) may time out on blocking SwiftShader CI — if
the next run goes red there, add its ciSkip (agent correctly didn't preempt).

Cumulative: **71 agent ports across 9 waves + 2 gate ports, zero manifest
clobbers across 36+ concurrent pair-registrations.** AGENTS.md v0.16→v0.18.

## Wave 8 (same night)

8 ports, 4 pairs + the B17 audit interlude (below). **65 examples total, 65/65
smoke + contact sheet green on Metal.** Zero review fixes across all 8 ports —
second consecutive zero-fix wave.

| Example              | Notes                                                                                                                      | Cost |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---- |
| materials-matcap     | EXR/JPG matcap swap, both decode paths                                                                                     | 107k |
| materials-toon       | 6³ toon lattice + ToonOutlinePassNode; pattern-(c) wrinkle (constructor takes Nodes where factory types don't)             | 106k |
| lines-fat            | Line2NodeMaterial vs native strip + PiP inset; **found WebGPU setViewport/setScissor TOP-origin rule**                     | 118k |
| lensflares           | LensflareMesh field; occlusion test verified live; sRGB/linear setHSL parity flagged                                       | 109k |
| volume-cloud         | Data3DTexture raymarch; **found TSL stack rule** (helpers with internal toVar/assign need Fn)                              | 97k  |
| volume-fire          | biggest port ever (258k): 8-kernel GPU fluid sim + volumetric shadows + draggable emitter; legitimate ciSkip #5; B19 filed | 258k |
| shadowmap-vsm        | shadows="variance" verified; VSM blur knobs live via dash-paths                                                            | 100k |
| shadowmap-pointlight | cube shadow maps, striped shells; intensity/distance parity checked at review                                              | 100k |

Cumulative: **63 agent ports across 8 waves + 2 gate ports, zero manifest
clobbers across 32+ concurrent pair-registrations.** AGENTS.md v0.12→v0.16.

## Wave 8 interlude: corpus-wide B17 audit (same night)

Flames' B17 find (wave 7) triggered a full-corpus animation audit: two-frame
pixel-diff + `__frameCount` probes over all examples. Result: **14 more frozen
examples repaired** (every ungated suspending hook in the corpus — rtt,
skinning-instancing, tsl-halftone, instance-mesh, lights-phong, lights-spotlight,
materials-basic, materials-envmaps, tonemapping, five loader-gltf-* ports), all
verified animating post-fix. Fingerprint: loop alive (`__frameCount` advances) +
pixels frozen + `R3F.createRoot should only be called once!` warning.

**RESOLVED: the SwiftShader stall matrix WAS B17.** After the repair + ciSkip
removal, all four former stalls PASS on SwiftShader (CI run 30261064018:
skinning-instancing 27.9s, rtt 3.3s, tsl-halftone 7.4s, sprites 4.3s). The
smoke job is BLOCKING again. Exception list is down to 2 legitimate ciSkips:
volume-fire (perf) and geometry-loft (B17 open anomaly + 17-graph compile —
the one remaining investigation thread).

Statics-by-design confirmed (0px, clean console, full-rate loop): morphtargets,
depth-texture, tonemapping, geometry-loft*(see B17 open anomaly: warning with no
suspending hook), postprocessing-ao, loader-gltf-sheen/-compressed.
Follow-up still queued: the pixel-diff "animates" smoke assertion with a
`static: true` manifest flag (probe windows must exceed stop-go periods — 4s).

## Wave 7 (same night)

8 ports, 4 pairs — postprocessing cluster (6) + TSL VFX pair (2). **57 examples
total, 57/57 smoke + contact sheet green on Metal.** Review fixes: 1 across the
wave (outline's seeded initial selection); plus two REAL shipped-bug repairs the
wave's finds triggered (below).

| Example                   | Notes                                                                                                               | Cost |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---- |
| postprocessing            | dotScreen+rgbShift chain; pattern (b); corrected orchestrator's own prompt error (not bloom)                        | 95k  |
| postprocessing-dof        | established dynamism pattern (c): const-wrapping factories need user uniform() via return-to-register               | 85k  |
| postprocessing-pixel      | pixelationPass as full-pipeline PassNode; manual ortho + frustum snap; drove minZoom/maxZoom wrapper props          | 123k |
| postprocessing-ao         | GTAO into ambient via builtinAOContext + TRAA; found the samples:0 rule (fiber MSAA-4x default breaks depth copies) | 157k |
| postprocessing-outline    | OutlineNode masks in user TSL; bubbled pointer-event selection; review fix: seed torus selection                    | 109k |
| postprocessing-afterimage | 50k-sprite spiral; history trails; outputNode-swap+needsUpdate bypass idiom                                         | 112k |
| tsl-vfx-flames            | fragment-stage fire; **found B17** (Canvas-boundary suspension freezes TSL time) via pixel-diff bisect              | 161k |
| tsl-vfx-tornado           | parabola-twisted funnel + bloom; **found B18** (useUniforms-after-suspense setState-in-render)                      | 140k |

**Shipped-bug repairs this wave:**

- `loader-gltf-dispersion` suite flake was NOT the cold-start transient — it was
  the B15-family PMREM destroyed-texture race under suite contention. Suspense
  gate fixed it; first back-to-back clean full-suite runs since it landed.
- **B17 latent freezes**: `sprites`, `tsl-earth`, `refraction` shipped with TSL
  `time` frozen at frame one (Canvas-boundary suspension; smoke's non-black check
  can't see it). All three repaired with explicit Suspense boundaries and
  verified animating by pixel-diff (31k–75k px/s).

Wave-7 upstream yield: B17 (fiber createRoot re-run on Canvas-boundary
suspension), B18 (useUniforms setState-in-render), the samples:0 MSAA rule, and
dynamism pattern (c). AGENTS.md v0.9→v0.12.

**Follow-up queued (test-tier gap the wave exposed): a two-frame pixel-diff
"animates" assertion** — smoke's non-black check shipped three frozen examples;
needs a manifest flag for intentionally-static examples (compute-texture, rtt…).

Cumulative: **55 agent ports across 7 waves + 2 gate ports, 1 review fix + 2
systemic-bug repairs this wave, zero manifest clobbers across 26+ concurrent
pair-registrations.**

## Wave 6 (same night)

8 ports, 4 pairs — the cluster wave: glTF loaders closed, TSL showpieces + first
compute ports opened. **49 examples total, 49/49 smoke + contact sheet green on
Metal.** ZERO review fixes across all 8 ports (doc steering fully compounding).

| Example                          | Notes                                                                                                                        | Cost |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---- |
| loader-gltf-dispersion           | KHR dispersion test card; clamped dolly inside original's far plane                                                          | 66k  |
| loader-gltf-compressed           | first KTX2/Meshopt port; extendLoader wiring → Layer 1 bullet                                                                | 89k  |
| tsl-galaxy                       | 20k GPU sprites; build-vs-run-time split visible in leva; frustumCulled rule                                                 | 74k  |
| tsl-procedural-terrain           | found + verified three 0.185.1 IBL race (B15); Suspense-gate fix; drag-to-scroll via pointer events                          | 164k |
| compute-texture                  | first compute port; explicit-dispatch pattern; found fiber B16 (scoped useNodes breaks WGSL)                                 | 110k |
| compute-particles                | 200k particles; three dispatch cadences; proved B16 worse (scoped useBuffers always broken)                                  | 159k |
| tsl-raging-sea                   | displaced sea + emissive troughs; caught the tone-mapping parity trap (fiber ACESFilmic default vs originals' NoToneMapping) | 128k |
| tsl-compute-attractors-particles | 262k attractor sim; v0.8 compute bullets verified on first use — zero rediscovery; uniformArray type-arg gap                 | 114k |

Wave-6 upstream yield (best wave yet): **B15** (three: env-change rebuild misses
custom-node materials — real three.js bug, verified both ways) and **B16** (fiber:
scoped store hooks inject `.` into WGSL identifiers — caught only by the smoke
console assertion). AGENTS.md v0.6→v0.9.

Watch item: `loader-gltf-dispersion` intermittently times out ONLY on the first
full-suite pass right after new examples land (fresh Vite transforms + multi-MB GLB
under contention); passes 4/4 solo and on all clean suite runs. Documented transient
class — but if it starts failing twice in a row, investigate for real.

Cumulative: **47 agent ports across 6 waves + 2 gate ports, zero manifest clobbers
across 22+ concurrent pair-registrations.**

## Wave 5 (same night)

8 ports, 4 pairs. **41 examples total, 41/41 smoke + contact sheet green on Metal.**

| Example                 | Notes                                                                                                                                                                      | Cost |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| lights-phong            | pair 1 (commit 0524eb6)                                                                                                                                                    | —    |
| materials-basic         | pair 1 (commit 0524eb6)                                                                                                                                                    | —    |
| camera-array            | pair 2 (commit e882f96)                                                                                                                                                    | —    |
| backdrop-area           | pair 2; review fix: grid={false} (double grid)                                                                                                                             | —    |
| loader-gltf-iridescence | KHR iridescence lamp; zero review fixes; both r185 assets existed verbatim                                                                                                 | 84k  |
| loader-gltf-sheen       | KHR sheen chair; leva → plain `material.sheen` (TSL materialSheen re-reads per frame, no uniforms); review fix: grid={false} (moiré vs HDR studio floor); UltraHDR swap #3 | 103k |
| loader-gltf-anisotropy  | KHR anisotropy barn lamp; zero review fixes; UltraHDR swap #4 (B13 evidence bumped)                                                                                        | 77k  |
| textures-anisotropy     | split-scissor dual-scene via phase:'render' takeover + createPortal; corner labels upgraded to live per-pane leva selects                                                  | 87k  |

Wave-5 doc yield: screenshot-script WebGPU launch note (AGENTS §Verification);
B13 evidence now 4 hits — the whole glTF-material-extension cluster ships UltraHDR
upstream, so `loader-gltf-dispersion`/`-compressed` (queued candidates) will hit it
too. Cumulative: **39 agent ports across 5 waves + 2 gate ports, zero manifest
clobbers across 18+ concurrent pair-registrations.**

## Wave 4 (same night)

8 ports, 4 pairs. **33 examples total, 33/33 smoke + contact sheet green on Metal.**

| Example                   | Notes                                                                                                         | Cost |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- | ---- |
| backdrop                  | 8-sphere viewportSharedTexture ring; first controlsRef consumer                                               | 122k |
| camera                    | split-viewport dual camera — scissor/viewport intact, first phase:'render' takeover; NO blocker               | 150k |
| portal                    | first createPortal-second-scene port (pattern → Layer 1)                                                      | 171k |
| lights-pointlights        | uniform(light.position) live-wrap pattern (→ Layer 1)                                                         | 127k |
| materials-displacementmap | first orthographic port; zoom-sync frustum derivation                                                         | 111k |
| geometry-loft             | biggest port yet: 17-exhibit LoftGeometry gallery, 4 files                                                    | 186k |
| animation-retargeting     | SkeletonUtils.retargetClip via useMemo + dual useAnimations                                                   | 149k |
| backdrop-water            | water refraction + inlined voronoi (addon missing from npm three 0.185.1 — clone is newer; AGENTS rule added) | 178k |

New ledger items: B14 (TSL Loop/Fn-layout typed-surface lag), B9 extended (camera
union), B11 family confirmed again. Cumulative session stats: **31 agent ports across
4 waves + 2 gate ports, ~1.2 sign-off fixes per port, zero manifest clobbers across
14 concurrent pair-registrations.**

## Wave 3 (same night, Metal-oracle policy)

8 more ports, 4 parallel pairs, zero manifest clobbers again. **25 examples total,
25/25 smoke + contact sheet green.**

| Example                  | Notes                                                                                                  | Cost |
| ------------------------ | ------------------------------------------------------------------------------------------------------ | ---- |
| instance-mesh            | JSX instancedMesh + setMatrixAt; useLoader-cache clone rule                                            | 92k  |
| morphtargets             | found the useLayoutEffect-vs-first-RAF-render race (now a Layer 1 rule)                                | 119k |
| clipping                 | nested clippingGroup JSX intrinsics (auto-derived, no extend)                                          | 105k |
| loader-gltf              | live Khronos catalog (148 models); drove controlsRef escape hatch                                      | 155k |
| lights-spotlight         | SpotLight.map projection, PLY loader; drove polar-limit props                                          | 141k |
| materials-envmaps        | cube/equirect toggles; zero casts; build-vs-live semantics traced                                      | 148k |
| depth-texture            | scene-pass depth node; added raw/linear select() toggle                                                | 138k |
| loader-gltf-transmission | KHR transmission; frame-probe correctly classified its one cold-start timeout (frames:4 = fetch crawl) | 85k  |

Wrapper additions this wave (all port-flagged): `controlsRef` (imperative
fitToBox/setLookAt escape hatch), `minPolarAngle`/`maxPolarAngle`. UPSTREAM B13
added: drei /webgpu Environment lacks UltraHDRLoader wiring (hit twice, forced
HDR asset swaps). Follow-up queued: wire Box3 auto-framing in loader-gltf via
controlsRef.

## Wave 2 (added after the dry run; Metal-oracle policy per Dennis)

8 more ports, run as 4 parallel PAIRS of single-Sonnet agents (examples.json
append-discipline held — zero clobbers across 8 concurrent registrations):

| Example              | Notes                                                                                                                         | Cost |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---- |
| tsl-earth            | day/night terminator + atmosphere on outputNode — showpiece                                                                   | 107k |
| shadowmap            | maskNode discard + receivedShadowPositionNode; CORRECTED the fog rule (plain Fog auto-wraps; fogNode only for custom TSL fog) | 145k |
| procedural-texture   | convertToTexture/gaussianBlur self-bake, no pipeline                                                                          | 108k |
| reflection           | reflector() floor, instanced voxel tree; TWEEN dropped for a useFrame ramp; drove the autoRotate util addition                | 159k |
| tonemapping          | runtime operator swap; draco via useGLTF; cheapest yet (86k)                                                                  | 86k  |
| refraction           | backdropNode + viewportSharedTexture (typed! no cast needed)                                                                  | 95k  |
| video-panorama       | VideoTexture; geometry-baked scale(-1,1,1) (mesh-scale would flip winding); muted+playsInline load-bearing                    | 96k  |
| lights-rectarealight | LTC setup at module scope (rule clarified: idempotent lib registration ≠ mutable state)                                       | 110k |

**17 examples total, 17/17 smoke + contact sheet green on Metal.** CameraControls
wrapper grew from real port needs: `pan` lock, `autoRotate`/`autoRotateSpeed`
(OrbitControls-parity). AGENTS.md gained: fog two-paths correction, duck-typed
`*Node` property pattern (+ check-@types-first caveat), instancedBufferAttribute
type-arg, module-scope registration clarification. UPSTREAM B11 broadened
(fogNode/backgroundNode/emissiveNode family), B12 added (useUniforms WGSL
identifier validation).

Review flags for Dennis: `tonemapping`'s HDR background reads very dark in the
contact sheet (original is also dark — eyeball live); `lights-rectarealight`
chunk is 250kB (LTC tables — expected, data not code).

Read AGENTS.md first (v0.4 — conventions + stack pins + gotchas), then
[UPSTREAM.md](UPSTREAM.md) (the patch/override ledger + upstream fix briefs Dennis
asked for), then this.

## Where we are

**M1 complete** (Dennis signed off on grid/leva/titleblock look; both gate ports
reviewed). **M2 is well underway**: repo live at
github.com/pmndrs/react-three-examples, CI green, and the 5-port dry-run wave is
merged. **9 examples total**, all green locally (tsc/lint/build/smoke 9/9).

### The M2 dry-run wave (all single-Sonnet agents, AGENTS.md-steered)

| #      | Example                       | Notes                                                            | Agent cost |
| ------ | ----------------------------- | ---------------------------------------------------------------- | ---------- |
| gate#2 | skinning-instancing           | instancing + TSL range + blur pipeline                           | 146k tok   |
| gate#3 | postprocessing-bloom-emissive | MRT selective bloom                                              | 93k        |
| 1      | sky                           | SkyMesh + CubeCamera; slug-rule violation (fixed + doc reworded) | 111k       |
| 2      | rtt                           | pipeline subsumes manual RTT; cleanest port                      | 78k        |
| 3      | shadow-contact                | first folder-pattern; `before:'render'` capture pass             | 181k       |
| 4      | tsl-halftone                  | deepest TSL; found the WGSL-identifier trap                      | 201k       |
| 5      | sprites                       | SpriteNodeMaterial + userData node + scene.fogNode               | 128k       |

Review cost stayed cheap: every port needed at most a slug rename / one-prop
consistency fix. Cost tracks example difficulty, not doc decay — simple ports got
cheaper as AGENTS.md absorbed each round's lessons (now at v0.4, see its changelog).

### CI (github.com/pmndrs/react-three-examples/actions)

- checks (lint+build) + smoke (headed Chromium under Xvfb + SwiftShader Vulkan) —
  **the research-designed WebGPU path is proven on free runners**.
- `packageManager` pin + vendored fiber tarball (1.3MB, UPSTREAM.md A1) were needed
  to make CI installable.
- **SwiftShader stall (open investigation — Grid hypothesis FALSIFIED)**: four
  examples hang readiness silently on SwiftShader (zero page errors, 2×180s); all
  pass on Metal. The `?nogrid` experiment disproved the Grid theory (rtt/halftone
  still stall grid-less; sprites stalls with no grid at all). Full matrix:
  - STALL: skinning-instancing, rtt, tsl-halftone, sprites
  - PASS: animation-skinning-blending (9s), hello-webgpu (5s),
    postprocessing-bloom-emissive (24s), sky (7s), shadow-contact (7s)
  - Not yet separated by: render pipeline (bloom passes, rtt stalls), Grid
    (falsified), fiber `useUniforms` (shadow-contact calls it and passes),
    animation (anim-blending passes).
  - Instrumentation added: readiness timeouts now report `__frameCount` /
    `__loadersActive` in the failure message — next red run classifies the stall
    (0 frames = dead loop; few = per-frame pipeline recompile crawl; many =
    loaders never settle). Bisect from that data.
  - Mechanisms: `ciSkip` (skip with reason) and `?nogrid`/`ciNoGrid` (run grid-less)
    both exist in the manifest + smoke spec; the four stalls currently use `ciSkip`.
  - Smoke job is `continue-on-error` (advisory) until this is resolved — no failure
    emails; flip back in ci.yml when stable.

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

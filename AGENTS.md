# AGENTS.md — r3f-examples conventions

R3F v10 ports of the official three.js examples — WebGPU-first, agent-friendly.
Contract: [docs/SPEC.md](docs/SPEC.md). Milestones: [docs/ROADMAP.md](docs/ROADMAP.md).
Session state: [docs/HANDOFF.md](docs/HANDOFF.md).

This doc has two layers. **Layer 1 transfers to any R3F v10 app.** **Layer 2 is this
repo's format.** When a port forces a divergence from either layer, the divergence must
end up as an example fix OR an amendment here (with a changelog entry) — never silent.

## Commands

- Package manager: **pnpm only** (patched dependencies in pnpm-workspace.yaml)
- `pnpm dev` — Vite dev server, port 5173
- `pnpm build` / `npx tsc --noEmit` / `pnpm lint` — build / typecheck / lint
- Definition of done per example: typechecks, lints, builds, renders on WebGPU
  (real `webgpu` canvas context, console clean), registered in manifest, header block
  present.

## Stack pins (July 2026 — alpha-era, versions matter)

- `@react-three/fiber` **10.0.0-alpha.3, built from the local v10 branch clone**,
  installed from `reference/react-three-fiber-10.0.0-alpha.3.tgz` (npm alpha/canary
  lag or are broken). Rebuild: in `reference/react-three-fiber`,
  `pnpm install --no-frozen-lockfile && pnpm --filter @react-three/fiber build`, then
  `npm pack` in `packages/fiber` and `pnpm install` here (package.json points at the
  tarball).
- `three` 0.185.1, `@react-three/drei` 11.0.0-alpha.5 (patched — see gotchas), `leva`,
  `camera-controls` v3, react-router **7** (pinned `version-7` dist-tag; npm latest is
  v8 — do not bump). TypeScript strict, Tailwind v4, single flat tsconfig.
- `typescript` pinned **^6** (not 7): typescript-eslint has no TS7 support yet
  (typescript-eslint#10940) — do not bump until it lands.
- Reference clones (gitignored, `reference/`): three.js sparse (src + example sources
  + files.json/tags.json, no heavy assets), react-three-fiber v10 branch (+ unpublished
  docs), drei master (stale ≈ alpha.5).

## Layer 1 — R3F v10 core idioms (valid in any app)

### Entry points and renderer

- Import `Canvas` and all hooks from **`@react-three/fiber/webgpu`** (the TSL-hooks
  build). Never mix entry points in one app.
- `<Canvas renderer>` enables WebGPU with defaults (antialias/MSAA 4x is on by default);
  `renderer={{ ... }}` passes WebGPURenderer parameters. No manual renderer init.
  The `/webgpu` entry creates a WebGPURenderer even without the prop — write `renderer`
  anyway (corpus rule: explicit beats implicit; the prop is where parameters will land).
- RootState exposes **`renderer`** — `gl` is a deprecated alias, do not write it.
  Typing gap: `useThree` types it as the `WebGLRenderer | WebGPURenderer` union even on
  the `/webgpu` entry, so WebGPU-only calls (`setRenderTarget` with a WebGPU target,
  `compute`, …) fail strict tsc — cast once, `const renderer = rawRenderer as
  WebGPURenderer`, with a comment (upstream fiber gap, UPSTREAM.md B9).
- Canvas-level options replace v9 patterns: `background` prop (color / hex / HDR URL /
  environment preset / expanded object) replaces `<color attach="background">`;
  `shadows` accepts variant strings. `flat`/`linear`/`colorSpace`/`toneMapping` props
  are gone — configure via `renderer={{ toneMapping, outputColorSpace }}`.
- **Tone-mapping parity trap**: fiber's Canvas defaults to ACESFilmic; three.js
  originals render with the WebGPURenderer default (NoToneMapping) unless they set
  one. An unexamined default visibly mutes emissive/unlit palettes — decide
  `renderer={{ toneMapping }}` deliberately on EVERY port, and compare against the
  LIVE original at a matched canvas size, not the threejs.org gallery thumbnail
  (those are stale, wider-crop captures). Caught on `tsl-raging-sea`.

### Frame loop

- `useFrame((state, delta) => …)`; `state.clock` is gone — use `state.time` (ms,
  RAF-derived), `state.delta` (s), `state.elapsed` (s).
- The scheduler is phase-based: `{ phase: 'input' | 'physics' | 'update' | 'render' }`,
  plus `before`/`after` constraints and `{ fps: n }` throttling. Numeric priorities are
  a v9-ism — don't use them.
- **Registering any callback with `phase: 'render'` takes over rendering** — only do
  that when the example is about custom rendering, and never also call
  `renderer.render()` alongside the default loop.
- WebGPURenderer's `setViewport`/`setScissor` y-origin is TOP-left, unlike WebGL's
  bottom-left (verified in `WebGPUBackend.js` — no flip). Originals doing
  bottom-origin inset math carry this silently — their inset lands in the wrong
  corner on WebGPU. Recompute rects top-origin (pattern: `lines-fat/InsetView.tsx`).
- `useFrame` returns pause/resume controls; prefer them over ad-hoc booleans for
  pause UX (mixer-level `timeScale` is fine when showcasing the three.js API itself).

### TSL / WebGPU hooks

- Hooks: `useUniforms`, `useNodes`, `useLocalNodes`, `useRenderPipeline`, `useBuffers`,
  `useGPUStorage` — `/webgpu` entry only. All creator hooks are create-if-not-exists
  and StrictMode-safe; calling twice shares the instance.
- ALL fiber hooks (including the above and `useFrame`/`useThree`) only work INSIDE
  `<Canvas>` children — leva's `useControls` works anywhere, don't let that mislead:
  keep hook-using logic in a child component, controls in the page component.
- **`useUniforms` scope and uniform names must be valid WGSL identifiers — no
  hyphens.** The debug name (`${scope}_${name}`) feeds WGSL struct members; kebab-case
  scopes compile-error the shader at runtime (tsc/build won't catch it; the smoke
  suite's console assertion will). camelCase scopes, kebab-case is fine for leva groups.
- **Build-time vs run-time**: JS `if/for` in node builders runs ONCE when the graph is
  built; use TSL `If()/Loop()/select()` for anything that must react to uniforms.
- TSL helpers that internally `.toVar()`/`.assign()` (`RaymarchingBox` et al.) need an
  active TSL stack — call them inside an `Fn()`; the originals' `Fn` wrappers are
  load-bearing, not cosmetic. Fails only at RUNTIME (`No stack defined for assign
  operation`); tsc/build won't catch it (pattern: `volume-cloud`).
- `useNodes`' returned wrapper object has a fresh identity every render (member nodes
  are store-stable, the `{...nodes, utils}` spread is not) — key downstream `useMemo`s
  on the individual nodes, never the wrapper (pattern: `tsl-raging-sea`,
  `volume-fire`).
- Prefer TSL built-ins (`time`, `cameraPosition`, …) over hand-driven uniforms;
  uniforms from RootState only for values with no built-in (viewport/size).
- `uniform(someObject.vector3)` wraps the LIVE object — mutate it in `useFrame` and
  the shader sees it, zero sync code (pattern: `lights-pointlights`, wrapping
  `light.position`).
- A mesh whose `positionNode` fully relocates its geometry (GPU-placed particles,
  `range()`-driven instancing) needs `frustumCulled = false` — three builds the
  culling sphere from the CPU-side geometry (e.g. a unit plane at origin), so the
  whole object pops out of view the moment that point leaves the frustum (pattern:
  `tsl-galaxy`; several upstream originals carry this latent bug and just never pan).
- Custom-node materials (`positionNode`/`normalNode`/`colorNode`) + an async
  `Environment`: Suspense-gate the lit scene on the HDR fetch so the FIRST shader
  build already sees `scene.environment` — if the graph compiles before the HDR
  lands, three 0.185.1 intermittently never folds IBL in on the env change
  (shadowed areas render pitch black; UPSTREAM B15). Pattern:
  `tsl-procedural-terrain` (one `<Suspense>` wrapping Environment + lights + meshes).
- Second scene rendered inside a node graph: build a plain `THREE.Scene`, mount its
  contents declaratively with fiber's `createPortal(children, scene)`, and feed
  `pass(scene, camera)` into a material's `colorNode` (pattern: `portal/`). No
  `useRenderPipeline` needed — that's for post-processing the MAIN pass.
- `Fn(([a, b]) => …)` destructured params type as bare `ShaderNodeObject<Node>` —
  typed TSL math (`rotate` etc.) may not resolve through them; cast to
  `Node<'float'|'vec3'|…>` with a comment (three-side typing gap, UPSTREAM.md B10 —
  same cast family as the fiber UniformNode gap).
- Duck-typed `*Node` properties beyond a subclass's declared types are a PATTERN, not
  one-offs: `scene.backgroundNode`, `scene.fogNode`, `material.emissiveNode` on
  non-Standard node materials — the runtime reads them generically
  (`NodeMaterial.setupOutgoingLight`, `NodeManager`) but `@types/three` declares them
  narrowly. Cast with a comment; verify against the runtime source in
  `reference/three.js/src/renderers/common/` first (UPSTREAM.md B11). Not every
  `*Node` field needs it — e.g. `backdropNode`/`backdropAlphaNode` ARE typed on the
  NodeMaterial base — so check `@types/three` before reaching for the cast.
- Typed-TSL creators need explicit type arguments under strict tsc — they don't
  infer from their value/literal args: `instancedBufferAttribute<T>(array, itemSize)`
  (infers `unknown`), `uniformArray<'vec3'>(values, 'vec3')` (infers bare `string`,
  losing `.element()`'s fluent surface). Same "typed TSL surface doesn't infer"
  family as the Fn-param cast. (`UniformArrayNode.array` also types as `unknown[]` —
  cast to the concrete element type with a comment when mutating live values.)
- Fog, two paths (verified against `NodeManager.updateFog()`): plain `Fog`/`FogExp2`
  set declaratively (`<fog attach="fog" args={…} />`) IS auto-wrapped into a fog node
  by the WebGPU renderer — prefer it. Only a CUSTOM TSL fog graph needs
  `scene.fogNode = fog(color, rangeFogFactor(near, far))`, which needs a documented
  cast — `@types/three` doesn't declare `fogNode` (UPSTREAM.md B11; pattern in
  src/examples/sprites.tsx).
- Node materials are auto-extended by the `/webgpu` entry: `<meshStandardNodeMaterial>`
  etc. just work in JSX.
- **Compute pattern** (established by `compute-texture`/`compute-particles`): kernels
  are `Fn(() => …)().compute(count)` built once in `useNodes`; storage in `useBuffers`
  (`instancedArray`) / `useGPUStorage` (`StorageTexture`). fiber has no dispatch hook —
  dispatch imperatively via `renderer.compute()` (B9 cast) at three cadences: ONCE in
  a `useEffect` (sync `compute()` is safe there — fiber awaits `renderer.init()`
  before children render; StrictMode double-runs the effect, so the kernel must be
  idempotent), PER-FRAME in `useFrame({ phase: 'update' })` (compute is not a render
  takeover — never `phase: 'render'`), ON DEMAND from event handlers (pointer →
  `uniform(Vector3)` → dispatch).
- **Scoped store hooks are WGSL-unsafe (UPSTREAM B16)**: scoped
  `useNodes`/`useBuffers`/`useGPUStorage` name entries `${scope}.${name}` and the dot
  reaches WGSL identifiers — always a runtime shader-compile error for storage
  buffers, and for any node reaching codegen (texture bindings). Use ROOT-LEVEL
  (unscoped) calls with prefixed keys until the fiber fix lands. `useUniforms`
  scoping is fine (underscore separator — but see the B12 no-hyphens rule).
- Creator-state ScopedStore reads widen to `BufferLike`/`StorageLike` (losing
  `.element()`/`.toAttribute()` and concrete classes) — close over the TYPED returns
  of the hooks instead of reading back through creator state. Don't `setName()`
  inside creators; fiber overwrites it with the store key (name by key).
- Post-processing: v10's `useRenderPipeline` (wraps THREE.PostProcessing). NOT
  `@react-three/postprocessing` (stalled, WebGL-only). Pipeline callbacks don't re-run
  on HMR — full-reload after editing them. Known sharp edges (verified porting
  `skinning-instancing`):
  - The callback's `renderPipeline` param is typed nullable — guard with
    `if (!renderPipeline) return` (the mdx examples omit this; strict mode won't).
  - Pipeline callbacks don't re-run on React re-render either: any dynamic value
    (leva control etc.) must flow through a uniform, never a closed-over prop.
  - fiber's `UniformNode<T>` pins the TSL node-type param to `unknown`, so passing a
    uniform to TSL math expecting `Node<'float'>` fails strict tsc — cast
    `uFoo as unknown as Node<'float'>` with a comment (upstream fiber typing gap).
  - THREE dynamism patterns — pick by where the uniform lives: (a) values YOU
    introduce into the graph → fiber `useUniforms` + the cast above; (b) knobs a
    three.js pass already exposes as `uniform()`-backed fields
    (`bloom().strength/.radius` etc.) → return the pass from the mainCB to register
    it on `passes`, then mutate `pass.foo.value` in an effect — no cast, prefer it
    when the field exists; (c) pass factories that wrap numeric args in CONST nodes
    (`dof()` — check the factory source before assuming bloom-style fields) → create
    three/tsl `uniform()` nodes inside the mainCB, pass them to the factory, register
    THEM via return-to-register, mutate `.value` in an effect (what the originals
    themselves do; no cast — they're three-side uniforms, not fiber hook uniforms).
    Pattern examples: (b) `postprocessing`, (c) `postprocessing-dof`.
  - `useRenderPipeline(mainCB, setupCB)`: setupCB is where MRT config goes
    (`scenePass.setMRT(...)`) — full details in
    `reference/react-three-fiber/docs/webgpu/render-pipeline.mdx`.
  - fiber's Canvas defaults to MSAA 4x and every `pass()` target inherits
    `renderer.samples` — TRAA, `ssaaPass`, and any pass that copies depth
    textures require single-sampled targets: `passes.scenePass.options.samples
    = 0`, `pass(scene, camera, { samples: 0 })`, or `ssaa.options.samples = 0`,
    or WebGPU rejects the copy with a sample-count validation error at runtime
    (caught by the smoke console assertion; patterns: `postprocessing-ao`,
    `materials-alphahash`). Don't reason from `updateBefore` overrides — the
    inheritance happens elsewhere; if the pass copies depth, set samples 0.
    (`PassNode.options` is undeclared in @types/three — B11-family structural
    cast on raw addon passes; fiber's own `scenePass` type carries it.)

### Ecosystem + React

- drei v11 is renderer-split: import **`@react-three/drei/webgpu`** (or `/core` for
  renderer-agnostic); NEVER the root or `/legacy` in WebGPU code — the root build is
  legacy-flavored and will drag in a second runtime.
- StrictMode double-invokes effects: never `dispose()` a `useMemo`'d instance in an
  effect cleanup (kills the memoized instance for good). Use symmetric connect/
  disconnect effects — see [src/utils/CameraControls.tsx](src/utils/CameraControls.tsx).
- **Every suspending subtree inside `<Canvas>` gets its own explicit
  `<Suspense fallback={null}>` — no exceptions.** Letting suspension reach Canvas's
  own boundary re-runs createRoot on fiber alpha.3 (`R3F.createRoot should only be
  called once!` console warning) and permanently freezes every TSL `time`-driven
  graph at frame one (UPSTREAM B17). The freeze is invisible to the smoke tier
  (non-black ≠ animating) — three shipped examples were latently frozen until a
  pixel-diff sweep caught them. This supersedes "useGLTF suspends and Canvas
  handles it": it doesn't, gate explicitly. (The B15 IBL gate and the dispersion
  PMREM-race gate are special cases of this rule.)
- In a component that both suspends (useTexture/useGLTF/useLoader) and calls
  `useUniforms`: call `useUniforms` BEFORE the suspending hook. Creator-mode
  `useUniforms` writes to the fiber store during render; deferred to the
  post-suspense re-render, that write lands after siblings have subscribed
  (`useRenderPipeline` calls bare `useThree()`) → React's setState-during-render
  warning (UPSTREAM B18; pattern: `tsl-vfx-tornado`). **The same ordering applies
  at the SIBLING level, and the failure escalates**: a creator-hook component
  (`useNodes`/`useBuffers`/`useUniforms`) rendered AFTER a suspending sibling —
  even a properly Suspense-gated one — can trigger the setState-in-render, then
  the createRoot re-run and the full B17 pixel freeze. Render creator-hook
  components BEFORE suspending siblings in tree order (`compute-particles-rain`:
  `<Rain>` before `<Monkey>`). The smoke console assertion does NOT catch this
  state — only a pixel-diff does.
- Non-node instances captured by create-once hook closures (RenderTargets,
  cameras, override materials in a `useNodes`/`useBuffers` creator) must be
  identity-stable across StrictMode re-renders — hold them in lazy
  `useState(() => …)`, not `useMemo` (a StrictMode memo re-run can hand the
  component a DIFFERENT instance than the one the create-once kernel captured;
  pattern: `compute-particles-snow`).
- `scene.overrideMaterial` pre-passes (collision/height maps): the WebGPU
  renderer transfers each object material's `positionNode` onto the override
  material (`Renderer.js:3739`) — this is what makes GPU-instanced/displaced
  geometry participate correctly in top-down height renders (patterns:
  `compute-particles-snow`, `compute-particles-rain`).
- **Imperative mesh setup that must precede the first render goes in
  `useLayoutEffect`, not `useEffect`.** The WebGPU shader-graph build reads mesh state
  ONCE on the first RAF render and caches it (e.g. `morphReference()` caches
  `morphTargetInfluences` in a WeakMap — `null` forever if unset at that instant);
  passive effects can lose that race. Verified in `morphtargets` (`updateMorphTargets()`
  after attaching a `geometry` prop). Same rule for renderer-level flags the first
  render reads: `renderer.shadowMap.transmitted = true` for `castShadowNode` volumes
  loses the race in a passive effect (`volume-fire`).
- Declarative-first: the scene graph is JSX; imperative three.js calls are an
  intentional, showcased escape hatch (R3F is an AND with three.js, not an OR) — keep
  them visible in the component that owns them, not hidden in helpers.
- No module-scope mutable state. Controls at the edge; props where they clarify.
  (One-time idempotent library registration at module scope IS fine — e.g.
  `RectAreaLightNode.setLTC(...)`, `CameraControlsImpl.install(...)` — the rule is
  about state, not setup.)
- `useAnimations`: play clips BY NAME, never `Object.values(actions)` — GLTFs ship
  rest/utility clips (e.g. Soldier.glb's `TPose`) that pollute the blend at default
  weight 1.
- Compressed glTF (KTX2/BasisU textures): drei's `useGLTF` wires Draco (arg 2) and
  Meshopt (arg 3) itself; KTX2 needs the `extendLoader` callback —
  `loader.setKTX2Loader(new KTX2Loader().setTranscoderPath(<r185 basis/ CDN>)
  .detectSupport(renderer))` with the live renderer from `useThree`. Safe in render:
  fiber awaits `renderer.init()` before children mount (`hasFeature()` throws
  pre-init). The explicit `setTranscoderPath` is load-bearing, not cosmetic —
  KTX2Loader's default path resolves via `import.meta.url` against the three package,
  unreliable under Vite pre-bundling (pattern: `loader-gltf-compressed`).

## Layer 2 — corpus conventions (this repo's format)

### Files, routes, manifest

- One file per example: `src/examples/<slug>.tsx`, default-exporting the page
  component. Route is `/examples/<slug>` (globbed — no route wiring needed).
- If the index file would exceed **~200 lines**, switch to the folder pattern:
  `src/examples/<slug>/<slug>.tsx` entry (folder name must match) + sibling
  subcomponents. The split itself is a taught pattern — split by scene role, not by
  arbitrary size.
- Slug = original three.js example name, kebab-case, with the leading renderer prefix
  (`webgpu_` / `webgl_`) ALWAYS dropped — every port here is WebGPU, the prefix carries
  no information. `webgpu_skinning_instancing` → `skinning-instancing`; `webgpu_sky` →
  `sky`. (When both a webgl and webgpu original exist, the one port covers both.)
- Register in [src/examples.json](src/examples.json):
  `{ slug, title, tags, original?, credits? }`. `original` = threejs.org example URL;
  `credits` = asset/author attribution. The shell renders the Titleblock from this —
  **never build title/credits UI inside an example**.

### Example shape

- **The example owns its `<Canvas>`**; the scene lives self-contained inside — no
  extracted `<Scene>` component, no shared canvas.
- Header comment block (top of the index file), exactly these sections:
  ```
  /**
   * <slug>
   * R3F port of three.js `<original_name>`, running on WebGPU.
   * Original: <threejs.org URL> (~<n> lines of JS)
   *
   * DEMONSTRATES
   * - <the techniques/APIs this example teaches, R3F-angle first>
   *
   * DIVERGENCE from original
   * - <every intentional difference: UI, assets, enhancements, simplifications>
   */
  ```
- `<DemoHelpers>` ([src/utils/DemoHelpers.tsx](src/utils/DemoHelpers.tsx)) goes in every
  example: grid + CameraControls baseline, toggleable via props (`grid={false}` etc.
  when the original look demands it). It also carries the render-readiness signal —
  include it even with everything visual turned off. For imperative camera moves
  (`fitToBox`, `setLookAt` — e.g. Box3 auto-framing of loaded models) use the
  `controlsRef` escape hatch; writing `camera.position` directly is futile,
  camera-controls' `update()` overwrites it every frame.
- Controls via leva `useControls('<group>', { … })`. Direct value controls beat
  buttons that hide state (e.g. weight sliders instead of crossfade buttons).
- Assets: hotlink jsdelivr pinned to the three.js release —
  `https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/<path>`. No vendored
  binaries in the repo.
- Divergence from the original is expected and fine (idiomatic-primary, no pixel
  parity) — but every divergence gets a DIVERGENCE bullet.
- Reusable pieces that drei lacks go in `src/utils/` with a doc comment stating the
  drei gap they fill (each is a candidate upstream brief).

### Verification (do this before calling a port done)

1. `npx tsc --noEmit` && `pnpm lint` && `pnpm build`
0. Animated example? It must pass `pnpm test:animates` (tier 1.5: two-frame
   pixel diff + dual-root-warning capture — catches the B17/B18 freeze family
   that smoke's console assertion misses). Static-by-design examples declare
   `"static": true` in their manifest entry (the test then asserts live loop +
   clean console); stop-go easings longer than ~2s declare `"animationWindowMs"`.
   Run it for YOUR example: `npx playwright test tests/animates.spec.ts -g "<slug>"`.
2. Dev server: route renders, console clean, canvas context is `webgpu`.
   Playwright `-g` matches the full `file › title` chain — quoted/anchored slug
   patterns silently match nothing; verify with `--list` when a grep finds 0 tests.
3. `pnpm test:smoke` (Playwright: readiness signal fires, canvas non-black). Expected
   transient: the FIRST-ever run of an example with multi-MB hotlinked assets and/or a
   fresh shader-graph build can blow the readiness timeout once (cold CDN fetch +
   compile), then pass in ~1s thereafter — one slow first run is not a broken example;
   two is. Second cold-start signature: a one-time console assertion failure
   `Destroyed texture [PMREM.cubeUv] used in a submit` (drei Environment PMREM disposed
   mid-flight during a slow cold HDR fetch, StrictMode remount race) — same rule, gone
   permanently on run 2; only recurring console errors are real. Third signature: a
   ONE-TIME `R3F.createRoot should only be called once!` on the first-ever run of a
   heavy example (cold CDN fetch + fresh MRT shader build) even with every subtree
   correctly Suspense-gated — RECURRING dual-root warnings are the B17 bug; a single
   cold-start occurrence that never repeats is this transient
   (postprocessing-motion-blur, verified 5/5 clean in both tree orderings after). CI runs the same suite on SwiftShader (software raster, ~1 fps on heavy
   scenes): an example that verifiably cannot reach readiness there declares
   `"ciSkip": "<reason>"` in its manifest entry (exception list, SPEC §10) — used
   sparingly, never to paper over a local failure.
4. Screenshot for review — collapse the leva panel first (it overlays center-frame
   subjects at small viewports). Ad-hoc Playwright screenshot scripts must launch with
   `channel: 'chromium'` + `--enable-unsafe-webgpu` (same as playwright.config.ts) —
   plain `chromium.launch()` is headless-shell with no WebGPU on macOS and silently
   never reaches readiness. Keep such scripts under the repo root, not the scratchpad
   (`@playwright/test` won't resolve from outside the workspace).

### Environment gotchas (do not rediscover)

Every patch/override/pin this repo carries is ledgered in
[docs/UPSTREAM.md](docs/UPSTREAM.md) (Part A: what + unwind condition; Part B:
agent-ready upstream fix briefs for fiber/drei). **House rule: any new patch, pin, or
override lands with an UPSTREAM.md entry in the same commit.** Highlights:

- fiber `.` vs `./webgpu` are two separate builds of the same runtime — the regex alias
  in [vite.config.ts](vite.config.ts) forces one; keep it until fiber fixes packaging.
- drei alpha.5 is patched via `pnpm patch` for three ≥0.183's `WebGLCubeRenderTarget` →
  `CubeRenderTarget` rename; a drei version bump errors on the stale patch — that's the
  cue to delete `patches/` (fresh alphas ship the rename).
- Vite's dep scanner would crawl `reference/**/*.html` — `optimizeDeps.entries` in
  vite.config.ts scopes it; don't remove.
- v10 docs exist only as `.mdx` in `reference/react-three-fiber/docs/` (the public site
  404s on v10 pages). Check `webgpu/` and `migration/v10.mdx` before inventing API.
- The `reference/three.js` clone is NEWER than npm `three@0.185.1` on the same release
  line — an addon the original imports (`three/addons/...`) may not exist in
  `node_modules/three/examples/jsm/`. CHECK node_modules before importing; if missing,
  inline the addon's code into the example with attribution (pattern:
  `backdrop-water/voronoiNoise.ts`) — never import from the gitignored clone.

## Changelog

- 2026-07-27 — v0.22 from wave-11 pair 1 (postprocessing-godrays +
  postprocessing-motion-blur, both zero-review-fix): third cold-start signature
  documented (one-time dual-root warning on cold fetch + fresh MRT build —
  motion-blur falsified the ordering hypothesis deliberately before reporting;
  recurring = B17, once-only = transient). Motion-blur is the first port using
  setupCB MRT on the main scene pass — worked exactly as documented. Godrays
  confirmed samples:0 applies to arbitrary-UV depth SAMPLING too, not just
  copies.
- 2026-07-27 — v0.21 from wave-10 pair 2 (materials-transmission +
  materials-alphahash, both zero-review-fix, both static-by-design, both ran
  the animates tier as step 0 on first use): samples:0 bullet extended with
  ssaaPass + the don't-reason-from-updateBefore warning + PassNode.options
  typing note (alphahash initially mis-reasoned and self-corrected).
  Third-occurrence confirmation: ALL MeshPhysicalMaterial scalar/color fields
  are reference-node-backed in the node pipeline (sheen, clearcoat,
  transmission each verified subsets) — leva → plain JSX material props with
  zero plumbing is the default for physical-material studies.
- 2026-07-27 — v0.20: **the animates tier ships** (tests/animates.spec.ts,
  `pnpm test:animates`) — the pixel-diff assertion queued since v0.12, made
  urgent by rain's finding that consoles stay clean while frozen. Two-frame
  diff + frame-loop liveness + dual-root-warning capture per example; manifest
  flags `static` (18 confirmed statics — loader-gltf and materials-envmaps
  verified faithful-static against their originals' defaults),
  `animationWindowMs` (geometry-loft), `animatesSkip` (geometry-loft's ledgered
  B17 anomaly, skip-with-reason). 74 pass + 1 ledgered skip. Local-only for
  now — SwiftShader's ~1fps would need window retuning before CI wiring
  (candidate). Port checklist gained step 0. SPEC §10 tier-1.5 amendment is a
  candidate for Dennis.
- 2026-07-27 — v0.19 from wave-10 pair 1 (compute-particles-rain +
  compute-particles-snow — the compute weather pair, both landed clean after
  rain self-fixed a major find): **B18 escalation rule** (creator-hook
  components before suspending SIBLINGS — the setState-in-render cascades into
  the full B17 freeze, and smoke's console assertion passes while frozen:
  pixel-diff tier now urgent); lazy-useState rule for non-node instances
  captured by create-once closures; overrideMaterial positionNode-transfer
  note. Also flagged (B10 family): `hash(instanceIndex.add(time))` needs a
  uint cast under strict tsc. CI: custom-fog ciSkip #3 (WebGPU Device Lost on
  SwiftShader, deterministic).
- 2026-07-27 — v0.18 from wave-9 pairs 2–4 (mirror, materials-sss, custom-fog,
  fog-height, instance-points, instance-uniform — all zero-review-fix; wave 9
  closes at 73 examples). **CI milestone folded in: smoke is BLOCKING and green**
  (the B17 repair resolved the SwiftShader stall matrix; exception list is 2
  legitimate ciSkips). Flagged once each, not yet rules: leva `onEditEnd` as the
  commit gate for expensive synchronous bakes (custom-fog); uniform-driven
  fogNode graphs beat rebuild-per-change (fog-height); `Material.alphaToCoverage`
  has no version-bumping setter in 0.185.1 — toggle needs `needsUpdate`
  (instance-points); InsetView now duplicated in two ports (third occurrence →
  src/utils/). Playwright `-g`/--list note added to verification (v0.17.1).
- 2026-07-27 — v0.17 amendments from wave-9 pair 1 (ocean + clearcoat, both
  zero-review-fix): UPSTREAM B20 — Environment/useEnvironment hardwire
  CubeTextureLoader for 6-file arrays (HDR cubemaps unloadable declaratively;
  workaround `useLoader(HDRCubeTextureLoader, [files])` in `clearcoat`).
  Pattern noted once (not yet a rule): reparenting a fiber-mounted primitive
  into a side scene for `PMREMGenerator.fromScene` within one effect is safe —
  fiber reconciles parents only on commits (`ocean/OceanSky.tsx`).
- 2026-07-27 — v0.16 amendments from wave-8 pair 4 (shadowmap-vsm +
  shadowmap-pointlight, both zero-review-fix — wave 8 closes at 65 examples):
  clarification both shadow agents converged on independently — fiber dash-path
  props apply ANY `shadow.*` scalar at runtime (`shadow-radius`,
  `shadow-blurSamples`, `shadow-bias` all work live); the lights-spotlight
  imperative-sync precedent is about missing TYPED props, not capability.
  `shadows="variance"` → VSMShadowMap confirmed against the fiber variant table.
- 2026-07-27 — v0.15 amendments from wave-8 pair 3 (volume-cloud + volume-fire,
  both zero-review-fix; fire is the biggest port yet — full GPU fluid sim): TSL
  stack rule (helpers with internal toVar/assign need Fn() — runtime-only
  failure); useNodes wrapper-identity rule (2nd occurrence, now a bullet);
  useLayoutEffect rule extended to renderer-level first-render flags
  (shadowMap.transmitted); UPSTREAM B19 (fiber StorageLike misses
  Storage3DTexture). volume-fire ships the corpus's 5th ciSkip (2M-voxel sim,
  hopeless on software raster — legitimate, unlike the B17 four).
- 2026-07-27 — v0.14 amendments from wave-8 pair 2 (lines-fat + lensflares, both
  zero-review-fix): WebGPU setViewport/setScissor TOP-origin rule (upstream
  originals' bottom-origin inset math silently lands wrong — second scissor port
  exposed it). Flagged once, not yet rules: setHSL-without-colorSpace originals
  produce linear components (fiber color props are sRGB-managed — precompute);
  LensflareMesh mutates the caller's Color in place on first render.
- 2026-07-27 — v0.13: corpus-wide B17 audit + repair (wave-8 interlude). A
  full-corpus pixel-diff + frameCount sweep found 14 more B17-frozen examples
  beyond flames' original three — every ungated suspending hook in the corpus,
  including all four SwiftShader-stall examples (that CI mystery is plausibly
  THIS bug; try dropping ciSkips). All repaired with explicit Suspense gates and
  probe-verified. Fingerprint for the future: `__frameCount` advances while
  pixels freeze = dual-root, check for the createRoot warning. Probe windows
  must exceed stop-go animation periods (postprocessing-pixel false-alarmed at
  1.5s; clean at 4s). Statics-by-design confirmed: morphtargets, depth-texture,
  tonemapping, postprocessing-ao, compute-texture family.
- 2026-07-27 — v0.12 amendments from wave-7 pair 4 (tsl-vfx-flames +
  tsl-vfx-tornado — wave 7 closes at 57 examples): **the explicit-Suspense rule**
  (Canvas-boundary suspension re-runs createRoot on alpha.3 and freezes all TSL
  `time` graphs, UPSTREAM B17 — flames' pixel-diff sweep found THREE shipped
  examples latently frozen: sprites/tsl-earth/refraction, all repaired this
  commit); useUniforms-before-suspending-hooks ordering (setState-in-render via
  useRenderPipeline's whole-store subscription, UPSTREAM B18). Follow-up queued:
  a two-frame pixel-diff assertion tier — smoke's non-black check cannot see
  animation freezes.
- 2026-07-27 — v0.11 amendments from wave-7 pair 2 (postprocessing-pixel +
  postprocessing-ao): TRAA/depth-copy passes need `samples: 0` targets (fiber's
  MSAA-4x default propagates into pass() — real WebGPU validation error, found and
  fixed by the AO port); CameraControls/DemoHelpers gained `minZoom`/`maxZoom`
  (second ortho port to need the cap via controlsRef — pixel port retrofitted onto
  the prop). Also of note: `camera={{ manual: true }}` hands the frustum to the
  example (fiber's updateCamera early-returns) — used by pixel's per-frame
  frustum-snap.
- 2026-07-27 — v0.10 amendments from wave-7 pair 1 (postprocessing +
  postprocessing-dof, both zero-review-fix — postprocessing cluster opens): the
  pipeline dynamism patterns grew from two to THREE — (c) const-wrapping pass
  factories (dof) need user-created three/tsl uniform() nodes registered via
  return-to-register. v0.9's tone-mapping rule applied correctly on first use by
  both ports (both originals default NoToneMapping).
- 2026-07-27 — v0.9 amendments from wave-6 pair 4 (tsl-raging-sea +
  tsl-compute-attractors-particles, both zero-review-fix — wave 6 closes at 49
  examples): tone-mapping parity trap (fiber Canvas defaults ACESFilmic, originals
  default NoToneMapping — compare against the LIVE original, not gallery
  thumbnails); instancedBufferAttribute bullet generalized to all typed-TSL
  creators (uniformArray<'vec3'> joins it). v0.8's compute bullets verified on
  first use by the attractors port: applied verbatim, zero rediscovery.
- 2026-07-27 — v0.8 amendments from wave-6 pair 3 — the first compute ports
  (compute-texture + compute-particles, both zero-review-fix): the compute pattern
  (kernels in useNodes, three dispatch cadences, no fiber dispatch hook — useCompute
  is an upstream candidate); scoped-store WGSL-unsafety rule (new UPSTREAM B16:
  fiber's `${scope}.${name}` separator is an illegal WGSL identifier char — found by
  the smoke console assertion, invisible to tsc/build); ScopedStore type-widening +
  setName-by-key notes.
- 2026-07-27 — v0.7 amendments from wave-6 pair 2 (tsl-galaxy +
  tsl-procedural-terrain, both zero-review-fix): `frustumCulled = false` rule for
  positionNode-relocated geometry (latent upstream bug class, will recur across the
  particle/compute cluster); Suspense-gate custom-node materials on async
  Environment (three 0.185.1 IBL race, new UPSTREAM B15 — found and verified by the
  terrain port, 12/12 clean loads after the fix). Uniform-driven `Loop` octave
  count (terrain) confirmed the build-vs-run-time doc holds for loop bounds.
- 2026-07-27 — v0.6 amendments from wave-6 pair 1 (loader-gltf-dispersion +
  loader-gltf-compressed, both zero-review-fix): KTX2 `extendLoader` wiring became a
  Layer 1 bullet (first compressed-asset port); cold-start transient broadened with
  its second signature (one-time PMREM destroyed-texture console error, not just
  readiness timeout); screenshot-script location note (repo root, not scratchpad).
- 2026-07-27 — v0.5 amendments from the wave-5 glTF-extension cluster (8 ports:
  lights-phong, materials-basic, camera-array, backdrop-area, loader-gltf-iridescence,
  loader-gltf-sheen, loader-gltf-anisotropy, textures-anisotropy): screenshot-script
  WebGPU launch note (channel 'chromium' + --enable-unsafe-webgpu — two agents
  independently rediscovered it); UPSTREAM B13 evidence bumped to 4 hits (whole
  UltraHDR cluster). Patterns confirmed without amendment: leva → plain material
  accessor (TSL material reference nodes re-read per frame, no uniform plumbing —
  sheen); createPortal scenes + `<fog attach="fog">` compose fine (textures-anisotropy).
- 2026-07-27 — v0.1 seeded from example #1 (`animation-skinning-blending`), the v10
  `.mdx` docs, and the M0/M1 gotcha log. Set the folder-pattern threshold at ~200
  lines (example #1 landed at ~110). Established: titleblock is shell furniture;
  readiness signal rides in DemoHelpers.
- 2026-07-27 — v0.4 amendments from the M2 dry-run wave (5 ports: sky, rtt,
  shadow-contact, tsl-halftone, sprites — all single-Sonnet): slug rule reworded
  (prefix ALWAYS drops — sky port violated the ambiguous version); explicit `renderer`
  prop rule; fiber-hooks-inside-Canvas rule; **WGSL identifier rule for useUniforms
  scopes** (hyphens compile-error shaders at runtime; caught by the smoke console
  assertion); Fn param cast (B10); scene.fogNode cast (B11); useThree renderer union
  cast (B9); ciSkip exception-list mechanism; CameraControls gained pan lock.
- 2026-07-27 — v0.3 amendments from gate port #3 (`postprocessing-bloom-emissive`,
  Sonnet, zero human edits, cheaper than #2 — doc steering works): documented the two
  pipeline-dynamism patterns (fiber useUniforms vs pass-owned uniform fields via
  return-to-register) and the setupCB/MRT pointer. CameraControls gained
  `minDistance`/`maxDistance` (gap flagged by the port; forwarded through DemoHelpers).
- 2026-07-27 — v0.2 amendments from gate port #2 (`skinning-instancing`, Sonnet,
  zero human edits): useRenderPipeline null-guard + uniform-not-closure rules;
  `UniformNode` → `Node<'float'>` cast for the fiber typing gap; smoke-tier
  cold-start allowance. Play-only-named-clips lesson from the Soldier TPose bug
  folded into example #1 review: never `Object.values(actions).play()` blindly —
  GLTFs ship rest/utility clips.

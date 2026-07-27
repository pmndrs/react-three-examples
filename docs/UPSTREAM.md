# UPSTREAM.md — patches, pins, shims, and upstream fix briefs

The single ledger of every deviation this repo carries from a clean install, and of
every upstream bug we've verified. Two audiences:

- **Part A** — Dennis / maintainers of THIS repo: what we're carrying, why, and the
  exact condition under which each item unwinds. Nothing gets added to the repo's
  patch surface without an entry here.
- **Part B** — agents working in the react-three-fiber / drei / three.js /
  @types/three repos: self-contained fix briefs with evidence and suggested fixes.
  Each is independently actionable.

Last verified: 2026-07-27 against fiber `v10` branch HEAD (`dc6bbd7`, up to date with
origin), drei `11.0.0-alpha.5`, three `0.185.1`.

---

## Part A — What this repo carries (unwind ledger)

| # | What | Where | Unwinds when |
|---|------|-------|--------------|
| A1 | fiber installed from locally-built tarball, tarball vendored in git for CI | `package.json` (`file:reference/…alpha.3.tgz`), `.gitignore` exception | A published v10 alpha on npm installs clean against three ≥0.183 → repoint package.json, delete tarball + gitignore exception |
| A2 | drei alpha.5 patched: `WebGLCubeRenderTarget` → `CubeRenderTarget` in `/webgpu` build | `patches/@react-three__drei@11.0.0-alpha.5.patch` via `pnpm patch` (pnpm-workspace.yaml) | Next drei alpha ships the rename (B4). pnpm ERRORS on the stale patch at the version bump — that error is the removal reminder, delete the patch entry |
| A3 | Vite regex alias forcing one fiber build | `vite.config.ts` (`/^@react-three\/fiber(\/webgpu)?$/`) | fiber packaging makes `.` and `./webgpu` share a runtime chunk (B2) |
| A4 | `typescript` pinned `^6` (repo was on 7.0.2) | `package.json` devDeps | typescript-eslint ships TS7 support (typescript-eslint#10940) |
| A5 | react-router pinned to v7 (`version-7` dist-tag; npm latest is v8) | `package.json` | Deliberate scope decision, not a bug — revisit as its own migration task |
| A6 | `optimizeDeps.entries: ['index.html']` | `vite.config.ts` | Permanent while `reference/` clones exist in the worktree (Vite scans every `*.html` by default). Not an upstream issue |
| A7 | `UniformNode → Node<'float'>` double cast in examples | `src/examples/skinning-instancing.tsx` (grep `as unknown as Node`) | fiber fixes B1 → remove casts (grep finds them all) |
| A8 | pnpm pinned via `packageManager` | `package.json` | Hygiene, not a shim; keep |

House rule: **every new patch/override/pin lands with an entry here in the same
commit** (AGENTS.md points agents at this file).

---

## Part B — Upstream fix briefs

### B1 · fiber: `UniformNode<T>` alias discards the TSL node type → strict-tsc failures

- **Where**: `packages/fiber/src/webgpu` types (built decl:
  `type UniformNode<T = unknown> = three_webgpu.UniformNode<unknown, T>`).
- **History**: correctly changed from a hand-rolled shadowing
  `interface UniformNode<T> extends Node { value: T }` to an alias of three's own
  two-param `UniformNode<TNodeType, TValue>` — but the alias pins `TNodeType` to
  `unknown`.
- **Why it breaks**: `Node<unknown>` is a *supertype* of `Node<'float'>`, so a fiber
  uniform is not assignable to any TSL signature expecting
  `Node<'float'> | number` (`mix`, `bloom` args, …) under strict tsc. Every TSL-using
  consumer needs `uFoo as unknown as Node<'float'>`.
- **Evidence**: hit twice in this repo's gate ports; `docs/webgpu/render-pipeline.mdx`'s
  own `bloom(passes.scenePass.getTextureNode(), uniforms.uIntensity)` example does not
  compile under strict tsc for exactly this reason.
- **Suggested fix**: thread the node type — map the value type:
  `type NodeTypeFor<T> = T extends number ? 'float' : T extends Color ? 'color' : T extends Vector2 ? 'vec2' : T extends Vector3 ? 'vec3' : T extends Vector4 ? 'vec4' : any`
  then `type UniformNode<T = unknown> = three_webgpu.UniformNode<NodeTypeFor<T>, T>`.
  (Minimal alternative: `any` instead of `unknown` restores assignability, loses
  checking.) Add a compile test that imports the render-pipeline.mdx bloom snippet.

### B2 · fiber: `.` and `./webgpu` entries are two separate builds of one runtime

- **Where**: `packages/fiber` build config / exports map.
- **Why it breaks**: drei imports the root specifier; app code imports `/webgpu`;
  both bundles load → two reconcilers/two React contexts → "Invalid hook call" the
  moment any drei hook runs.
- **Evidence**: reproduced in this repo (M0); shim is a Vite resolve alias (A3).
- **Suggested fix**: root entry re-exports from a shared chunk (or `/webgpu` becomes
  the superset entry the root aliases to), so double-import is harmless.

### B3 · fiber: npm canary broken against three ≥0.183

- **What**: published canary imports `WebGLCubeRenderTarget` from `three/webgpu`;
  three r183 renamed it `CubeRenderTarget` → import error at install/build time.
- **Fix**: rename in source (already correct on the v10 branch — needs a fresh
  publish); this is why A1 exists.

### B4 · drei: `/webgpu` build references `WebGLCubeRenderTarget` (three ≥0.183 rename)

- **Where**: `@react-three/drei@11.0.0-alpha.5`, `webgpu/index.mjs` (6 occurrences).
- **Why it breaks**: `three.webgpu.js` r183+ exports `CubeRenderTarget`;
  bundlers hard-fail on the missing export (rolldown: `MISSING_EXPORT`).
- **Fix**: identifier rename (source-level: import rename in the cube-camera /
  env-map paths) + publish fresh alpha. Our exact working patch:
  `patches/@react-three__drei@11.0.0-alpha.5.patch` (mechanical rename, verified).

### B5 · drei: CameraControls missing from `/core` & `/webgpu` subpath exports

- **What**: camera-controls wrapper exists but isn't sorted into the renderer-split
  subpaths; importing the drei root for it drags the legacy (WebGL + legacy-fiber)
  bundle into a WebGPU app.
- **Donor implementation**: this repo's `src/utils/CameraControls.tsx` — includes the
  StrictMode-safe pattern (construct without element via `useMemo`, symmetric
  `connect`/`disconnect` effect, NEVER `dispose()` of a memoized instance in cleanup),
  camera-controls v3 notes (constructor `(camera, domElement?)`, `setTarget` returns a
  Promise), and `target`/`minDistance`/`maxDistance` props.

### B6 · drei: Grid (TSL port) thin-line shimmer under WGSL coarse derivatives

- **What**: Grid's line AA divides by `fwidth`; WGSL `fwidth` is the coarse per-quad
  derivative (notably poor on Metal), so sub-pixel-thin lines shimmer/moiré worse than
  the GLSL original. MSAA can't help (alpha is computed in-shader).
- **Repro**: default `cellThickness < 1` + camera pulled back; compare Chrome/Metal
  vs the WebGL drei Grid.
- **Suggested fix**: use `fwidthFine`-equivalent TSL node where available, and/or
  clamp effective line thickness to ≥1px in screen space.
- **Our mitigation** (works, not a fix): thickness ≥1, `fadeDistance` tuned to die
  before moiré range — see `src/utils/DemoHelpers.tsx`.

### B7 · fiber docs: `render-pipeline.mdx` snippets fail strict TypeScript

- Two issues, both verified while porting: the `mainCB` param `renderPipeline` is
  typed nullable but no snippet guards it; and the bloom-uniform snippet hits B1.
  Fix the snippets (add `if (!renderPipeline) return`, add the cast or land B1) or
  wire snippets into a typecheck.

### B9 · fiber: `/webgpu` entry types `renderer` as the WebGL|WebGPU union

- **What**: `useThree().renderer` (and RootState) is typed
  `WebGLRenderer | WebGPURenderer` even in the `/webgpu` build, whose runtime renderer
  is always `WebGPURenderer` (the hook's own JSDoc example assumes the narrow type).
- **Why it breaks**: union-typed method calls must satisfy every member, so
  WebGPU-only signatures (`setRenderTarget(RenderTarget)`, `compute`, …) fail strict
  tsc. Hit in `shadow-contact`'s offscreen capture pass.
- **Suggested fix**: the `/webgpu` entry's RootState should narrow `renderer` to
  `WebGPURenderer` (each entry already has its own build — the type can follow the
  `#three` alias the same way the runtime does).
- **Local workaround**: single documented `as WebGPURenderer` cast per file.
- **Same family**: `RootState.camera` types as base `Camera` — `.near`/`.fov` etc.
  need the analogous cast (hit in `backdrop-water/RenderPipelineFX.tsx`).

### B10 · three.js: TSL `Fn` destructured params lose their node type

- **What**: params of `Fn(([count, color]) => …)` type as bare
  `ShaderNodeObject<Node>` — no `'float'`/`'vec3'` parameter — so typed TSL overloads
  (`rotate()` notably) fail to resolve on them under strict tsc.
- **Evidence**: hit porting `webgpu_tsl_halftone` (tsl-halftone/halftoneEffect.ts —
  eight casts). Same cast family as fiber's B1, but this one is three's typings.
- **Suggested fix**: let `Fn`'s type accept a tuple of node-typed params (generic
  parameter per arg, or a `Fn<[Node<'float'>, Node<'vec3'>]>` signature).

### B12 · fiber: `useUniforms` scope/name strings flow unvalidated into WGSL identifiers

- **What**: the debug name fiber generates for a uniform (`${scope}_${name}`) ends up
  as a WGSL struct member identifier. WGSL forbids hyphens (and other JS-string-legal
  characters), so a kebab-case scope name (`useUniforms('halftone-purple', …)`)
  produces a **runtime fragment-shader compile error** — tsc and the build both pass;
  nothing fails until the shader compiles in the browser.
- **Evidence**: hit porting `webgpu_tsl_halftone`; caught only by our smoke suite's
  console-error assertion. Renaming the scope to camelCase fixed it.
- **Suggested fix**: sanitize the generated identifier (replace non-`[A-Za-z0-9_]`
  chars) or throw early from `useUniforms` with a clear message naming the offending
  scope/key. Silent pass-through into codegen is the worst of the options.

### B11 · @types/three: duck-typed `*Node` properties undeclared (fogNode, backgroundNode, emissiveNode…)

- **What**: the WebGPU renderer reads several `*Node` properties generically at
  runtime that `@types/three` declares narrowly or not at all:
  `Scene.fogNode`, `Scene.backgroundNode` (read by
  `renderers/common/nodes/NodeManager.js`), and `emissiveNode` on ALL NodeMaterial
  subclasses (`NodeMaterial.setupOutgoingLight()` reads it generically; @types only
  declares it on `MeshStandardNodeMaterial`).
- **Evidence**: hit three times across ports — `sprites` (fogNode), `reflection`
  (backgroundNode + emissiveNode on MeshPhongNodeMaterial).
- **Local workaround**: documented casts (see src/examples/sprites.tsx,
  src/examples/reflection/).
- **Suggested fix**: declare `fogNode`/`backgroundNode` on `Scene` and move
  `emissiveNode` (and friends read by `setupOutgoingLight`) up to the shared
  `NodeMaterial` declaration.

### B13 · drei: `/webgpu` `Environment` doesn't wire `UltraHDRLoader`

- **What**: three.js's newer examples ship UltraHDR JPEG environments
  (`*.hdr.jpg`, loaded via `UltraHDRLoader`); drei's `Environment` only wires
  HDR/EXR loaders, so `files="foo.hdr.jpg"` can't work on the `/webgpu` path.
- **Evidence**: hit four times (`loader-gltf`, `loader-gltf-transmission`,
  `loader-gltf-sheen`, `loader-gltf-anisotropy`) — every port had to swap to a
  plain-Radiance `.hdr` asset (documented DIVERGENCE each time). The whole
  glTF-material-extension cluster uses UltraHDR upstream, so every future port in
  that family will hit this too.
- **Suggested fix**: extension-sniff `.hdr.jpg`/`.jpg` (UltraHDR) in Environment's
  loader selection, or accept a `loader` prop override.

### B14 · @types/three: TSL `Loop()` typed surface lags the runtime

- **What**: only unnamed single (`{i}`) and flattened-double (`{i,j}`) loop forms are
  typed; the runtime supports named loop variables and arbitrary nesting
  (`LoopNode.js` auto-names by nesting index). Also: `Fn()`'s abbreviated-layout 3rd
  argument fails to typecheck with destructured callbacks even in the shape its own
  `AbbreviatedLayout` declares (resolves to a wrong overload) — B10-family symptom.
- **Evidence**: `backdrop-water` (voronoi noise graphs) — worked around with nested
  separate `Loop()` calls + aliased destructuring (verified identical shader output)
  and by dropping the optional layout argument.
- **Suggested fix**: type the `name` option and deeper overloads on `Loop`; fix the
  `Fn` layout-arg overload resolution.

### B15 · three: env-change rebuild unreliable for custom-node materials (0.185.1)

- **What**: when `scene.environment` is set AFTER a material with custom
  `positionNode`/`normalNode`/`colorNode` (+ shadow variant) has already compiled,
  the renderer intermittently (~2/5 fresh loads) never folds the IBL into that
  material — shadowed areas render pitch black, sometimes the HDR background is
  lost too. Env set BEFORE first compile is always correct.
- **Evidence**: `tsl-procedural-terrain` port. Verified both ways: a vanilla
  three-0.185.1 repro of the original's exact code (env before compile) renders
  correctly every time; the black state reproduced only in the mount-first,
  env-later flow. 12/12 clean loads after Suspense-gating the scene on the HDR.
- **Workaround in repo**: Layer 1 rule — one `<Suspense>` wrapping
  `Environment` + lights + custom-node meshes so the first build sees the env.
- **Suggested fix**: investigate `NodeMaterialObserver`/cache-key handling of
  `scene.environment` changes for materials with custom vertex-stage nodes;
  the needsUpdate path appears to miss the env-map define/graph refresh when a
  shadow pass variant exists.

### B16 · fiber: scoped `useNodes`/`useBuffers`/`useGPUStorage` debug name (`${scope}.${name}`) breaks WGSL codegen

- **What**: the scoped paths of `useNodes`, `useBuffers`, and `useGPUStorage` all
  label each created entry `setName(`` `${scope}.${name}` ``)` (useNodes.tsx;
  useBuffers.tsx:285; useGPUStorage.tsx:287 — same "Apply label for debugging"
  block). For anything whose name reaches WGSL codegen the dot lands inside a WGSL
  identifier and the shader fails to compile at runtime — TextureNode bindings
  (`@group(1) var computeTexture.colorNode_sampler : sampler;` → "expected ';' for
  variable declaration") and storage-buffer struct declarations
  (`struct computeParticles.positionsStruct {` → "expected '{' for struct
  declaration"). tsc/lint/build all pass; only the smoke suite's console assertion
  catches it.
- **Evidence**: hit porting `webgpu_compute_texture` — a `texture(storageTexture)`
  colorNode stored in `useNodes(creator, 'computeTexture')` broke the fragment
  shader. Hit again porting `webgpu_compute_particles` — `instancedArray` storage
  buffers in `useBuffers(creator, 'computeParticles')` broke BOTH compute kernels
  and the sprite fragment stage (every shader touching the buffers), so scoped
  `useBuffers` of TSL storage nodes is effectively always broken.
  (`useGPUStorage` shares the code path but escapes for raw `StorageTexture`
  values — `Texture` has no `setName`, so the guard skips it; a TSL
  `storageTexture()` node stored scoped would hit it.) Same failure family as
  B12, but WORSE: B12 requires the user to pick a bad scope name; here fiber
  itself inserts the illegal character, so no naming discipline can avoid it —
  the scoped forms are unusable for codegen-reaching entries.
- **Local workaround**: root-level (unscoped) hooks for anything that reaches the
  shader, with prefixed keys standing in for the lost scoping (bare keys are valid
  WGSL identifiers) — see src/examples/compute-texture.tsx and
  src/examples/compute-particles/Particles.tsx.
- **Suggested fix**: use a WGSL-safe separator (`_`, matching useUniforms) and
  sanitize both parts (shared fix with B12's validator).

### B17 · fiber: Canvas-boundary suspension re-runs createRoot and freezes TSL `time`

- **What**: when a child suspends all the way up to Canvas's own internal boundary
  (no user `<Suspense>` in between), fiber alpha.3 logs `R3F.createRoot should only
  be called once!` and every TSL `time`-driven node graph freezes permanently at
  frame one. Scenes still render (non-black), so smoke tiers that only assert
  pixels miss it entirely.
- **Evidence**: found porting `tsl-vfx-flames`; a pixel-diff sweep (two frames
  ~1s apart) then showed three ALREADY-SHIPPED corpus examples latently frozen
  (`sprites` 1px, `tsl-earth` 2px, `refraction` 0px changed) — all three logged the
  createRoot warning, all three had suspending `useTexture` with no explicit
  boundary. Adding `<Suspense fallback={null}>` inside Canvas fixes all of them
  (post-fix: 12k–75k px/s changing, zero warnings).
- **Full-corpus audit (wave 8)**: a systematic sweep found 14 MORE affected
  examples (every ungated suspending hook in the corpus): rtt,
  skinning-instancing, tsl-halftone, instance-mesh, lights-phong,
  lights-spotlight, materials-basic, materials-envmaps, tonemapping, and the five
  loader-gltf-* single-model ports. All repaired the same way and verified
  animating (or legitimately static with clean consoles + full-rate loops) by
  pixel-diff + `__frameCount` probes. Mechanism note: the frame loop KEEPS
  RUNNING (`__frameCount` advances) while the displayed canvas stays on the dead
  root's last frame — "loop alive, pixels frozen" is the fingerprint.
- **Likely explains the SwiftShader CI stall matrix**: all four stall examples
  (skinning-instancing, rtt, tsl-halftone, sprites) were B17 cases — on
  software raster the dual-root race plausibly lands so the readiness signal
  never fires at all. Try removing the `ciSkip`s after this repair lands.
- **Open anomaly**: `geometry-loft` logs the same createRoot warning with NO
  suspending hook anywhere in the example (17 heavy LoftGeometry exhibits, slow
  first render) — still animates, but the loop degraded to ~5fps under probe
  conditions. Different trigger for the same re-entry?
- **Workaround in repo**: Layer 1 rule — every suspending subtree inside Canvas
  gets an explicit Suspense boundary.
- **Suggested fix**: guard the root-creation path against the re-entry that
  Canvas-boundary suspension triggers (likely the Canvas component re-running its
  init on the suspense retry); at minimum, make the createRoot warning an error so
  the failure is loud.

### B18 · fiber: creator-mode `useUniforms` setState-during-render on post-suspense creation

- **What**: `useUniforms` creator mode calls `store.setState` inside `useMemo`
  during render when a uniform is first created. If the component suspends BEFORE
  `useUniforms` runs (e.g. `useTexture` called above it), creation defers to the
  post-suspense re-render — by then sibling components subscribed to the whole
  store (`useRenderPipeline` internally calls bare `useThree()`) are mounted, and
  the mid-render write triggers React's "Cannot update a component while rendering
  a different component" warning.
- **Evidence**: `tsl-vfx-tornado` (useTexture + useUniforms + useRenderPipeline
  sibling); verified against fiber source. Repo workaround: call `useUniforms`
  before any suspending hook (Layer 1 rule).
- **Escalation (wave 10)**: the same deferred store-write fires at the SIBLING
  level — a creator-hook component mounted after a properly-Suspense-gated
  suspending sibling (`compute-particles-rain`: Rain after Monkey) triggered
  setState-in-render AND the B17 createRoot re-run with full pixel freeze.
  B17 and B18 are one interacting failure family, not two isolated bugs, and
  console assertions pass while the page is frozen.
- **Suggested fix**: defer the store write out of render (queue into a
  microtask/effect-phase flush), or narrow `useRenderPipeline`'s subscription; the
  B8 family (setState-in-render from hooks) keeps growing — a lint-able contract
  ("no store writes during render") would kill the class.

### B19 · fiber: `StorageLike` union misses `Storage3DTexture`

- **What**: `useGPUStorage`'s value type (`StorageLike`) doesn't include
  `Storage3DTexture`, even though `compute.mdx` documents storing one — strict tsc
  rejects it at the hook boundary.
- **Evidence**: `volume-fire` (eight Storage3DTextures for the fluid grids) —
  worked around with `as unknown as StorageTexture` at the boundary, runtime is
  fine.
- **Suggested fix**: add `Storage3DTexture` (and audit for other storage classes,
  e.g. `StorageInstancedBufferAttribute`) to the union; a type-level test against
  the compute.mdx snippets would catch drift.

### B20 · fiber + drei: `Environment`/`useEnvironment` can't load HDR cubemaps

- **What**: both fiber's Canvas `background` handling and drei's `useEnvironment`
  route ANY 6-file array to plain `CubeTextureLoader` before extension sniffing
  (`getExtension()`: `isCubemap → extension = "cube"`), so 6-face Radiance `.hdr`
  cube sets (e.g. three's pisaHDR) are unloadable through the declarative APIs.
- **Evidence**: `clearcoat` port — worked around with
  `useLoader(HDRCubeTextureLoader, [PISA_HDR_FILES])` (nested array → one load()
  with six URLs) + manual `scene.background/environment` assignment in a layout
  effect inside the Suspense gate.
- **Suggested fix**: sniff the first entry's extension before the cube branch;
  `.hdr` → `HDRCubeTextureLoader` (and `.exr` → EXR equivalent). B13 family
  (Environment loader-selection gaps).

### B8 · drei (minor, docs-level): `useProgress` subscription can setState during render

- Loaders can start synchronously inside another component's render; a component
  SUBSCRIBED to `useProgress` then re-renders mid-render → React's "cannot update a
  component while rendering a different component" warning. Timing-dependent.
- Worth a docs note: for frame-loop consumers, read `useProgress.getState()`
  non-reactively instead of subscribing (our `src/utils/ReadinessSignal.tsx` shows
  the pattern).

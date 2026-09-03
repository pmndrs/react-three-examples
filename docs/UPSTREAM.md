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

| #                             | What                                                                                                                                        | Where                                                                                                                              | Unwinds when                                                                                                                                                                                                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ~~A1~~ **UNWOUND 2026-08-31** | ~~fiber from locally-built tarball, vendored in git for CI~~                                                                                | —                                                                                                                                  | `10.0.0-alpha.4` published on npm and installs clean against three 0.185.1. package.json repointed, tarball + `.gitignore` exception deleted.                                                                                                                                                                      |
| ~~A2~~ **UNWOUND 2026-08-31** | ~~drei alpha.5 patched for the `CubeRenderTarget` rename~~                                                                                  | —                                                                                                                                  | drei `11.0.0-alpha.6` ships the rename (B4 fixed: 0 `WebGLCubeRenderTarget`, 6 `CubeRenderTarget`). `patches/` deleted, `patchedDependencies` removed from pnpm-workspace.yaml.                                                                                                                                    |
| A3                            | Vite regex alias forcing one fiber build                                                                                                    | `vite.config.ts` (`/^@react-three\/fiber(\/webgpu)?$/`)                                                                            | fiber packaging makes `.` and `./webgpu` share a runtime chunk (B2)                                                                                                                                                                                                                                                |
| A4                            | `typescript` pinned `^6` (repo was on 7.0.2)                                                                                                | `package.json` devDeps                                                                                                             | typescript-eslint ships TS7 support (typescript-eslint#10940)                                                                                                                                                                                                                                                      |
| A5                            | react-router pinned to v7 (`version-7` dist-tag; npm latest is v8)                                                                          | `package.json`                                                                                                                     | Deliberate scope decision, not a bug — revisit as its own migration task                                                                                                                                                                                                                                           |
| A6                            | `optimizeDeps.entries: ['index.html']`                                                                                                      | `vite.config.ts`                                                                                                                   | Permanent while `reference/` clones exist in the worktree (Vite scans every `*.html` by default). Not an upstream issue                                                                                                                                                                                            |
| A7                            | `UniformNode → Node<'float'>` double cast in examples (now REDUNDANT, superseded by A9 — harmless, a cast through `unknown` still compiles) | grep `as unknown as Node` in `src/examples/`                                                                                       | Removed opportunistically; A9 already makes new code cast-free                                                                                                                                                                                                                                                     |
| A8                            | pnpm pinned via `packageManager`                                                                                                            | `package.json`                                                                                                                     | Hygiene, not a shim; keep                                                                                                                                                                                                                                                                                          |
| A9                            | **fiber `useUniforms` return type patched locally** so uniforms keep three's real types (no cast, typed `.value`, checked keys)             | `scripts/patch-fiber-types.mjs`, run from `postinstall` — rewrites `dist/webgpu/index.d.{ts,mts,cts}` ONLY, types-only, idempotent | fiber ships the B1 fix (both halves). The script FAILS LOUDLY with exit 1 if its anchor string is gone — that error is the removal reminder: delete the script, the postinstall hook, and the remaining A7 casts. Not `pnpm patch` because fiber installs from a `file:` tarball, which `pnpm patch` can't resolve |

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
- **Why it breaks**: `Node<unknown>` is a _supertype_ of `Node<'float'>`, so a fiber
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

**2026-07-29 — B1 is only HALF the bug (found while building the local fix, A9).**
Fixing the alias alone would not remove a single cast, because `useUniforms` discards
its input type independently:

```ts
// dist/webgpu/index.d.ts:3809 — T is captured, then never used
declare function useUniforms<T extends UniformInputRecord>(uniforms: T): UniformsWithUtils<UniformRecord<UniformNode>>; // = Record<string, UniformNode<unknown, unknown>>
```

So BOTH the node type and the **value** type are erased, and the keys with them.
Consequences beyond the cast: `.value` is `unknown`, so `uFoo.value = "banana"`
typechecks, and an unknown key on the returned record is not an error.

Probe against three 0.185.1 + fiber 10.0.0-alpha.3 — three's side is already correct,
which is why this is purely fiber's to fix:

```ts
const a = uniform(0.5);
const a1: Node<'float'> = a; // ✓ compiles with no cast
const a2: number = a.value; // ✓

declare const b: UniformNode<unknown, unknown>; // what useUniforms returns today
const b1: Node<'float'> = b; // ✗ TS2322
const b2: number = b.value; // ✗ TS2322
```

three composes as `UniformNode<TNodeType, TValue> = UniformNodeClass<TValue> &
InputNode<TNodeType, TValue>` and `InputNode<TNodeType, TValue> = Node<TNodeType> &
InputNodeInterface<TValue>`, so `UniformNode<'float', number>` **is** a `Node<'float'>`
by construction, and `uniform()` already ships the full value→node-type overload table
to mirror.

**Complete fix** (both halves; this is what `scripts/patch-fiber-types.mjs` applies
locally and what the PR should contain):

```ts
type UniformNodeFor<V> = V extends Node
  ? V // pass TSL nodes through
  : V extends number
    ? UniformNode<'float', number>
    : V extends boolean
      ? UniformNode<'bool', boolean>
      : V extends Vector2
        ? UniformNode<'vec2', Vector2>
        : V extends Vector3
          ? UniformNode<'vec3', Vector3>
          : V extends Vector4
            ? UniformNode<'vec4', Vector4>
            : V extends Color
              ? UniformNode<'color', Color>
              : V extends Matrix3
                ? UniformNode<'mat3', Matrix3>
                : V extends Matrix4
                  ? UniformNode<'mat4', Matrix4>
                  : V extends string
                    ? UniformNode<'color', Color> // fiber converts color strings
                    : UniformNode<unknown, V>;

declare function useUniforms<T extends UniformInputRecord>(
  uniforms: T,
): { [K in keyof T]: UniformNodeFor<T[K]> } & UniformUtils;
```

Note the return type must NOT be routed through `UniformsWithUtils<…>`: its parameter
is constrained to `UniformRecord` (`Record<string, UniformNode<unknown>>`), and a
precisely-typed uniform is not assignable to that — the constraint is itself part of
the erasure. Verified: with this applied, `mix(0, 1, uBlur)` compiles cast-free,
`.value` is typed, and a bad write errors.

**Regression signal for the fix**: of 159 `as unknown as Node<'…'>` casts in this
corpus, ~111 are uniform casts caused by THIS bug and become deletable
(`grep -rnE "\bu[A-Z]\w* as unknown as Node" src/`). The remaining ~26 match
`…In as unknown as Node` and are the unrelated B10 family (Fn destructured params) —
do not count those as fixed.

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

### B4 · drei: `/webgpu` build references `WebGLCubeRenderTarget` (three ≥0.183 rename) — **FIXED in 11.0.0-alpha.6**

- **Status**: RESOLVED 2026-08-31. alpha.6's `webgpu/index.mjs` has zero
  `WebGLCubeRenderTarget` and six `CubeRenderTarget`. Our patch is deleted (A2 unwound);
  `cubemap-dynamic` (the RenderCubeTexture consumer) verified green after the bump.
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

### B9 · ~~FIXED in fiber alpha.4~~ · fiber: `/webgpu` entry types `renderer` as the WebGL|WebGPU union

> **RETIRED 2026-09-01 (fiber alpha.4)** — the `/webgpu` entry now types `state.renderer` as `WebGPURenderer`. All 24 corpus casts swept 2026-09-02; `corpus/no-retired-patterns` now errors on reintroduction. Kept for history; do NOT cite this brief in new code.

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

### B12 · ~~FIXED in fiber alpha.4~~ · fiber: `useUniforms` scope/name strings flow unvalidated into WGSL identifiers

> **RETIRED 2026-09-01 (fiber alpha.4)** — alpha.4 sanitises scope/name strings into valid WGSL identifiers. Kept for history; do NOT cite this brief in new code.

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
- **Sharpened (wave 11)**: `useLoader(UltraHDRLoader, url)` works cleanly on
  `/webgpu` (`pmrem-equirectangular` uses the original UltraHDR asset directly) —
  the gap is strictly Environment's loader selection, not the loader or renderer.

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

### B16 · ~~FIXED in fiber alpha.4~~ · fiber: scoped `useNodes`/`useBuffers`/`useGPUStorage` debug name (`${scope}.${name}`) breaks WGSL codegen

> **RETIRED 2026-09-01 (fiber alpha.4)** — scoped stores are safe — alpha.4 sanitises the debug name. Examples that went UNSCOPED citing this brief should be re-scoped as they are restyled. Kept for history; do NOT cite this brief in new code.

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

### B17 · ~~FIXED in fiber alpha.4~~ · fiber: Canvas-boundary suspension re-runs createRoot and freezes TSL `time`

> **RETIRED 2026-09-01 (fiber alpha.4)** — alpha.4 no longer tears down the renderer root when a child suspends. Suspense boundaries added solely to work around this can be simplified — but see B28: two independently-suspending resources in ONE boundary can be protective, so do not reflexively split. Kept for history; do NOT cite this brief in new code.

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

### B21 · fiber: `declare module 'three/tsl'` augmentation shadows @types' `Fn` overloads

- **What**: fiber's `/webgpu` build augments `three/tsl` (dist/index.d.ts:1272-1305)
  and the merged `Fn` symbol exposes ONLY fiber's 4 overloads — @types/three's own
  signatures (including the statement-call form `Fn(fn, 'void')`, load-bearing at
  runtime via TSLCore's toStack) vanish under strict tsc with a misleading
  `{ layout?: unknown }` error. A NEW B10-family mechanism: module-augmentation
  shadowing, not inference failure.
- **Evidence**: `skinning-points` — the original's `Fn(fn, 'void')` kernels fail to
  typecheck; worked around by build-time inlining via a plain JS closure emitting
  the same statements (identical node graph, zero casts).
- **Suggested fix**: make fiber's augmentation additive (re-declare the upstream
  overloads alongside, or interface-merge instead of value shadowing); add a
  compile test that `Fn(fn, 'void')` still typechecks with fiber installed.

### B22 · three.js: `MRTNode.setup()` silently drops outputs whose names don't match the bound target

- **What**: `MRTNode.setup()` (src/nodes/core/MRTNode.js) resolves each named MRT
  output by matching it against the CURRENTLY BOUND render target's `texture.name`s,
  and `continue`s past any it can't match. Reuse one `mrt()` config across two targets
  and the second silently produces an EMPTY output struct — surfacing only as a WGSL
  "structures must have at least one member" compile error with no hint about which
  material or target is responsible.
- **Evidence**: `multiple-rendertargets-readback`. The three.js ORIGINAL carries this
  bug: it names only the full-res `renderTarget`'s textures, never `readbackTarget`'s,
  so the readback path compiles to an empty struct. Diagnosed by reading `MRTNode`
  source after instrumentation (three same-typed `NodeMaterial`s made the error
  unattributable); our port names both targets' textures.
- **Suggested fix**: warn instead of silently `continue`ing on an unmatched output, or
  fall back to positional/index binding when the bound target's textures are unnamed.
  Fixing the shipped example is a separate, smaller PR.

### B23 · @types/three: `Points` doesn't declare `count`

- **What**: `RenderObject.js` reads `object.count` generically, and `Sprite` declares
  it, but `Points` does not — so the standard "draw N of M GPU-resident points" pattern
  needs an undeclared-property cast.
- **Evidence**: `compute-points` (300k-point storage buffer, drawn via `<points>`).
- **Suggested fix**: DefinitelyTyped PR adding `count?: number` to `Points`.

### B24 · @types/three: `BloomNode.highPassFn` declared to return `void`

- **What**: the declared return type is `void`, but the runtime — including the addon's
  own default `luminosityHighPass` — always returns a `Node`. Any custom high-pass
  override has to fight the declaration.
- **Evidence**: `postprocessing-anamorphic` (horizontal-only high-pass via `rtt()` +
  `Loop()`). Distinct from B21, though both bite the same assignment.
- **Suggested fix**: DefinitelyTyped PR correcting the return type to `Node`.

### B25 · three.js (OPEN QUESTION): compute-driven `geometryNode` seeding race

- **What**: a `NodeMaterial.geometryNode` backed by a compute kernel auto-dispatches on
  the first rendered frame. If that first dispatch runs against unseeded storage, a
  spring/verlet kernel diverges to NaN permanently (mesh renders blank forever).
- **Evidence**: `compute-geometry`. Empirically the ONLY seeding that worked was a
  synchronous dispatch inline at the end of the `useMemo` that builds the graph. The
  original's own `onInit()` reentrant `renderer.compute()` call, a plain `useEffect`,
  AND a `useLayoutEffect` all left the mesh permanently blank — the last of which
  contradicts our usual "useLayoutEffect wins the first-render race" rule.
- **Status**: NOT root-caused. Why `useLayoutEffect` also loses this particular race is
  unexplained; the reentrant-compute path completes with zero console errors while the
  seed doesn't reliably land. Needs someone with WebGPU-backend source access before
  this becomes a rule. Documented in the example's header, deliberately not promoted.

### B26 · fiber: `useTexture`'s `onLoad` receives `useLoader`'s raw ARRAY, not the mapped record

- **Where**: `useTexture(input, optionsOrOnLoad)`, `dist/webgpu/index.mjs` ~1332–1355.
- **What**: for the Record input form, the declared callback type is
  `(texture: MappedTextureType<Url>) => void` — i.e. the same keyed record the hook
  RETURNS. The runtime instead hands it `loadedTextures`, which is
  `useLoader(TextureLoader, Object.values(stableInput))` — a positional ARRAY:

  ```js
  const loadedTextures = useLoader(TextureLoader, IsObject(stableInput) ? Object.values(stableInput) : stableInput)
  useLayoutEffect(() => { … onLoadRef.current?.(loadedTextures) }, [...])
  ```

  So the documented, type-checked usage crashes at runtime.

- **Evidence**: `lights-phong`. This typechecks clean and throws
  `TypeError: Cannot set properties of undefined (setting 'wrapT')`, which surfaces as
  an `<CanvasImpl>` error boundary trip and a never-ready example (readiness timeout,
  0 frames) — NOT as an obvious type error. The array form works but relies on
  `Object.values` ordering, which the types don't express.
- **Suggested fix**: map before invoking — build the same record the hook returns and
  pass THAT to `onLoad`, so runtime matches the declaration. (The mapping already
  exists for the return value; reuse it.) Failing that, correct the declared parameter
  type to the array for Record inputs, which is worse ergonomics but at least honest.

### B27 · fiber: `fromRef` can resolve a sibling but cannot TRANSFORM it

- **Where**: `fromRef` / `FROM_REF` / `commitMount`, `dist/webgpu/index.mjs` ~525, ~13936.
- **What**: `fromRef(ref)` returns a marker `{ [FROM_REF]: ref }`. `applyProps` skips
  markers (`if (isFromRef(value)) continue`) and `commitMount` later assigns
  `object[prop] = ref.current` verbatim. Two consequences:
  1. Resolution is TOP-LEVEL props on a three instance only. A marker nested inside a
     value (`lights([fromRef(ref)])`) is never resolved.
  2. The resolved value is assigned RAW. A prop that needs the sibling _wrapped_ —
     the common case for node materials — cannot use `fromRef` at all.
- **Evidence**: `lights-phong` needs `material.lightsNode = lights([theLight])`.
  Verified both readings empirically:
  - `lights([fromRef(ref)])` → `THREE.LightsNode.setupNodeLights: Light node not found
for Object` (the marker is not a Light, and never becomes one).
  - `lightsNode={fromRef(ref)}` → `TypeError: lightsNode.getScope is not a function`
    (a raw `PointLight` assigned where a `LightsNode` was required).

  Note `fromRef` also cannot reach a React component: `<Teapot light={fromRef(ref)} />`
  delivers the opaque marker, since only three instances go through `commitMount`.

- **Suggested fix**: an optional transform —
  `fromRef<T, R>(ref: RefObject<T | null>, transform?: (value: T) => R): R`, applied in
  `commitMount` before assignment. That makes the whole family of instance-consuming
  three APIs declarative in one line:

  ```tsx
  <meshPhongNodeMaterial lightsNode={fromRef(blueRef, (light) => lights([light]))} />
  ```

  This generalises well beyond lights — anything taking an object reference
  (`SpotLight.target`, `LOD` levels, `SkinnedMesh` skeletons) hits the same wall.

- **Workaround in the corpus** (`lights-phong`): pass the plain ref down and exploit the
  fact that `LightsNode.setLights()` is a bare reference assignment
  (`this._lights = lights`, no copy) while `setupLightsNode()` doesn't read `_lights`
  until the shader BUILDS on the first frame. So `lights([])` during render plus a
  `useLayoutEffect` that calls `setLights([ref.current])` lands before anything reads
  it — no state, no `needsUpdate`, no cast. Delete that shape when B27 ships.

### B28 · three/drei (OPEN): `PMREM.cubeUv` disposed mid-submit — recurring, not the cold-start transient

- **What**: `THREE.WebGPURenderer: Uncaptured WebGPU GPUValidationError: Destroyed
texture [Texture "PMREM.cubeUv"] used in a submit.` AGENTS.md documents this as a
  ONE-TIME cold-start signature that never repeats. On `tsl-wood` it RECURS, so the
  "gone on run 2" rule does not cover it.
- **Evidence** (2026-08-31, fiber 10.0.0-alpha.4 + drei 11.0.0-alpha.6, StrictMode on):
  - Full smoke 130/131 — `tsl-wood` the only failure.
  - In isolation it fails intermittently: ~1-in-5 on an idle machine, closer to
    2-in-3 while the machine is busy running the suite repeatedly. Load-sensitive,
    which fits a frame-in-flight race.
  - NOT general to drei `Environment`: `loader-gltf-sheen` (same component, same HDR
    path) is 4/4 clean.
- **What is different about `tsl-wood`**: TWO independently-suspending resources share
  one Suspense boundary — `<Environment>` (HDR) and `<WoodShowcase>` (`useLoader`
  FontLoader).
- **Falsified hypothesis** (recorded so nobody retries it): "the later resource
  re-suspends the shared boundary and remounts Environment, so give each its own
  boundary." Nesting `<WoodShowcase>` in an inner `<Suspense>` made the error
  **DETERMINISTIC (0/6)**, not fixed. The shared boundary is evidently PROTECTIVE — it
  delays the first render until both resources resolve, so there are no in-flight
  frames during the StrictMode remount. Reverted.
- **Status**: NOT root-caused. `PMREMGenerator` does not appear in drei's `/webgpu`
  build at all, so the `PMREM.cubeUv` texture is created three-side when
  `scene.environment` is set — the dispose likely belongs to three's node/environment
  handling rather than drei. Related family: the `useFBO` pattern in drei's `/webgpu`
  build does `useMemo` to create + `useEffect` cleanup to `dispose()`, which is exactly
  the StrictMode anti-pattern AGENTS.md warns about (a double-invoked cleanup disposes
  an instance the remount then reuses) — worth checking whether the environment path
  has the same shape.
- **Next step**: reproduce with StrictMode off to confirm the remount is the trigger,
  then instrument three's environment/PMREM disposal. Until then `tsl-wood` is a known
  flaky example, NOT a blocker.

- **Rescoped 2026-09-01 (wave-2 measurement)**: this is NOT `tsl-wood`-specific. Measured
  5 scoped runs per example on a healthy dev server:

  | example                  | pass | fail    | failures carrying the `PMREM.cubeUv` signature |
  | ------------------------ | ---- | ------- | ---------------------------------------------- |
  | `tsl-wood`               | 4/5  | 1/5     | 1 of 1                                         |
  | `loader-gltf-dispersion` | 2/5  | **3/5** | **3 of 3**                                     |

  `loader-gltf-dispersion` reproduces at ~60% versus `tsl-wood`'s ~20%, so **it is the
  better repro case** for anyone chasing this upstream. Both drive `scene.environment`
  from an HDR through drei's `<Environment>` (`/webgpu`), which is what builds the PMREM.
  **27 corpus examples import `Environment`**, so the blast radius is far wider than the
  two that happen to trip it in CI.

- The failure is console-only: the canvas renders and the non-black assertion passes; it
  is the `expect(errors).toEqual([])` console-clean assertion that fails. So it degrades
  the test signal rather than the demo.

### B29 · three.js: TSL display passes discard supplied `UniformNode` identity

- **What**: `DotScreenNode` and `RGBShiftNode` call `uniform(value)` for their scalar
  controls. In r185, `uniform(existingNode)` extracts the node's current `.value` and
  creates a new `UniformNode`; later writes to the caller's uniform never reach the
  pass. The typings likewise accept only numbers.
- **Scope, measured 2026-09-01**: the behaviour is INCONSISTENT across the display
  addons, which is the real problem — the call site gives no hint which you get.
  `BloomNode` guards (`strength.isNode ? strength : uniform( strength )`) and `dof()`
  wraps with `nodeObject()`; both preserve a supplied node. `DotScreenNode` and
  `RGBShiftNode` do not. A caller cannot tell without reading each factory's source.
  Worth fixing as a consistency pass across `examples/jsm/tsl/display/*`, not just the
  two named nodes.
- **Cost**: uniform registries such as fiber's `useUniforms` cannot feed these pass
  factories directly. Apps must synchronize two uniform sets or replace the pass
  fields after construction.
- **Verified workaround** (`postprocessing`): construct each pass with defaults, then
  assign the fiber uniform nodes to its public typed fields before shader compilation.
  Leva edits update the live effect without a pipeline rebuild or synchronization
  effect.
- **Upstream**: [three.js#34416](https://github.com/mrdoob/three.js/issues/34416).

### B30 · fiber: `useRenderPipeline` should be generic over its mainCB return type

- **What**: `useRenderPipeline(mainCB)` registers whatever the callback returns into
  `state.passes`, but `PassRecord = Record<string, any>` and the hook is not generic
  (`@react-three/fiber/dist/webgpu/index.d.ts:1341,1355,4124`). Every registered pass
  must therefore be cast back out at the read site:
  `passes.bloomPass as ReturnType<typeof bloom> | undefined`.
- **Cost**: 16 casts in this repo alone, across `postprocessing-*`, `materials-alphahash`,
  `tsl-vfx-tornado` and `scene/ocean`. Worse, it makes the "casts are a bug report" house
  rule ambiguous — agents cannot tell this forced cast apart from a real typing gap, and
  two independently proposed removing it during the restyle pilot.
- **Fix**: infer the record from the callback's return type, e.g.
  `useRenderPipeline<T extends PassRecord>(mainCB: (s) => T | void, …): { passes: T, … }`.
  The register/read-back round-trip then typechecks end to end and the casts disappear.
- **Where it bites**: any structural toggle — a leva boolean swapping `outputNode`
  between two graphs has no uniform field to assign onto, so the read-back is the ONLY
  available pattern (AGENTS.md § Post-processing (d)).

### B31 · fiber: `RootState.camera` is the base `Camera`, so every lens read needs a cast

- **What**: `state.camera` is typed `Camera` (`@react-three/fiber/dist/webgpu/index.d.ts:170`),
  which has no `.near` / `.far` / `.fov` / `.aspect`. Any example reading a lens property
  off the active camera must cast: `(camera as PerspectiveCamera).near`.
- **Distinct from B9, which is FIXED.** B9 was the `renderer` union on the `/webgpu`
  entry and fiber alpha.4 resolved it. Several in-repo comments described this camera
  cast as "the same shape as B9", which now reads as though it were also retired — it is
  not. Filed separately so the two cannot be confused again.
- **Where it bites**: `scene/backdrop-water/RenderPipelineFX.tsx` (reads `.near`/`.far`
  to reconstruct view depth). Any post-processing pass needing camera depth params hits it.
- **Fix**: `<Canvas camera>` already knows which camera class it constructed; RootState
  could carry that through a generic, or default to `PerspectiveCamera` (what fiber
  actually creates unless told otherwise), with `OrthographicCamera` narrowing when
  `orthographic` is set.

### B32 · @types/three: `demuxer_mp4.js` addon ships no type declarations at all

- **What**: `three/addons/libs/demuxer_mp4.js` has no `.d.ts` anywhere — not in the npm
  package, not in `@types/three`. Most untyped addons still typecheck because TS infers
  from JSDoc (AGENTS.md: "a missing `.d.ts` is not a reason to reach for `any`"); this one
  has neither, so any import of it is an error.
- **Cost**: consumers must hand-write an ambient declaration. Ours is
  `src/types/demuxer-mp4.d.ts`, narrowed to what `video-frame` actually uses.
- **Where it bites**: `textures/video-frame` — the WebCodecs `VideoDecoder` path that
  `VideoFrameTexture` is designed for.

### B33 · @types/three: `VideoFrameTexture.image` is `VideoFrame | {}`, so `.close()` never narrows

- **What**: `VideoFrameTexture.image` is typed as a union with the empty object, and
  `instanceof VideoFrame` narrowing does not survive to a callable `.close()` even when
  assigned to a local first. Releasing a decoded frame therefore needs a cast.
- **Cost**: one isolated cast per consumer, on the exact call that prevents a GPU-memory
  leak — the worst place to make people reach for `any`.
- **Where it bites**: `textures/video-frame` (`closeIfFrame`).
- **Fix**: type `image` as `VideoFrame` on `VideoFrameTexture`, which is what the class
  actually holds.

### B34 · @types/three: `count` is declared on `Mesh` but not `Points` / `Line`

- **What**: WebGPU instancing-by-count (`<mesh count={n}>`, no `InstancedMesh` class) is
  honoured by the renderer for points and lines too, but `@types/three` declares
  `count: number` only on `Mesh` (`src/objects/Mesh.d.ts:85`). `Points` and `Line` have no
  such field, so setting it needs a cast.
- **Cost**: two casts in this corpus that cannot be removed —
  `compute/compute-points.tsx` (`(points as unknown as { count: number })`) and
  `compute/compute-cloth/VerletWireframe.tsx` (`(lines as Line & { count: number })`).
  Both are correct and should stay until this is fixed.
- **Note**: the `Mesh` half WAS fixed — `instance-path` sets `<mesh count>` with no cast
  in 0.185.1. Only the points/line half remains.
- **Fix**: declare `count` wherever the renderer reads it — most simply on the shared
  geometry-bearing base rather than per subclass.

### B35 · @types/three: fields typed as a bare `Node` lose the whole fluent TSL surface

- **What**: the operator/chain methods (`addAssign`, `add`, `mul`, `context`, …) are
  declared on the type-parameterised extension interfaces in
  `src/nodes/math/OperatorNode.d.ts` (`NumExtensions`, `NumVec3Extensions`, …), which apply
  to `Node<'vec3'>`-shaped values. Anything declared as a BARE `Node` gets none of them.
  `LightingModelReflectedLight.directDiffuse` is typed `Node`
  (`src/nodes/core/LightingModel.d.ts:6`), so the canonical custom-lighting line —
  `reflectedLight.directDiffuse.addAssign(…)` — does not typecheck.
- **Cost**: writing a `LightingModel` subclass (the documented way to do custom lighting)
  needs a cast to `Node<'vec3'>` per field touched, or the standalone `context()` function
  instead of the chain method.
- **Where it bites**: `lights/lights-custom`.
- **Same family as B10** (`Fn` params type as bare `ShaderNodeObject<Node>`): the fluent
  surface is attached by node TYPE, and every interface that stores a node untyped drops
  it. Fixing the storage types is more valuable than fixing them one call site at a time.

### B37 · @types/three: `NodeBuilder.context` is declared `unknown`

- **What**: `NodeBuilder.d.ts:11` types `context` as `unknown`, so the documented way to
  suppress a lighting contribution inside a node's setup — `builder.context.radiance =
vec3(0)` — cannot be written without a cast. The runtime object is a plain record of
  node slots (`radiance`, `irradiance`, `ambientOcclusion`, …).
- **Cost**: one cast per site, at exactly the points where a custom lighting integration
  has to opt out of a built-in term.
- **Where it bites**: `postprocessing/postprocessing-ssr-denoise`.
- **Same family as B11** (duck-typed `*Node` fields). A declared `NodeContext` interface
  would fix it once.

### B38 · @types/three: the r185 meshopt clusterizer and simplifier ship no declarations

- **What**: `three/examples/jsm/libs/` gained `meshopt_clusterizer.module.js` and
  `meshopt_simplifier.module.js` in r185. `@types/three` declares `meshopt_decoder` but
  not those two, so importing either is `TS7016` under `strict` (no `allowJs` here, so
  their JSDoc is never read).
- **Local shim**: `src/types/meshopt.d.ts` declares only the surface
  `compute-rasterizer-ibl` uses (`buildMeshlets`, bounds, the packed buffer shapes).
  **Unwind condition**: delete the file when `@types/three` ships declarations for both.
- **Where it bites**: `compute/compute-rasterizer-ibl` — meshlet LOD generation.

### B39 · @types/three: `PassNode.options` is undeclared, so `samples` can't be set after construction

- **What**: `PassNode` assigns `this.options = options` in its constructor and reads
  `this.options.samples` in `setup()`, but `PassNode.d.ts` declares `options` only as a
  constructor PARAMETER. So `ssaaPass(scene, camera).options.samples = 0` fails `tsc` —
  and `ssaaPass()` takes no options argument, so construction-time is not available either.
- **Why it's invisible today**: fiber's `PassRecord = Record<string, any>` launders it, so
  `passes.scenePass.options.samples = 0` typechecks by accident. Anything holding its own
  pass instance does not get that.
- **Where it bites**: `postprocessing-ssaa`, `postprocessing-traa` (both must force
  single-sampled targets or WebGPU throws a sample-count validation error).

### B40 · fiber: `onCreated`'s `RootState` types `renderer` as the WebGL/WebGPU union

- **What**: on the `/webgpu` entry, `useThree((s) => s.renderer)` is correctly typed
  `WebGPURenderer`, but `Canvas`'s `onCreated?: (state: RootState) => void` hands back a
  `RootState` whose `renderer` is the union, so any WebGPU-only member (`.lighting`,
  `.compute`, …) is a type error at the one callback that runs EARLY enough to configure
  the renderer before its first render.
- **Cost**: an `instanceof WebGPURenderer` narrow or a cast. Narrowing is fine but reads as
  defensive code for a condition that cannot be false on this entry point.
- Note `onCreated` turned out to be the wrong hook for `lights-clustered` anyway (see
  B41) — but the typing gap stands for anything else that legitimately uses it.
- **Where it bites**: `lights/lights-clustered`.

### B41 · three: `Lighting.getNode()` caches into a MODULE-level WeakMap, so the first manager to touch a scene wins forever

- **What**: `Lighting.getNode(scene)` reads and writes a module-scope
  `const _weakMap = new WeakMap()` — **not** per-instance state. The renderer's own
  `RenderList` calls it while being constructed
  (`this.lightsNode = lighting.getNode( scene )`). So whichever `Lighting` instance is
  installed when the FIRST render list for a scene is built has its node cached against
  that scene permanently; assigning `renderer.lighting = new ClusteredLighting()` after
  that point changes `renderer.lighting` but NOT the node anyone reads back.
- **Why it's nasty**: it fails silently in the common case. `lights-clustered` only
  crashed (`lightingNode.setSize is not a function`) because it calls a clustered-only
  method. An example that merely reads the node would render with DEFAULT lighting while
  looking correct and passing every test — a clustered-lighting demo not doing clustered
  lighting.
- **Suggested fix**: make the cache an instance field, or key it on
  `(scene, lightingManager)`. Failing that, a public way to evict a scene's cached node.
- **Where it bites**: `lights/lights-clustered` — worked around by installing the manager
  in fiber's renderer FACTORY (`renderer={(props) => …}`), i.e. at construction, which is
  what the vanilla original does. Neither a Canvas child's layout effect nor `onCreated`
  is early enough. Measured ordering, which is the reverse of what you'd guess:
  **layout effect runs BEFORE `onCreated`**, and the node is already cached before both.

### B42 · fiber: `once()` is typed `<T>(...args: T[]) => T`, which rejects every multi-arg use

- **What**: `once()` exists so a geometry method like `translate(x, y, z)` runs once at
  construction. The runtime stores `{ [ONCE]: args }` and the reconciler SPREADS `args`
  into the call — so `once(0, 50, 0)` is the correct form. But the declaration
  `once<T>(...args: T[]): T` types that call as `number`, and `GeometryTransformProps`
  declares `translate?: [x: number, y: number, z: number]`, so it fails typecheck. The form
  that typechecks — `once([0, 50, 0])` — calls `translate([0,50,0])` at runtime and produces
  NaN geometry. The type-correct call is runtime-wrong and the runtime-correct call is
  type-wrong.
- **Fix**: `once<A extends unknown[]>(...args: A): A` (a tuple), and the transform props
  accept `A | Once<A>`.
- **Where it bites**: `geometry-terrain-raycast` (worked around with `useMemo`); any port
  translating/scaling a geometry with more than one argument.

### B36 · drei: `<CurveModifier>` is exported from `/webgpu` but is WebGL-only

- **What**: `@react-three/drei/webgpu` exports `CurveModifier`, which imports `Flow` from
  `three/examples/jsm/modifiers/CurveModifier.js`. That `Flow` patches a `ShaderMaterial`
  through `onBeforeCompile`, which does nothing to a node material — so the component is
  inert on the WebGPU entry point that exports it.
- **The fix exists upstream**: `three/examples/jsm/modifiers/CurveModifierGPU.js` ships a
  node-material `Flow`. A `/webgpu` build importing that one would make spline-flow
  declarative again.
- **Where it bites**: `geometry/modifier-curve` — ported imperatively instead, because the
  drei component silently renders unmodified geometry.
- **Caveat for whoever takes this**: `CurveModifierGPU`'s `.d.ts` declares four helper
  exports the shipped `.js` does not have (see B-adjacent note in AGENTS.md § Environment
  gotchas). Only `Flow` is real at runtime.

### B8 · drei (minor, docs-level): `useProgress` subscription can setState during render

- Loaders can start synchronously inside another component's render; a component
  SUBSCRIBED to `useProgress` then re-renders mid-render → React's "cannot update a
  component while rendering a different component" warning. Timing-dependent.
- Worth a docs note: for frame-loop consumers, read `useProgress.getState()`
  non-reactively instead of subscribing (our `src/utils/ReadinessSignal.tsx` shows
  the pattern).

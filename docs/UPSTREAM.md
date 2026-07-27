# UPSTREAM.md — patches, pins, shims, and upstream fix briefs

The single ledger of every deviation this repo carries from a clean install, and of
every upstream bug we've verified. Two audiences:

- **Part A** — Dennis / maintainers of THIS repo: what we're carrying, why, and the
  exact condition under which each item unwinds. Nothing gets added to the repo's
  patch surface without an entry here.
- **Part B** — agents working IN the react-three-fiber / drei repos: self-contained
  fix briefs with evidence and suggested fixes. Each is independently actionable.

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

### B10 · three.js: TSL `Fn` destructured params lose their node type

- **What**: params of `Fn(([count, color]) => …)` type as bare
  `ShaderNodeObject<Node>` — no `'float'`/`'vec3'` parameter — so typed TSL overloads
  (`rotate()` notably) fail to resolve on them under strict tsc.
- **Evidence**: hit porting `webgpu_tsl_halftone` (tsl-halftone/halftoneEffect.ts —
  eight casts). Same cast family as fiber's B1, but this one is three's typings.
- **Suggested fix**: let `Fn`'s type accept a tuple of node-typed params (generic
  parameter per arg, or a `Fn<[Node<'float'>, Node<'vec3'>]>` signature).

### B8 · drei (minor, docs-level): `useProgress` subscription can setState during render

- Loaders can start synchronously inside another component's render; a component
  SUBSCRIBED to `useProgress` then re-renders mid-render → React's "cannot update a
  component while rendering a different component" warning. Timing-dependent.
- Worth a docs note: for frame-loop consumers, read `useProgress.getState()`
  non-reactively instead of subscribing (our `src/utils/ReadinessSignal.tsx` shows
  the pattern).

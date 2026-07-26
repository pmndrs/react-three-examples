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
- RootState exposes **`renderer`** — `gl` is a deprecated alias, do not write it.
- Canvas-level options replace v9 patterns: `background` prop (color / hex / HDR URL /
  environment preset / expanded object) replaces `<color attach="background">`;
  `shadows` accepts variant strings. `flat`/`linear`/`colorSpace`/`toneMapping` props
  are gone — configure via `renderer={{ toneMapping, outputColorSpace }}`.

### Frame loop

- `useFrame((state, delta) => …)`; `state.clock` is gone — use `state.time` (ms,
  RAF-derived), `state.delta` (s), `state.elapsed` (s).
- The scheduler is phase-based: `{ phase: 'input' | 'physics' | 'update' | 'render' }`,
  plus `before`/`after` constraints and `{ fps: n }` throttling. Numeric priorities are
  a v9-ism — don't use them.
- **Registering any callback with `phase: 'render'` takes over rendering** — only do
  that when the example is about custom rendering, and never also call
  `renderer.render()` alongside the default loop.
- `useFrame` returns pause/resume controls; prefer them over ad-hoc booleans for
  pause UX (mixer-level `timeScale` is fine when showcasing the three.js API itself).

### TSL / WebGPU hooks

- Hooks: `useUniforms`, `useNodes`, `useLocalNodes`, `useRenderPipeline`, `useBuffers`,
  `useGPUStorage` — `/webgpu` entry only. All creator hooks are create-if-not-exists
  and StrictMode-safe; calling twice shares the instance.
- **Build-time vs run-time**: JS `if/for` in node builders runs ONCE when the graph is
  built; use TSL `If()/Loop()/select()` for anything that must react to uniforms.
- Prefer TSL built-ins (`time`, `cameraPosition`, …) over hand-driven uniforms;
  uniforms from RootState only for values with no built-in (viewport/size).
- Node materials are auto-extended by the `/webgpu` entry: `<meshStandardNodeMaterial>`
  etc. just work in JSX.
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
  - TWO dynamism patterns — pick by where the uniform lives: (a) values YOU introduce
    into the graph → fiber `useUniforms` + the cast above; (b) knobs a three.js pass
    already exposes as `uniform()`-backed fields (`bloom().strength/.radius` etc.) →
    return the pass from the mainCB to register it on `passes`, then mutate
    `pass.foo.value` in an effect. (b) needs no cast and no extra uniform — prefer it
    when the field exists.
  - `useRenderPipeline(mainCB, setupCB)`: setupCB is where MRT config goes
    (`scenePass.setMRT(...)`) — full details in
    `reference/react-three-fiber/docs/webgpu/render-pipeline.mdx`.

### Ecosystem + React

- drei v11 is renderer-split: import **`@react-three/drei/webgpu`** (or `/core` for
  renderer-agnostic); NEVER the root or `/legacy` in WebGPU code — the root build is
  legacy-flavored and will drag in a second runtime.
- StrictMode double-invokes effects: never `dispose()` a `useMemo`'d instance in an
  effect cleanup (kills the memoized instance for good). Use symmetric connect/
  disconnect effects — see [src/utils/CameraControls.tsx](src/utils/CameraControls.tsx).
- Declarative-first: the scene graph is JSX; imperative three.js calls are an
  intentional, showcased escape hatch (R3F is an AND with three.js, not an OR) — keep
  them visible in the component that owns them, not hidden in helpers.
- No module-scope mutable state. Controls at the edge; props where they clarify.
- `useAnimations`: play clips BY NAME, never `Object.values(actions)` — GLTFs ship
  rest/utility clips (e.g. Soldier.glb's `TPose`) that pollute the blend at default
  weight 1.

## Layer 2 — corpus conventions (this repo's format)

### Files, routes, manifest

- One file per example: `src/examples/<slug>.tsx`, default-exporting the page
  component. Route is `/examples/<slug>` (globbed — no route wiring needed).
- If the index file would exceed **~200 lines**, switch to the folder pattern:
  `src/examples/<slug>/<slug>.tsx` entry (folder name must match) + sibling
  subcomponents. The split itself is a taught pattern — split by scene role, not by
  arbitrary size.
- Slug = original three.js example name, kebab-case, renderer prefix dropped:
  `webgpu_skinning_instancing` → `skinning-instancing` (when a dual-renderer original
  exists, one port covers both).
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
  include it even with everything visual turned off.
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
2. Dev server: route renders, console clean, canvas context is `webgpu`
3. `pnpm test:smoke` (Playwright: readiness signal fires, canvas non-black). Expected
   transient: the FIRST-ever run of an example with multi-MB hotlinked assets and/or a
   fresh shader-graph build can blow the readiness timeout once (cold CDN fetch +
   compile), then pass in ~1s thereafter — one slow first run is not a broken example;
   two is.
4. Screenshot for review — collapse the leva panel first (it overlays center-frame
   subjects at small viewports)

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

## Changelog

- 2026-07-27 — v0.1 seeded from example #1 (`animation-skinning-blending`), the v10
  `.mdx` docs, and the M0/M1 gotcha log. Set the folder-pattern threshold at ~200
  lines (example #1 landed at ~110). Established: titleblock is shell furniture;
  readiness signal rides in DemoHelpers.
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

# React Three Fiber v10 — Status Research (as of 2026-07-26)

All facts below were verified live via the npm registry API, GitHub REST/GraphQL API, and
raw.githubusercontent.com fetches of the `v10` branch on 2026-07-26. No training-data recall was
used for version numbers or API shapes.

## 1. Release status — alpha, not stable, but very actively developed

- **npm `@react-three/fiber` dist-tags** (verified via `registry.npmjs.org/@react-three/fiber`):
  - `latest` → **9.6.1** (published 2026-04-28) — this is what `npm install @react-three/fiber` gets today.
  - `alpha` → **10.0.0-alpha.2** (published 2026-01-20)
  - `canary` → **10.0.0-canary.0706a92** (published **2026-07-25**, i.e. yesterday relative to today) —
    this canary's `version` field and peerDeps match the `v10` branch HEAD commit `0706a92f`.
  - `rc` / `beta` tags on npm still point at old **v9** pre-releases (`9.0.0-rc.10`, `9.0.0-beta.1`) —
    irrelevant leftovers, not v10 signals.
- The **`v10` branch** (not yet merged to `master`/default branch) is where all v10 work happens.
  Its `packages/fiber/package.json` is currently at **`10.0.0-alpha.3`** (bumped 2026-07-25, commit
  `e5b13787`), one version ahead of the last published `alpha` npm tag (`alpha.2`). So npm's `alpha`
  tag is slightly stale relative to branch HEAD; the `canary` tag tracks HEAD more closely.
- **Only one formal GitHub Release exists for v10**: `v10.0.0-alpha.1` (2026-01-17). `alpha.2`/`alpha.3`
  were published to npm but have no corresponding GitHub Release entry — releases are lagging behind
  the branch's actual pace of work.
- **Commit velocity on `v10` is high and recent**: 8+ merged PRs landed on 2026-07-25 alone (the day
  before "today"), including a bump to require `three >= 0.185`, WebGPU RenderPipeline refactors, and
  test-renderer build fixes. There's also a `fix/v10-alpha-hardening` branch in progress, suggesting
  the team is actively working toward a more stable alpha/beta, not idle.
- **Peer deps** (from `v10` branch `packages/fiber/package.json`):
  `react: >=19.0 <19.3`, `react-dom: >=19.0 <19.3`, `three: >=0.185.0`. Current npm `three@latest` is
  **0.185.1** (verified), so v10-alpha.3 is in lockstep with the latest three.js release.
- **Bottom line: v10 is pre-release alpha software, not RC/beta/stable.** No published timeline for a
  beta or RC was found in release notes, discussions, or issues. Given the pace of merges (daily, as
  of 2026-07-25), it reads as active, serious pre-release development rather than a stalled effort.

Sources:
- https://registry.npmjs.org/@react-three/fiber (dist-tags, version times)
- https://github.com/pmndrs/react-three-fiber/releases
- https://github.com/pmndrs/react-three-fiber/releases/tag/v10.0.0-alpha.1
- https://github.com/pmndrs/react-three-fiber/commits/v10
- https://raw.githubusercontent.com/pmndrs/react-three-fiber/v10/packages/fiber/package.json
- https://raw.githubusercontent.com/pmndrs/react-three-fiber/v10/CHANGELOG-ALPHA.md

## 2. Who's driving it

Notable for this project: the v10 effort was **initiated and is being driven by DennisSmolek**
(per the `v10.0.0-alpha.1` GitHub Release notes: *"late last year @DennisSmolek took the initiative
to do it all himself"*, PR #3620 "Start of the v10 Branch"), and essentially every commit/PR merged
into the `v10` branch since is authored by DennisSmolek. The pinned announcement discussion
(https://github.com/pmndrs/react-three-fiber/discussions/3665, posted by `krispya` 2026-01-17) also
credits DennisSmolek. Worth knowing given this project's SPEC.md already names "promoting the v10
release" as a goal-date driver.

## 3. What's new in v10 vs v9

Source: `docs/migration/v10.mdx` on the `v10` branch
(https://raw.githubusercontent.com/pmndrs/react-three-fiber/v10/docs/migration/v10.mdx) — full text
fetched and verified 2026-07-26.

### Renderer-agnostic core
- **`state.gl` → `state.renderer`.** `gl` still works but logs a deprecation warning.
- **Three entry points**, matched to renderer needs:
  | Import | Renderer | Notes |
  |---|---|---|
  | `@react-three/fiber` | WebGL (WebGPU-ready) | default, backwards compatible |
  | `@react-three/fiber/legacy` | WebGLRenderer only | smaller bundle, no deprecation warnings |
  | `@react-three/fiber/webgpu` | WebGPURenderer | includes WebGPU/TSL hooks, auto-`extend()`s the WebGPU node-material namespace |
- **Opt into WebGPU with a single prop** — no manual async init required:
  ```tsx
  <Canvas renderer>              {/* shorthand, WebGPU with defaults */}
  <Canvas renderer={{ antialias: true, forceWebGL: false }} />   {/* params */}
  <Canvas renderer={myWebGPURenderer} />   {/* pre-created instance, still no init call needed */}
  ```
  R3F handles `renderer.init()` internally; this is the biggest DX change relevant to this project.
- Your existing v9 WebGL code is stated to keep working unchanged; WebGPU is opt-in.

### Scheduler / `useFrame` rewrite
- Whole new scheduler, decoupled from `<Canvas>` (can run standalone/outside R3F tree, shareable
  across multiple canvases in one RAF loop).
- `priority`-number ordering replaced by named **phases**: `useFrame(fn, { phase: 'physics' })`, plus
  `before`/`after` constraints, per-hook `fps` throttling, and `pause()`/`resume()` controls returned
  from `useFrame`.
- **Breaking:** registering *any* callback on the `'render'` phase now takes over rendering entirely
  (v9 required a nonzero `priority` for this) — a likely gotcha for anyone porting v9 patterns.
- **Breaking:** `state.clock` (`THREE.Clock`) removed. Use `state.time` (ms, RAF timestamp),
  `state.delta` (s), `state.elapsed` (s) directly from frame state instead.

### Canvas prop changes
- Removed: `legacy`, `linear`, `flat`, `colorSpace`, `toneMapping` — now configured via
  `gl={...}` (legacy) or `renderer={...}` (WebGPU) directly.
- New first-class `background` prop replacing the `<color attach="background">` JSX pattern —
  accepts a color, hex, HDR URL, or a named environment preset (`sunset`, `city`, etc.), including an
  object form for separate background/environment-intensity control.
- New `forceEven` prop (Safari workaround — rounds canvas dims to even numbers).

### React support
- React `>=19.0 <19.3` required (peer dep on the `v10` branch) — no React 18 support in v10.

Full doc: https://raw.githubusercontent.com/pmndrs/react-three-fiber/v10/docs/migration/v10.mdx

## 4. WebGPU / TSL usage pattern — the canonical answer for this project

Source: `docs/webgpu/overview.mdx`, `docs/webgpu/tsl-hooks.mdx`, `docs/webgpu/render-pipeline.mdx`,
`docs/webgpu/hmr.mdx` on the `v10` branch (all fetched verbatim 2026-07-26).

### Canonical Canvas pattern

```tsx
import { Canvas } from '@react-three/fiber/webgpu'   // auto-extends node materials into JSX
import { positionLocal, normalLocal } from 'three/tsl'

function App() {
  return (
    <Canvas renderer>                 {/* WebGPURenderer, R3F awaits init() internally */}
      <mesh>
        <sphereGeometry />
        <meshStandardNodeMaterial positionNode={positionLocal.add(normalLocal.mul(0.1))} />
      </mesh>
    </Canvas>
  )
}
```

Key points:
- **No manual `gl={(props) => new WebGPURenderer(props)}` + manual `await init()` factory is needed
  in v10** — that was the v9-era pattern (still works as a fallback, but has a known race — see §6).
  In v10 the `renderer` prop (boolean shorthand, params object, or a pre-built instance) is the
  documented, canonical way in.
- Importing from `@react-three/fiber/webgpu` **auto-calls `extend()`** with three's WebGPU node
  material namespace, so `<meshStandardNodeMaterial>`, `<meshBasicNodeMaterial>`, etc. are usable as
  JSX with no manual `extend({ MeshStandardNodeMaterial })` boilerplate. This is different from v9,
  where you'd typically `import * as THREE from 'three/webgpu'` and `extend(THREE)` yourself.
- `useThree()`/`useFrame()` expose the renderer at `state.renderer` (not `state.gl`).

### TSL-specific hooks (only exported from the `/webgpu` entry point)
- `useUniform(name, value)` / `useUniforms(creatorOrScopeOrFn, scope?)` — create-if-not-exists,
  shared-by-name uniforms in R3F's root store; scoping to avoid name collisions; Leva-friendly
  (plain objects auto-convert to `Vector2/3`, deep-compare avoids redundant GPU writes).
- `useNodes(creator, scope?)` / `useLocalNodes(creator)` — share TSL node graphs (e.g. noise
  functions) across components; compose local + shared nodes.
- `useRenderPipeline(mainCB, setupCB?)` — declarative post-processing/MRT pipeline setup, built on
  three's `RenderPipeline` (three's own docs still call it `PostProcessing`, per the source). Throws
  if used with the WebGL/legacy renderer. **Does not re-run its callbacks on HMR** (rebuilding a TSL
  graph on hot reload can corrupt cached references like `SkinningNode`) — call the hook's `rebuild()`
  or do a full reload to see pipeline edits during dev.
- `useBuffers` / `useGPUStorage` (added in **alpha.3**, 2026-07-25) — GPU compute buffer/storage-texture
  management (`instancedArray`, `StorageTexture`, etc.), same create-if-not-exists/scoping pattern.
- HMR: uniforms/nodes/buffers/storage hooks all rebuild automatically on save (Vite/webpack HMR event
  bumps an internal version that busts their memoization); `useRenderPipeline` is the deliberate
  exception noted above. Can be disabled repo-wide via `<Canvas hmr={false}>`.

### TSL build-time vs run-time gotcha (worth putting in the project's conventions doc)
The docs are explicit that this is the #1 mental-model trap: JS `if/for` inside a node-creator
callback runs **once at graph-build time** and won't react to uniform changes; use TSL's own
`If()/Loop()/select()` for GPU-side branching that reacts to uniform changes every frame. Also:
prefer TSL built-ins (`cameraPosition`, `time`, etc.) over hand-rolled uniforms mirroring
`state.camera`/clock — only bridge `RootState` values (e.g. `state.size`, `state.viewport.dpr`) that
have no TSL built-in equivalent.

Sources:
- https://raw.githubusercontent.com/pmndrs/react-three-fiber/v10/docs/webgpu/overview.mdx
- https://raw.githubusercontent.com/pmndrs/react-three-fiber/v10/docs/webgpu/tsl-hooks.mdx
- https://raw.githubusercontent.com/pmndrs/react-three-fiber/v10/docs/webgpu/render-pipeline.mdx
- https://raw.githubusercontent.com/pmndrs/react-three-fiber/v10/docs/webgpu/hmr.mdx
- https://raw.githubusercontent.com/pmndrs/react-three-fiber/v10/CHANGELOG-ALPHA.md

## 5. Docs site state — NOT yet published for v10 (important gap)

Verified live 2026-07-26 by fetching the production docs site directly:

- **`https://r3f.docs.pmnd.rs/getting-started/introduction`** — live, but reflects **v8/v9 only**
  ("`@react-three/fiber@8` pairs with react@18, `@react-three/fiber@9` pairs with react@19"). No
  mention of v10 or WebGPU anywhere on the page; sidebar's Tutorials section only has a **v9**
  migration guide.
- **`https://r3f.docs.pmnd.rs/webgpu/overview`** → **HTTP 404**. Does not exist on the live site.
- **`https://r3f.docs.pmnd.rs/migration/v10`** → **HTTP 404**. Does not exist on the live site.
- All the v10/WebGPU documentation quoted in §3–4 above currently lives **only in the `v10` git
  branch's `/docs` folder** (`.mdx` files with `nav:` frontmatter, clearly staged to publish once
  merged) — it has not been deployed to docs.pmnd.rs yet.
- GitHub Discussions has no "Announcements" category (only General/Ideas/Q&A/Show and tell); the v10
  announcement lives as a General-category discussion:
  **https://github.com/pmndrs/react-three-fiber/discussions/3665** (by `krispya`, 2026-01-17),
  cross-linking to the in-repo docs on the `v10` branch (not the live docs site) — consistent with
  the 404s above. A follow-up community Q&A thread on the new scheduler:
  https://github.com/pmndrs/react-three-fiber/discussions/3740 (2026-04-14).
- No GitHub wiki content; repo points users to docs.pmnd.rs / in-repo `/docs` instead.

**Implication for this project:** don't link to r3f.docs.pmnd.rs for v10/WebGPU material — it isn't
there. The only authoritative v10 docs right now are the raw `.mdx`/`.md` files on the `v10` branch
(URLs above), which should be mirrored/cited directly, with the understanding that URLs will likely
change (from `/blob/v10/docs/...` paths to live `docs.pmnd.rs/...` paths) once v10 merges and the
site redeploys.

## 6. Known gaps / open risks (from open issues + branch state, verified 2026-07-26)

- **Open bug — async `gl` factory race (issue #3782, filed 2026-07-13, still open):**
  *"Re-render during async gl factory invokes it twice and corrupts the renderer."* If a component
  re-renders while a `gl={async (props) => { const r = new WebGPURenderer(props); await r.init(); return r }}`
  factory is still pending, `configure()` can run a second time before the first await resolves,
  creating **two renderers on one canvas** — manifests as per-frame `GPUValidationError` (mismatched
  depth/stencil attachment sizes) and, worse, "silent WebGPU canvas death" on client-side navigation
  in static exports (adapter request never reached on the second pass). Reporter says a fix (serialize
  `configure()`) is written with a regression test and pending a PR against master.
  Filed against **v9.6.1** using the manual `gl={async...}` factory pattern — the *exact* pattern
  this project would have used pre-v10, and worth double-checking against once v10's declarative
  `<Canvas renderer>` path ships, since that path is supposed to short-circuit this whole class of bug
  by having R3F own the async init sequencing itself.
  https://github.com/pmndrs/react-three-fiber/issues/3782
- **Open v10-tagged issues** (7 total, via `label:v10 is:open`): mostly docs/DX tracking items —
  TypeScript inference gaps for `useUniforms` (#3769), AwesomeR3F page needs a v10 update (#3642),
  a "Cookbook page" doc stub (#3415), an RFC for an eslint plugin (#2701), enhanced/manifest-based
  loading proposals (#3634, #3616 — explicitly deferred to "v10.1"), and a `createRoot()`/manual
  canvas resize bug affecting camera state (#3780, labeled `documentation`+`v10`).
  https://github.com/pmndrs/react-three-fiber/issues?q=is%3Aissue+is%3Aopen+label%3Av10
- **`useRenderPipeline` HMR limitation** (see §4) — a real authoring-workflow friction point for a
  project built around lots of small WebGPU/TSL post-processing examples: pipeline edits need an
  explicit `rebuild()` call or full reload, not just save-to-refresh.
- **Ecosystem lag:** drei has a matching **`11.0.0-alpha.5`** (published 2026-02-03, peer dep
  `@react-three/fiber: >=10.0.0-0`, `three: >=0.182`) but is itself alpha and, per the v10 migration
  FAQ, "WebGPU-specific features may require updates to ecosystem packages over time" — i.e. drei/
  postprocessing WebGPU parity isn't guaranteed yet. (Verified: `registry.npmjs.org/@react-three/drei`
  dist-tags — `alpha: 11.0.0-alpha.5`, `latest` still `10.7.7`.)
- **No public beta/RC timeline found** anywhere (release notes, discussions, issues) — alpha.1 → 3
  over ~6 months (2026-01-17 → 2026-07-25) with accelerating commit velocity on 07-25, but no stated
  date for beta or stable. Treat v10 as a moving target for the duration of this project; pin an
  exact `canary`/`alpha` version and expect to re-sync periodically (SPEC.md's "monthly cadence" for
  three.js upgrades should probably also apply to r3f/drei alpha bumps).
- **Version skew to watch:** npm's `alpha` dist-tag (10.0.0-alpha.2) is one release behind the `v10`
  branch's actual `package.json` (10.0.0-alpha.3) and the `canary` tag (which does track branch HEAD,
  `0706a92`, published 2026-07-25). For this project, **installing from the `canary` npm tag (or
  building from the `v10` branch directly) will track the real state of WebGPU support more closely
  than the `alpha` tag** — worth deciding explicitly rather than defaulting to `@react-three/fiber@alpha`.

## Version/date quick reference

| Item | Value | Verified via |
|---|---|---|
| npm `@react-three/fiber@latest` | 9.6.1 (2026-04-28) | registry.npmjs.org |
| npm `@react-three/fiber@alpha` | 10.0.0-alpha.2 (2026-01-20) | registry.npmjs.org |
| npm `@react-three/fiber@canary` | 10.0.0-canary.0706a92 (2026-07-25) | registry.npmjs.org |
| `v10` branch `packages/fiber` version | 10.0.0-alpha.3 (bumped 2026-07-25) | raw.githubusercontent.com |
| Only formal GH Release for v10 | v10.0.0-alpha.1 (2026-01-17) | api.github.com/releases |
| `v10` branch peer deps | react/react-dom >=19.0 <19.3, three >=0.185.0 | package.json on branch |
| npm `three@latest` | 0.185.1 | registry.npmjs.org |
| npm `@react-three/drei@alpha` | 11.0.0-alpha.5 (2026-02-03) | registry.npmjs.org |
| docs.pmnd.rs v10/webgpu pages | 404 — not published | live fetch |
| Open async-renderer-race bug | #3782 (filed 2026-07-13, open) | api.github.com/issues |

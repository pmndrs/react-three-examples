# pmndrs Ecosystem Status — WebGPU Era (research date: 2026-07-26)

Research for building R3F ports of the official three.js examples, WebGPU-first, in `/Users/dex/Developer/r3f-three-examples`.

---

## 1. `@react-three/drei` v11 — WebGPU compatibility effort

**Status: alpha, not yet stable.** npm `latest` dist-tag is still **10.7.7** (published 2025-11-13). The `alpha` dist-tag is **11.0.0-alpha.5** (published 2026-02-03), following alpha.1/.3/.4. There's also a parallel `10.8.0-alpha.1`.

- Releases: https://github.com/pmndrs/drei/releases
- npm: https://www.npmjs.com/package/@react-three/drei

### What "v11" means

Drei v11 is explicitly the WebGPU-compatibility major version, developed in lockstep with react-three-fiber v10 (see §6). It restructures the package into **renderer-specific entry points** so WebGL-only code (GLSL materials, `WebGLRenderTarget`) doesn't get bundled into WebGPU/TSL apps and vice versa. From the v11 README (`https://github.com/pmndrs/drei/blob/v11.0.0-alpha.5/README.md`):

```jsx
import { OrbitControls, Environment } from '@react-three/drei'          // All, renderer-agnostic
import { OrbitControls } from '@react-three/drei/core'                  // Core only, smallest bundle
import { Bvh } from '@react-three/drei/external'                        // External lib wrappers
import { MarchingCubes } from '@react-three/drei/experimental'          // Rough/experimental
import { MeshDistortMaterial, Fbo } from '@react-three/drei/legacy'     // WebGL-only (GLSL)
import { MeshDistortMaterial, Fbo } from '@react-three/drei/webgpu'     // WebGPU-only (TSL)
```

Confirmed via the package.json `exports` map at tag `v11.0.0-alpha.5`:
```json
"exports": {
  ".": {...}, "./core": {...}, "./external": {...},
  "./experimental": {...}, "./legacy": {...}, "./webgpu": {...}, "./native": {...}
}
```
And `src/` is physically split into `core/`, `legacy/`, `webgpu/`, `external/`, `experimental/`, `native/`, `utils/` directories (confirmed via GitHub tree at that tag). The `webgpu/` source tree has `Effects/ Geometry/ Helpers/ Materials/ Staging/ Textures/ UI/` — i.e. TSL rewrites are being built out per-category, not as a thin shim.

A `MIGRATION_V10_TO_V11.md` is referenced from the README but did **not** exist in the repo tree at the alpha.5 tag or on `master`/`v11` branches at research time — docs are still catching up to the code.

### Component migration tracking (WebGPU/TSL audit)

- **Audit issue** — [#2533 "WebGPU Support Audit"](https://github.com/pmndrs/drei/issues/2533): defines a classification scheme per component — `both`, `both-imports`, `both-minor`, `both-major`, `webgl`, `webgpu`, `webgpu-only`.
- **Remaining work tracker** — [#2658 "[v11] Remaining WebGPU/TSL Components"](https://github.com/pmndrs/drei/issues/2658) (open).
- Entry-point design discussion — [#2537 "Entry Points"](https://github.com/pmndrs/drei/issues/2537) and [#2535 "webgpu entry point"](https://github.com/pmndrs/drei/issues/2535). Key quote from #2537 (maintainer draft): components that can support both renderers "live in a shared location structure wise, but import wise we are going to do a hard split down the WebGLRenderer and WebGPURenderer lines... touching ANYTHING in the main three setup will import `three.module.js` giving us a few extra mb."

**Open per-component migration issues (still WebGL-only as of research date):**
- [#2661 MeshReflectorMaterial](https://github.com/pmndrs/drei/issues/2661) — open
- [#2663 SpotlightMaterial](https://github.com/pmndrs/drei/issues/2663) — open
- [#2659 Accumulative Shadows](https://github.com/pmndrs/drei/issues/2659) — open
- [#2628 Split Depth Component](https://github.com/pmndrs/drei/issues/2628) — open

**Closed / already ported:**
- [#2588 Update Text for WebGPU Support](https://github.com/pmndrs/drei/issues/2588) — closed
- [#2528](https://github.com/pmndrs/drei/pull/2528) / [#2582](https://github.com/pmndrs/drei/pull/2582) `<View>` WebGPU support — merged (note: [#2519](https://github.com/pmndrs/drei/issues/2519) reported ghosting when using `View` with `WebGPURenderer`, worth re-checking if you use `View`)
- [#2603 Remaining Components for WebGPU migration](https://github.com/pmndrs/drei/issues/2603) — closed
- [#2666 Sparkle Improvements](https://github.com/pmndrs/drei/issues/2666) — closed

**Practical takeaway for this project:** treat drei v11 alpha as usable but moving — install `@react-three/drei@alpha`, import from `/webgpu` explicitly for WebGPU scenes, and expect some staging/shader helpers (reflector, spotlight volumetrics, accumulative shadows, split-depth) to still be WebGL-only or missing on the WebGPU path. `/legacy` remains available if a specific port needs a not-yet-migrated helper.

---

## 2. `pmndrs/examples` repo — structure & build

Repo: https://github.com/pmndrs/examples ("🍱 A monorepo holding pmndrs demos", 68 stars, last push 2026-04-08).

**Important distinction:** this is *not* a port of the official three.js examples — it's a curated showcase of community/original R3F demos (158 demos at research time: `aquarium`, `arkanoid`, `caustics`, `csg-house`, `shoe-configurator`, etc.), many originally sourced from CodeSandbox community submissions. It predates the WebGPU push: the `basic-demo` demo's `package.json` still pins `@react-three/fiber@^8.17.5`, `@react-three/drei@^9.109.5`, `three@^0.165.0` — i.e. **the repo has not been migrated to R3F v9/v10 or WebGPU.** Useful as a structural precedent, not as a source of current-gen code.

### Monorepo shape (pnpm + turborepo)

```
apps/website        # Next.js 14 site (the demo gallery / docs site)
packages/e2e         # shared build tooling + Playwright screenshot testing
demos/<slug>/        # one folder per demo, each a self-contained Vite+React app
bin/depcheck.mjs
pnpm-workspace.yaml   # packages: apps/*, demos/*, packages/*
turbo.json
```

- `pnpm-workspace.yaml`: workspaces are `apps/*`, `demos/*`, `packages/*`.
- Each demo is its own package (`@demo/<slug>`), with its own `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/`, and a `thumbnail.webp` for gallery display. Demos declare their own three/fiber/drei version ranges independently.
- `apps/website` (Next.js) depends on **every** demo package via `workspace:*` (one `@demo/<slug>` entry per demo in its `package.json` dependencies) — i.e. the gallery site directly imports/embeds each demo app rather than iframing external builds.
- README documents a `degit`-based scaffold flow: `npx degit pmndrs/examples/demos/basic-demo myproject` to start a new demo from a template.

### Build pipeline (from root `package.json` + `turbo.json` + README)

1. `pnpm build` → `turbo build3`, which depends on `^build2` — this Vite-builds every `demos/*` package with a `--base` set to `${BASE_PATH}/${app_name}` and a custom Vite config.
2. That custom Vite config lives in `packages/e2e` and applies a `monkey()` plugin that:
   - injects a `deterministic` script (`packages/e2e/src/deterministic.js`) into each demo's `src/index.jsx` (presumably to freeze time/randomness for consistent screenshots),
   - monkeypatches `<Canvas>` with a `CheesyCanvas` wrapper (`packages/e2e/src/CheesyCanvas.jsx`) to prep the scene for Playwright screenshots.
3. `apps/website` (Next.js) is then built (`website#build3`), and results are copied into a top-level `out/` folder via `out.sh` for static hosting (consistent with GitHub Pages deployment).
4. `pnpm test` runs Playwright against `packages/e2e/snapshot.test.js`, doing visual regression against`packages/e2e/snapshot.test.js-snapshots/**`, using the pinned Docker image `mcr.microsoft.com/playwright:v1.45.3-jammy` for reproducible snapshots.

**Relevant precedent for this project:** the "one self-contained Vite app per example + shared harness package for build/test orchestration + a Next.js site that imports each as a workspace package for the gallery" pattern is directly reusable. The screenshot-determinism trick (monkeypatch Canvas, inject a script to fix time/seed) is a good pattern to steal for automated thumbnail generation / visual regression across WebGPU ports.

---

## 3. Leva — version & maintenance status

- Latest npm version: **0.10.1**, published 2025-10-31 (dist-tags: `latest: 0.10.1`, `beta: 0.1.0-beta.0` — the `beta` tag is stale/unrelated, pre-1.0 numbering artifact, not a "v2 beta").
- Repo (https://github.com/pmndrs/leva): `pushed_at: 2025-11-09`, **125 open issues**, not archived.
- No release since 0.10.1 (Oct 2025); 0.10.0 and the `@leva-ui/plugin-*` packages (spring/plot/dates/bezier) were all bumped together on 2025-01-22, then 0.10.1 followed ~9 months later.
- **No public evidence of an announced rewrite or v2.** Searched GitHub issues/discussions for "rewrite" and "v2" — nothing indicating a planned architectural overhaul; open discussions are all routine usage questions (theming, custom plugins, controlled state, joystick3d feature requests). No WebGPU-specific issues found in the repo either — Leva itself doesn't render into the WebGL/WebGPU canvas (it's a DOM-based control panel), so it isn't blocked by the WebGPU transition the way drei/fiber are.

**Practical takeaway:** treat Leva as feature-complete/low-activity but not abandoned — fine to depend on directly. No rewrite to wait for.

---

## 4. Other WebGPU-era pmndrs tooling

### `@react-three/postprocessing` — stalled, effectively superseded

- npm latest: **3.0.4**, published 2025-02-20 — no release in ~17 months.
- Repo pushed_at shows recent activity (2026-07-25) but that's misleading: `git log` shows **no merged commits since the 3.0.4 release commit** (2025-02-20). There are 13 open PRs, several from 2025 (oldest open feature PR, HBAO+SSGI+TRAA+MotionBlur, dates to 2023), none merged.
- No WebGPU tracking issue exists in that repo at all (searched, zero results) — unlike drei, which has an extensive, active WebGPU migration project.
- **Why:** this package wraps the WebGL-only `postprocessing` npm library (vanruesc) via `EffectComposer`. React-three-fiber v10 ships its **own native WebGPU postprocessing** instead of porting this wrapper: `useRenderPipeline` (from `@react-three/fiber/webgpu`) gives declarative access to `THREE.PostProcessing`/`RenderPipeline` with TSL effect nodes (`bloom`, `motionBlur`, MRT via `mrt()`), directly in fiber core. See `docs/webgpu/render-pipeline.mdx` on the `v10` branch of `pmndrs/react-three-fiber`. For this project, WebGPU postprocessing should go through `useRenderPipeline`/TSL, not `@react-three/postprocessing`.

### `@react-three/test-renderer`

- Tracks fiber's versioning; alongside fiber's `10.0.0-alpha.1`/`alpha.2` there's a corresponding `10.0.0-alpha.2` of test-renderer, so it's being kept in sync with the v10/WebGPU work rather than left behind.

### Inspector / editor situation

- **No official "pmndrs inspector" package** exists inside drei or fiber core (searched drei's docs index and fiber's issues/code — nothing).
- **Triplex** (https://github.com/pmndrs/triplex, 1,289 stars) is the closest thing to an official visual editor/inspector — "the open source visual workspace for React / Three Fiber," originally built by Douges and now under the pmndrs org. Latest release **v0.72.5** (2026-01-25). It is actively being adapted for the v10/WebGPU line — GitHub Actions show a `v10-webgpu` workflow and an open PR (#397) doing this work, as of research date.
- Third-party WebGPU inspector demos exist too (e.g. a "ThreeJS WebGPU Inspector in React-Three-Fiber" community demo found via search: https://faraz-portfolio.github.io/demo-2026-r3f-inspector/) but nothing pmndrs-official beyond Triplex.

---

## 5. How threejs.org/examples works (mechanics worth copying)

- **`examples/files.json`** (https://github.com/mrdoob/three.js/blob/dev/examples/files.json) is the master index: a flat JSON object keyed by category (`webgl`, `webgpu`, `misc`, `games`, `physics`, ...) whose values are arrays of example ids (e.g. `"webgl_animation_keyframes"`, `"webgpu_backdrop"`). This drives both the gallery grid and routing.
- **`examples/tags.json`** maps example id → array of free-text search tags (e.g. `"physics_rapier_instancing": ["community"]`), powering the site's search/filter UI.
- Each example is a **fully self-contained static HTML file** at `examples/<id>.html` — no build step, no bundler. WebGPU examples use an **import map** pointing bare `three`/`three/webgpu` specifiers straight at `../build/three.webgpu.js` and `three/tsl` at `../build/three.tsl.js`, with `three/addons/` mapped to `./jsm/`. Example confirmed via `webgpu_backdrop.html`:
  ```html
  <script type="importmap">
  { "imports": {
      "three": "../build/three.webgpu.js",
      "three/webgpu": "../build/three.webgpu.js",
      "three/tsl": "../build/three.tsl.js",
      "three/addons/": "./jsm/"
  }}
  </script>
  ```
- Standard per-example `<head>` metadata: `<title>three.js - WebGPU - Backdrop</title>`, `og:title`, `og:image` pointing at a pre-rendered `examples/screenshots/<id>.jpg`, and a shared `example.css`. There's a consistent `#info` div with title + one-line description overlay.
- No per-example iframe wrapper at the HTML level — each example *is* a standalone page; the gallery/listing page presumably iframes these standalone pages in a grid (consistent with `files.json`/`tags.json` driving a listing UI that embeds each URL). Screenshots are pre-generated static JPGs referenced by convention (`screenshots/<id>.jpg`), not live-rendered thumbnails.

**Relevant for a "similar but better" gallery:** the files.json/tags.json + convention-based screenshot pattern is simple and effective for a large flat catalog; the self-contained-page-per-example + import-map pattern maps naturally to "one Vite/React app per port" as in pmndrs/examples (§2), just swap the plain-JS importmap approach for a bundler since R3F needs JSX/React.

---

## 6. R3F v10 — the other half of the WebGPU story (not explicitly asked for, but load-bearing context)

Drei v11 doesn't stand alone — it's paired with **react-three-fiber v10**, also alpha (npm `alpha` dist-tag `10.0.0-alpha.1`; `latest` is still **9.6.1**, published 2026-04-28). Confirmed via the `v10.0.0-alpha.1` GitHub release notes and the `v10` branch docs (`docs/migration/v10.mdx`, `docs/webgpu/*.mdx`):

- `state.gl` renamed to `state.renderer` (works with both `WebGLRenderer` and `WebGPURenderer`); `gl` still works but is deprecated.
- Three entry points, mirroring drei's: `@react-three/fiber` (default, WebGL today but WebGPU-ready), `@react-three/fiber/legacy` (WebGL-only, no warnings), `@react-three/fiber/webgpu` (WebGPU + TSL hooks, auto-`extend()`s the WebGPU node-material namespace).
- New WebGPU/TSL-specific hooks only exported from `/webgpu`: `useUniforms`, `useNodes`, `useLocalNodes`, `useRenderPipeline`, `useBuffers`, `useGPUStorage`.
- Enabling WebGPU is a one-line opt-in: `<Canvas renderer>` (no manual renderer construction needed).
- A new frame-loop scheduler with named phases (`physics`, `update`, `render`) replaces the old numeric `priority` system; `useFrame` can now run outside `<Canvas>`.
- `state.clock` is removed in favor of `{ time, delta, elapsed }` provided directly on frame state.
- **Notable/surprising:** every commit in the v10 alpha changelog and the migration-guide docs is authored by **DennisSmolek** — same name as this session's user (`dennis@smolek.dev`). Worth a quick gut-check with the user on whether they're the R3F/drei v10/v11 maintainer, since if so they have far more authoritative context than any of this secondary research, and it reframes this whole research task as "read your own design docs."

Sources: https://github.com/pmndrs/react-three-fiber/releases/tag/v10.0.0-alpha.1, `docs/migration/v10.mdx` and `docs/webgpu/{overview,render-pipeline,tsl-hooks,compute,hmr,multi-canvas}.mdx` on the `v10` branch.

---

## 7. Precedents for agent-friendly / `llms.txt` repos

Confirmed **live** (HTTP 200) at research time:

| URL | Notes |
|---|---|
| https://threejs.org/llms.txt | Thin pointer file: `# Three.js` blurb, then links to `https://threejs.org/docs/llms.txt` (full nav) and `https://threejs.org/docs/llms-full.txt` (full inline docs incl. TSL) |
| https://docs.pmnd.rs/llms.txt | Full nav index for the pmndrs docs generator itself, **plus** advertises an MCP server at `https://docs.pmnd.rs/api/mcp` (streamable-HTTP) with a ready-to-paste MCP client config block |
| https://r3f.docs.pmnd.rs/llms.txt | 200 OK (content not fully inspected, but present) |
| https://drei.docs.pmnd.rs/llms.txt | Full flat index of every drei component/hook page (Abstractions, Cameras, Controls, Gizmos, Loaders, Misc, Modifiers, Performances, Portals, Shaders, Shapes, Staging — ~120 entries), each with a doc-site path. Also advertises an MCP SSE endpoint at `https://docs.pmnd.rs/api/sse` with client config |

**Pattern:** the whole `docs.pmnd.rs` family (drei, r3f, and presumably other pmndrs doc sites) is generated by a shared "pmndrs docs" framework (`pmndrs/docs`, referenced in the docs.pmnd.rs llms.txt itself) that emits `llms.txt` automatically for every project's doc site, **and** exposes an MCP server/SSE endpoint alongside it so agents can query docs live instead of scraping. three.js's own `llms.txt` is much thinner and simply defers to its full docs index + a `llms-full.txt` variant with everything inlined.

**Recommendation for this project:** for an agent-friendly example gallery, follow the pmndrs pattern — a compact `llms.txt` at the root listing every port with a one-line description and path, and consider a `llms-full.txt` (or per-example small doc) with inlined source for cases where an agent wants full context without crawling. An MCP server is higher-effort but is clearly the direction this whole ecosystem (pmndrs docs, presumably three.js too eventually) is heading.

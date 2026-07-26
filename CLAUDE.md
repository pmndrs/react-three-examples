# r3f-examples

R3F v10 ports of the official three.js examples — WebGPU-first, agent-friendly. Read
[docs/SPEC.md](docs/SPEC.md) (v1.0, the contract) and [docs/ROADMAP.md](docs/ROADMAP.md)
(milestones + current state) before making changes. Session-by-session state lives in
[docs/HANDOFF.md](docs/HANDOFF.md). Research reports with sources: `research/`.

> This file will slim down once `AGENTS.md` (conventions doc, an M1 deliverable) exists;
> per SPEC §6 the intended shape is AGENTS.md as source of truth + `@AGENTS.md` import here.

## Commands

- `npm run dev` — Vite dev server (port 5173)
- `npm run build` / `npx tsc --noEmit` — build / typecheck
- Examples live at `/examples/<slug>`; routes glob from `src/examples/*.tsx` and
  `src/examples/<slug>/<slug>.tsx` (folder entry must match folder name)

## Stack (July 2026 — alpha-era, versions matter)

- `@react-three/fiber` **10.0.0-alpha.3 built from the local v10 branch clone** and
  installed from `reference/react-three-fiber-10.0.0-alpha.3.tgz` (npm alpha/canary tags
  lag or are broken). Rebuild recipe: in `reference/react-three-fiber`:
  `pnpm install --no-frozen-lockfile && pnpm --filter @react-three/fiber build`, then
  `npm pack` in `packages/fiber` and `npm install` the tarball here.
- `three` 0.185.1, `@react-three/drei` 11.0.0-alpha.5, `leva`, `camera-controls` v3,
  react-router **7** (pinned via `version-7` dist-tag; npm latest is v8 — do not bump).
- TypeScript strict, Tailwind v4, single flat tsconfig.

## Critical gotchas (verified the hard way — do not rediscover)

1. **fiber dual-entry trap**: fiber's `.` and `./webgpu` entries are two separate builds
   of the same webgpu runtime. drei imports the root; app code imports `/webgpu`. Without
   the regex alias in [vite.config.ts](vite.config.ts) BOTH load → two React reconcilers →
   "Invalid hook call" crashes. Keep the alias until fiber's root entry re-exports a
   shared chunk upstream.
2. **three ≥0.183 renamed `WebGLCubeRenderTarget` → `CubeRenderTarget` in three.webgpu.**
   This broke fiber's npm canary AND drei alpha.5's /webgpu build.
   `node_modules/@react-three/drei/webgpu/index.mjs` is LOCALLY PATCHED (identifier
   rename). **Any `npm install` that reinstalls drei reverts the patch** — re-apply:
   replace all `WebGLCubeRenderTarget` with `CubeRenderTarget` in that file, then
   `rm -rf node_modules/.vite`. Goes away when Dennis publishes fresh drei alphas.
3. **Never import from `@react-three/drei` root** in webgpu code — the root export is
   legacy-flavored (plain `three` + legacy fiber). Use `/webgpu` or `/core` only.
4. **camera-controls v3 + StrictMode**: never `dispose()` a `useMemo`'d instance in an
   effect cleanup (StrictMode's simulated unmount kills the memoized instance for good).
   Use the connect/disconnect symmetric-effect pattern in
   [src/utils/CameraControls.tsx](src/utils/CameraControls.tsx). v3 `setTarget` returns a
   Promise; constructor takes `(camera, domElement?)`.
5. **leva's default panel overlays center-frame subjects** at small viewports — for
   in-browser verification, collapse it (chevron top-left of panel) before screenshots.

## v10 API notes (confirmed against the built package, not docs)

- `import { Canvas } from '@react-three/fiber/webgpu'`; `<Canvas renderer shadows background="#a0a0a0">`
- `background` accepts color/URL/preset/expanded object; `shadows` accepts variant strings
- RootState: `renderer` (use it; `gl` is a deprecated alias), has an Inspector slot
- `useFrame` callback is still `(state, delta)`; scheduler is phase-based under the hood
- v10 docs exist only as `.mdx` in `reference/react-three-fiber/docs/` (webgpu/, migration/)
  — the public docs site 404s on v10 pages

## Example conventions (seeded by example #1 — formalize into AGENTS.md)

- Example owns its `<Canvas>`; scene self-contained inside (no extracted `<Scene>`)
- Header comment block: DEMONSTRATES / DIVERGENCE sections, original example URL
- `<DemoHelpers>` (src/utils/DemoHelpers.tsx) = baseline furniture: grid + CameraControls
  + future inspector slot; visible, toggleable via props
- Controls via leva `useControls`; imperative escape hatches (mixer weights) are a feature
  to showcase, not hide
- Assets hotlinked from jsdelivr pinned to the three.js release (e.g.
  `cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/Soldier.glb`)
- Register new examples in `src/examples.json` (slug/title/tags → sidebar + future manifest)

## Reference clones (gitignored, in `reference/`)

three.js sparse (src + example sources + files.json/tags.json, no heavy assets),
react-three-fiber v10 branch (+ unpublished docs), drei master (stale ≈ alpha.5).

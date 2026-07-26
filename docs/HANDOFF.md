# Session Handoff — 2026-07-27 (overnight autonomous session)

Read AGENTS.md first (conventions + stack pins + gotchas — now the source of truth),
then this for where-we-are. SPEC/ROADMAP unchanged in substance; ROADMAP M1 checklist
is current.

## Where we are: M1 is functionally COMPLETE, pending Dennis sign-off

All M1 infrastructure landed this session, and both gate ports ran clean:

- **AGENTS.md v0.3** — two-layer conventions doc + changelog; CLAUDE.md is now a thin
  `@AGENTS.md` import. Amended twice from real gate-port feedback (the co-evolution
  loop is running and measurably works: port #3 cost ~35% less than #2 against the
  amended doc).
- **Conventions lint** — flat ESLint config: tseslint + react-hooks +
  `@react-three/eslint-plugin` (npm alpha) + local `corpus` plugin
  (eslint-rules/require-header-block.js, negative-tested); fiber/drei entry-point
  import bans via no-restricted-imports. NOTE: `typescript` pinned ^6 — tseslint has
  no TS7 support yet (typescript-eslint#10940).
- **Readiness signal** — `window.__exampleReady` (ReadinessSignal inside DemoHelpers:
  loaders settled + 30 clean frames).
- **Playwright smoke tier** — per-manifest test: readiness + real-webgpu-context +
  non-black-pixel + console-error capture. 4/4 green locally (~6s). macOS headless
  new-headless Chromium does WebGPU on Metal fine; `.github/workflows/ci.yml` does
  headed-under-Xvfb + SwiftShader for Linux per research. **CI has never actually run
  — no git remote exists yet** (repo creation is Dennis's M0 item).
- **Contact sheet** — `pnpm contact-sheet` → screenshots/index.html (leva hidden,
  +800ms past readiness so animations clear the rest pose).
- **Gate ports #2 and #3** — `skinning-instancing` and `postprocessing-bloom-emissive`,
  each a single Sonnet agent steered ONLY by AGENTS.md, zero human code edits, all
  machine checks + Fable visual review green (instanced dancers with depth blur;
  selective MRT bloom on the helmet's emissive circuitry only).

Also this session: dev server restored (Vite dep-scan scoping + pnpm adoption +
durable `pnpm patch` for drei), Titleblock shell overlay, grid anti-shimmer tuning,
and a real bug in example #1 caught BY the contact sheet on its first run (Soldier
TPose clip was blending into the walk at weight 1 — arms-out zombie gait; now plays
Idle/Walk/Run by name; AGENTS.md rule added).

## Awaiting Dennis (M1 gate closes on this)

1. **Sign off on the two agent ports without touching their code** — that's the gate
   condition. Review `pnpm contact-sheet` output or the live routes.
2. Look-review carried items: Titleblock (bottom-left; logo slot is a placeholder),
   grid tuning verdict, DemoHelpers/CameraControls API, leva placement strategy,
   example #1 divergences.
3. **Create the GitHub repo + push** — unblocks first real CI run (watch the smoke
   job: the Xvfb/SwiftShader path is research-verified but never executed here).
4. Fresh drei/fiber alphas when ready — drei bump will error on the stale pnpm patch
   (delete `patches/` entry then), fiber tarball → published alpha, ideally drop the
   vite dual-entry alias.

## Next work (M2 prep, in rough order)

1. Fold Dennis's sign-off feedback (if any) into AGENTS.md before scaling.
2. Screenshot-regression tier (tier 2): goldens from the smoke path, changed-examples
   only; the readiness signal + contact-sheet plumbing make this mostly config.
3. Batch pipeline dry run: pick ~5 of the 77 dual-renderer list, one Workflow wave
   (port → self-verify → contact-sheet), per the ROADMAP Agent economics section.
4. Site v1 gallery work can start any time (M2 list).

## Upstream items for Dennis (all verified; details in AGENTS.md/code comments)

1. fiber packaging: `.` vs `./webgpu` duplicate-runtime trap (vite alias is our shim)
2. drei alpha vs three ≥0.183: `WebGLCubeRenderTarget` → `CubeRenderTarget` rename
   (durable pnpm patch here; fresh alpha should ship the rename)
3. drei: CameraControls not in `/core`//`/webgpu` subpaths (our wrapper now also has
   minDistance/maxDistance, added for gate port #3's need)
4. fiber npm canary broken (same rename)
5. drei Grid (TSL): thin-line shimmer under WGSL coarse `fwidth` — consider
   fwidthFine/thickness floor upstream
6. **NEW — fiber `UniformNode<T>` typing**: pins the TSL node-type param to `unknown`,
   so uniforms can't pass to TSL math expecting `Node<'float'>` under strict tsc
   without an ugly double cast; render-pipeline.mdx's own bloom example wouldn't
   compile. Both gate ports hit or dodged this — it'll bite every TSL port until
   fiber ships a typed overload.

## Key research conclusions already folded into SPEC (reports in research/)

- Scope: 221 webgpu examples on dev (~187 teaching-value); webgl-only gap = 34 unique
  non-loader + 47 loader-gallery after semantic dedup
- Agent buttons: Claude Code web URL + StackBlitz subfolder + Codespaces + Cursor;
  Codex has no URL scheme; CodeSandbox is dead (July 2026)
- CI: WebGPU works on free runners via SwiftShader BUT headless Chrome never presents
  the WebGPU canvas on Linux — headed under Xvfb (implemented in ci.yml, unproven in
  a real run)

## Session environment notes

- `.claude/launch.json` defines the `dev` server config (port 5173). A background
  `pnpm dev` from this session may still hold the port — kill/restart freely.
- The repo (AGENTS.md + docs/) is the single source of truth; external memory is
  stale relative to these docs.

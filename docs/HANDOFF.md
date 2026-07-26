# Session Handoff — 2026-07-27

Read CLAUDE.md first (stack + gotchas), then this for where-we-are and what's next.
Previous handoff (2026-07-26, GUI→IDE transfer) is superseded; its open review items
carry forward below.

## Where we are

- **Spec v1.0 final** ([SPEC.md](SPEC.md)); **M0 gate met** (WebGPU verified in-browser,
  commit `ffe89d3`); **M1 in progress**: example #1 `animation-skinning-blending`
  working (commit `c474787`).
- **This session (2026-07-27)**:
  - Fixed dead dev server: (a) Vite 8's dep scanner was crawling
    `reference/three.js/examples/*.html` → scoped via `optimizeDeps.entries` in
    vite.config.ts (CLAUDE.md gotcha #6); (b) drei `CubeRenderTarget` patch had been
    reverted by a reinstall.
  - **pnpm is now the canonical package manager** (tree was rebuilt with pnpm on
    07-26; `package-lock.json` deleted). The drei rename patch is now a durable
    `pnpm patch` (`patches/`, wired in pnpm-workspace.yaml) — reinstalls keep it;
    a drei version bump errors on the stale patch as the removal cue.
  - **Titleblock added** (logo slot / title / original-link / credits): shell-level
    overlay ([src/app/Titleblock.tsx](../src/app/Titleblock.tsx)) rendered per-route by
    App from examples.json — NOT in-canvas DemoHelpers furniture, so every port gets it
    for free with zero per-example wiring. Manifest schema grew optional
    `original` + `credits` fields; typed access centralized in
    [src/app/manifest.ts](../src/app/manifest.ts).
  - Grid aliasing triaged: fiber already defaults MSAA 4x; the shimmer is drei Grid's
    TSL port under WGSL coarse `fwidth` derivatives + fract-grid moiré at distance —
    partly upstream. Mitigated in DemoHelpers (thickness ≥1, fadeDistance 28,
    fadeStrength 1.5) — **Dennis to judge visually**.
  - ROADMAP gained an **Agent economics** section (cost-conscious subagent plan per
    milestone: machines verify, Sonnet ports, review escalates only on flags/failures).

## Awaiting Dennis review

- Titleblock look/placement (bottom-left overlay; logo is a placeholder slot)
- Grid tuning verdict + whether to file the fwidth/moiré note upstream (drei)
- Carried from 07-26: DemoHelpers API + grid-over-floor layering; CameraControls
  wrapper naming; leva placement strategy (collapsed by default? custom container?);
  example #1 divergences (sliders vs crossfade buttons, pause via timeScale)

## Immediate next steps (M1 remainder, in order)

1. **When Dennis pushes fresh alphas**: bump drei (pnpm will error on the stale patch —
   delete `patches/` entry), swap fiber tarball → published alpha, re-verify, ideally
   drop the vite dual-entry alias
2. Seed `AGENTS.md` (two layers per SPEC §7) + slim CLAUDE.md to `@AGENTS.md`
3. ESLint conventions plugin scaffold (evaluate extending fiber repo's
   `packages/eslint-plugin`)
4. Render-readiness signal in the shell (three.js `_renderFinished` pattern) — blocks
   screenshot CI
5. Playwright harness per research/webgpu-ci-github.md (headed Chromium under Xvfb)
6. **M1 gate**: Sonnet/Opus port examples #2–3 against the conventions doc, no human
   code edits; candidates: `webgpu_skinning_instancing`, one postprocessing example

## Upstream items for Dennis (details in CLAUDE.md)

1. fiber packaging: `.` vs `./webgpu` duplicate-runtime trap (vite alias is our shim)
2. drei alpha vs three ≥0.183: `WebGLCubeRenderTarget` → `CubeRenderTarget` (now a
   durable pnpm patch here; fresh drei alpha should ship the rename)
3. drei: CameraControls not yet sorted into `/core` / `/webgpu` subpath exports
4. fiber npm canary broken (same rename)
5. NEW: drei Grid (TSL) aliasing under WGSL coarse `fwidth` — thin lines shimmer worse
   than the GLSL original, notably on Metal; consider fwidthFine or thickness floor

## Key research conclusions already folded into SPEC (reports in research/)

- Scope: 221 webgpu examples on dev (~187 teaching-value); webgl-only gap = 34 unique
  non-loader + 47 loader-gallery after semantic dedup
- Agent buttons: Claude Code web URL + StackBlitz subfolder + Codespaces + Cursor;
  Codex has no URL scheme; CodeSandbox is dead (July 2026)
- Agent interface: AGENTS.md + examples.json manifest is the backbone; llms.txt is
  decorative; defer any bespoke MCP server
- CI: free GitHub runners work via SwiftShader BUT headless Chrome never presents the
  WebGPU canvas — must run headed under Xvfb; three.js CI is the prior art

## Session environment notes

- `.claude/launch.json` defines the `dev` server config (port 5173)
- The repo (CLAUDE.md + docs/) is the single source of truth; treat external memory
  as stale relative to these docs

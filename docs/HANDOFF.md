# Session Handoff — 2026-07-26

State transfer from the spec/bootstrap session (Claude GUI) to IDE-based work.
Read CLAUDE.md first (stack + gotchas), then this for where-we-are and what's next.

## Where we are

- **Spec v1.0 final** ([SPEC.md](SPEC.md)) — all decisions locked with Dennis over 3 rounds.
- **M0 complete, gate verified**: Vite/react-router/Tailwind scaffold, glob-routed
  examples, WebGPU rendering confirmed in-browser (real `webgpu` context, not the
  WebGL2 fallback). Commit `ffe89d3`.
- **M1 started**: example #1 `animation-skinning-blending` built and verified working
  (walking Soldier, weight-blending leva sliders, shadows, DemoHelpers grid, orbit
  controls). Commit `c474787`. ~477 lines of vanilla JS → ~110 lines TSX.

## Awaiting Dennis review (the "build #1 together" loop)

- `<DemoHelpers>` API + look: grid-over-solid-floor layering, grid colors/density
- `src/utils/CameraControls.tsx` (our drei-gap wrapper) — API/naming
- Leva placement strategy for the gallery (default panel hid the soldier at small
  viewports — mount collapsed? custom container in layout?)
- Example #1 divergences (crossfade UI → direct sliders; pause via `mixer.timeScale=0`)
- ROADMAP M0 note: AGENTS.md + eslint-plugin scaffolds were deliberately deferred into
  M1 to be seeded from example #1

## Immediate next steps (M1 remainder, in order)

1. Dennis reviews/tunes example #1 + DemoHelpers in IDE
2. **When Dennis pushes fresh alphas (said: "tomorrow")**: swap fiber tarball → published
   alpha, reinstall drei (drops the local patch — see CLAUDE.md gotcha #2), re-verify,
   ideally drop the vite alias if fiber packaging is fixed
3. Seed conventions doc: `AGENTS.md` (two layers per SPEC §7) + slim `CLAUDE.md` to import it
4. ESLint conventions plugin scaffold (note: the fiber v10 repo has its own
   `packages/eslint-plugin` — evaluate extending it instead of starting from zero)
5. Render-readiness signal in the shell (three.js `_renderFinished` pattern) — needed
   before any screenshot CI
6. Playwright harness per research/webgpu-ci-github.md: headed-Chromium-under-Xvfb on
   GitHub Actions; smoke tier first
7. **M1 gate**: have Sonnet/Opus port examples #2–3 against the conventions doc with no
   human code edits; candidates: `webgpu_skinning_instancing`, something postprocessing-
   flavored to exercise `useRenderPipeline`

## Upstream items for Dennis (all verified, details in CLAUDE.md)

1. fiber packaging: `.` vs `./webgpu` duplicate-runtime trap (vite alias is our shim)
2. drei alpha vs three ≥0.183: `WebGLCubeRenderTarget` → `CubeRenderTarget` rename
   breaks /webgpu build (locally patched in node_modules — not durable)
3. drei: CameraControls not yet sorted into `/core` / `/webgpu` subpath exports
4. fiber npm canary broken (same rename); a task chip for the v10-branch fix was filed
   in the previous session

## Key research conclusions already folded into SPEC (reports in research/)

- Scope: 221 webgpu examples on dev (~187 teaching-value); webgl-only "gap" shrank to
  34 unique non-loader + 47 loader-gallery after semantic dedup
- Agent buttons: Claude Code web URL (`claude.ai/code?prompt=…&repositories=…`) +
  StackBlitz subfolder + Codespaces + Cursor (prompt-only); Codex has no URL scheme;
  CodeSandbox is dead (imports shut down July 2026)
- Agent interface: AGENTS.md + examples.json manifest is the proven backbone; llms.txt
  is decorative (evidence: ~97% never fetched); defer any bespoke MCP server
- CI: free GitHub runners work via SwiftShader BUT headless Chrome never presents the
  WebGPU canvas (black screenshots) — must run headed under Xvfb; three.js's own CI is
  the working prior art (sharding, pixelmatch thresholds, readiness polling)

## Session environment notes

- `.claude/launch.json` defines the `dev` server config (port 5173)
- Auto-memory from the GUI sessions was mirrored into CLAUDE.md — the repo is now the
  single source of truth; treat any external memory as stale relative to these docs

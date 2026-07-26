# Roadmap / Launch Checklist

> Companion to SPEC.md. Milestones are gates, not dates — each one has an explicit
> "done when" so agent batches don't run ahead of an unvalidated foundation.

## M0 — Foundations
- [x] Pick name: **r3f-examples** (may fold into pmndrs/examples someday)
- [ ] Create `pmndrs/r3f-examples` repo (Dennis); MIT license; branch protection
- [x] SPEC v1.0 finalized (2026-07-26)
- [ ] Acquire resources locally: three.js shallow/sparse (`examples/` + `src/`, pinned),
      r3f `v10` branch incl. `.mdx` docs, drei `v11`, pmndrs/examples `packages/e2e`
      (read the Canvas-monkeypatch Vite plugin)
- [ ] Scaffold: Vite + react-router + TS strict + Tailwind/shadcn; glob-routed examples
- [ ] `examples.json` manifest schema; `AGENTS.md` skeleton; `CLAUDE.md` (`@AGENTS.md`)
- [ ] ESLint base + custom conventions-plugin scaffold (rules accrete from M1 on)

**Done when:** repo builds, one placeholder route renders on WebGPU locally.

## M1 — Golden path (built together, Dennis + Fable)
- [ ] First example built pair-style → establishes the baseline: `<DemoHelpers>`
      (infinite grid, CameraControls, Inspector/perf slot, toggleable), ACES tonemap,
      header-comment schema, metadata shape
- [ ] Conventions doc v1 seeded from that example (two-layer structure + changelog)
- [ ] Render-readiness signal in the shell (three.js `_renderFinished` pattern)
- [ ] Playwright harness: smoke test + screenshot capture, headed-Chromium-under-Xvfb
      GitHub Actions workflow, sharding-ready
- [ ] Contact-sheet generator for batch visual review
- [ ] Examples #2–3 ported BY AGENTS (Sonnet/Opus) against the conventions doc — this
      validates that the doc actually steers agents before we scale it

**Done when:** an agent-ported example passes lint/build/smoke/screenshot and Dennis
signs off on it without needing to touch the code.

## M2 — Pilot batch: the 77 dual-renderer examples
- [ ] Batch pipeline live (Workflow orchestration): port → self-verify → screenshot →
      Fable review → contact-sheet to Dennis
- [ ] Co-evolution loop running: divergences → doc amendments or example fixes; lint
      rules extracted from repeated review notes
- [ ] Site v1: gallery grid, searchable/filterable sidebar (tags from manifest),
      per-example page (demo, code view, button row: GitHub / Claude Code / StackBlitz /
      Codespaces / Cursor), original-example link
- [ ] GH Pages deploy pipeline (static export)

**Done when:** 77 ports merged, site deployed to Pages, CI green on tiers 1–2.

## M3 — Full WebGPU set (~144 webgpu-only: compute, TSL, MRT…)
- [ ] Stricter review tier for thin-training-data territory (TSL/compute)
- [ ] `utils/` drei-gap components accumulate; each ships with an upstream brief
      (candidate drei component spec)
- [ ] Blocked/divergent pipeline states tracked and burned down
- [ ] Nightly full-corpus screenshot run (CI tier 3) + manual GPU-runner dispatch (tier 4)

**Done when:** 100% of teaching-value `webgpu_*` set merged (stress tests excluded).

## M4 — Launch
- [ ] Patterns track (~12–20 app-scale examples); gallery site documented as meta-example
- [ ] `AGENTS.md` finalized; `examples.json` complete; agent launch-task page + top-level
      HTML pointer on every example page; in-repo Claude Code skill; llms.txt generated
- [ ] Thumbnails (+ hover videos?) for gallery; OG/meta tags; custom domain
- [ ] Launch review pass: full nightly green, spot-check on real GPU, link check
- [ ] Announcement coordinated with r3f v10 release timing (blog/tweet thread/demos)

**Done when:** public URL live, announcement out.

## Post-launch (standing)
- Monthly: re-diff three.js `files.json` → port new webgpu examples; three version bump PR
- Drei gap-closure watch: when drei ships a stubbed component, migrate examples, retire util
- Phase 2 curation: the 34 unique webgl examples + loader-gallery subset decision
- Later phases: WebXR (@react-three/xr), webaudio, TSL editor tooling

## Open decisions
- Repo name (suggestions with Dennis)
- Loader gallery scope (all 47 formats vs representative subset) — decide at Phase 2
- Asset hosting revisit when swapping in alternate models (then self-host)

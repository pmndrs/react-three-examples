# Roadmap / Launch Checklist

> Companion to SPEC.md. Milestones are gates, not dates — each one has an explicit
> "done when" so agent batches don't run ahead of an unvalidated foundation.

## M0 — Foundations
- [x] Pick name: **r3f-examples** (may fold into pmndrs/examples someday)
- [ ] Create `pmndrs/r3f-examples` repo (Dennis); MIT license; branch protection
- [x] SPEC v1.0 finalized (2026-07-26)
- [x] Acquire resources locally: three.js sparse (26M, src + example sources, no assets),
      r3f `v10` branch incl. `.mdx` docs (docs/webgpu, docs/migration), drei (v11 work
      lives on `master` — no separate branch). TODO: pmndrs/examples `packages/e2e`
      (read the Canvas-monkeypatch Vite plugin)
- [x] Scaffold: Vite 8 + react-router 7 + TS strict + Tailwind 4; glob-routed examples;
      fiber pinned to `10.0.0-alpha.2` (NOT canary — canary is broken against three
      ≥0.183: imports removed `WebGLCubeRenderTarget` from three.webgpu; upstream fix
      needed), three 0.185.1 + @types/three
- [x] `examples.json` manifest (minimal — schema hardens in M1)
- [ ] `AGENTS.md` skeleton; `CLAUDE.md` (`@AGENTS.md`)
- [ ] ESLint base + custom conventions-plugin scaffold (rules accrete from M1 on)

**Done when:** repo builds, one placeholder route renders on WebGPU locally.
**GATE MET 2026-07-26**: verified in a real browser — canvas context is `webgpu` (real
adapter, not WebGL2 fallback), console clean. AGENTS.md + eslint scaffolds folded into M1
since they're seeded by example #1 anyway.

## M1 — Golden path (built together, Dennis + Fable)
- [x] First example built pair-style → establishes the baseline: `<DemoHelpers>`
      (infinite grid, CameraControls, Inspector/perf slot, toggleable), ACES tonemap,
      header-comment schema, metadata shape (2026-07-26; Dennis look-review pending;
      TPose-blend bug found+fixed by contact sheet 07-27)
- [x] Conventions doc v1 seeded from that example (AGENTS.md, two layers + changelog;
      CLAUDE.md slimmed to @AGENTS.md) (2026-07-27)
- [x] Render-readiness signal (`window.__exampleReady` via ReadinessSignal in
      DemoHelpers: loaders settled + 30 clean frames) (2026-07-27)
- [x] Playwright harness: smoke tier live (readiness + webgpu-context + non-black
      pixel check), ci.yml headed-under-Xvfb + SwiftShader, sharding-ready
      (2026-07-27 — green locally; first real GH Actions run still pending)
- [x] Contact-sheet generator (`pnpm contact-sheet` → screenshots/index.html)
      (2026-07-27)
- [x] Examples #2–3 ported BY AGENTS (Sonnet/Opus) against the conventions doc — this
      validates that the doc actually steers agents before we scale it
      (#2 `skinning-instancing` + #3 `postprocessing-bloom-emissive`, both single-Sonnet
      zero-human-edit ports, 2026-07-27; #3 ran ~35% cheaper against the amended doc —
      the co-evolution loop measurably works)

**Gate status 2026-07-27**: machine checks + Fable visual review green on both agent
ports. Remaining for gate: **Dennis sign-off without touching the code.**

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

## Agent economics (how model budget gets spent — keep it boring)

Principle: **the cheapest verifier wins.** Machines (tsc/lint/build/Playwright
screenshots) verify; models port and review. Escalate model capability only when the
tier below demonstrably fails, and record the escalation.

- **M1 (now)**: pair-style inline work (Fable in the IDE), no orchestration. Subagents
  only for one-off research/scouting. The gate ports (#2–3) are ONE Sonnet agent each,
  steered by the conventions doc alone — if a port fails, fix the doc, not the port;
  that's the product being tested.
- **M2 (batch of 77)**: Workflow waves of ~10 ports, one Sonnet agent per port +
  machine checks. No per-port model review — Fable reviews the contact sheet and
  divergence flags only. Between waves, fold repeated review notes into AGENTS.md/lint
  rules so each wave is cheaper than the last. No wave 2 until wave 1's lessons land.
- **M3 (TSL/compute)**: same pipeline; only examples flagged thin-training-data
  (TSL, compute, MRT) get an added Opus/Fable review pass. Porter stays Sonnet-first;
  escalate a specific example only after 2 failed attempts.
- **Standing rules**: never buy a second model pass where a lint rule or screenshot
  diff catches the same class of error; each batch PR notes agents run/retries/
  escalations so cost drift is visible; adversarial multi-agent review is reserved for
  the launch pass (M4), not routine ports.

## Post-launch (standing)
- Monthly: re-diff three.js `files.json` → port new webgpu examples; three version bump PR
- Drei gap-closure watch: when drei ships a stubbed component, migrate examples, retire util
- Phase 2 curation: the 34 unique webgl examples + loader-gallery subset decision
- Later phases: WebXR (@react-three/xr), webaudio, TSL editor tooling

## Open decisions
- Repo name (suggestions with Dennis)
- Loader gallery scope (all 47 formats vs representative subset) — decide at Phase 2
- Asset hosting revisit when swapping in alternate models (then self-host)

# Roadmap — the Road to 1.0

> Companion to [SPEC.md](SPEC.md). Milestones are gates, not dates — each has an explicit
> "done when". **Rewritten 2026-09-03** after an audit found the previous version claiming
> M2/M3 were open while the porting was finished, and nothing said the remote was seven
> weeks behind. The audit itself is the first section, because "is it done?" has a
> different answer depending on whether you mean the working tree or GitHub.

## Where the phases live

Two vocabularies are in use and they are not the same axis:

- **Phases** (SPEC §4) are _what gets ported_: **Phase 1** = the `webgpu_*` set;
  **Patterns track** = 12–20 app-scale examples; **Phase 2** = curated webgl-only
  examples + the loader gallery; **Final phase** = WebXR, webaudio, TSL tooling.
- **Milestones** (this file) are _what ships_: M0 foundations → M1 golden path → M2
  pilot batch + site v1 → M3 full WebGPU set → M4 launch.

"Phase 1 complete" means the porting content of M2+M3 is done. It does not mean M2 or M3
are done — both carry site, CI and deploy items that are not.

---

## Audit — state on 2026-09-03

### The one thing that matters most

**`origin/main` is at `07c34b6` (2026-07-28, 131 examples). Local `main` is 17 commits
ahead and has never been pushed.** Everything since July 28 — the corpus-wide restyle,
prettier, the site shell (home, grouped sidebar, search, action bar), and all three
porting waves (131 → 199) — exists on one machine. Nightly CI has been running against
the July corpus and failing every night since at least 2026-08-14 on one known flake
(B28, `PMREM.cubeUv`), so it currently carries no signal. Last green run of any kind:
2026-07-28.

Pushing is Dennis's call (it is outward-facing), but nothing below it is real until it
happens.

### Milestone audit

| milestone | claimed | actual                                                                                                                                                                                                                                                                                                                                                                        |
| --------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M0**    | done    | Done except: **no `LICENSE` file** (repo shows `licenseInfo: null`), no branch protection recorded. `package.json` is `0.0.0`.                                                                                                                                                                                                                                                |
| **M1**    | done    | Done. Dennis's sign-off happened in practice (he reviewed the first 16 by hand and drove the v1.0 style rewrite).                                                                                                                                                                                                                                                             |
| **M2**    | open    | **Ports: done** (the 77 dual-renderer examples are in). **Site v1: ~70%** — home, category grouping, substring search, 6-button action row shipped; **no tag filter, no code view on the example page, no thumbnails**. **Pages deploy: not started** — no Pages site, no `base` in vite config, no deploy job. **CI tiers 1–2: tier 1 exists but is red; tier 2 not built.** |
| **M3**    | open    | **Ports: done** — 197 of 214 r185 `webgpu_*` examples; 10 excluded by SPEC §4, 7 deferred by SPEC §3. **The rest of M3 is not**: no nightly screenshot tier, no real-GPU dispatch. `utils/` has 5 pieces with upstream briefs (41 in UPSTREAM.md).                                                                                                                            |
| **M4**    | open    | Nothing started: no Patterns track (0 of 12–20), no for-agents page, no `llms.txt`, no in-repo skill, no thumbnails, no OG/meta tags, no domain.                                                                                                                                                                                                                              |

### Corpus health (the part that IS done, measured)

- **199 examples** in the manifest, fully accounted for: **197** r185 `webgpu_*` ports +
  `hello-webgpu` (ours, no original) + `animation-skinning-blending` (a **webgl**
  original — the M1 golden-path example, effectively a Phase 2 port shipped early). Both
  metrics vs the originals: **−12.6% code lines, −22.7% non-whitespace chars**; 191 of
  196 smaller by content.
- Local verification on Metal: tsc 0, lint 0 (eslint + prettier + 3 corpus rules at
  error level), build clean, smoke **198/199** (the 1 is B28), animates green.
- **Known debts, all tracked, none hidden**:
  - [REVIEW-QUEUE.md](REVIEW-QUEUE.md): **2 🔴 + 10 🟡** waiting on Dennis.
  - [UPSTREAM.md](UPSTREAM.md): **41 briefs** (B1–B41). Open and _load-bearing_: **B28**
    (`PMREM.cubeUv` destroyed-texture flake — fails `tsl-wood` ~1 in 5 and turns every
    CI run red), **B41** (`Lighting.getNode` module-level cache — the silent-substitution
    class; only `lights-clustered` is known affected, others unaudited).
  - **4 `ciSkip`** examples that cannot reach readiness on SwiftShader
    (`geometry-loft`, `volume-fire`, `custom-fog`, `compute-birds`) — pass on Metal.
  - **54 examples have no `credits`** in the manifest (the titleblock renders nothing for
    them). Mostly examples whose original credits nobody; needs a pass to confirm.
  - Deferred cleanups: `tsl-vfx-flames`/`-tornado` still build materials imperatively;
    `volume-caustics` `useUniforms`-after-suspend ordering wants an audit; tag vocabulary
    grew to ~170 with many singletons.

---

## Road to 1.0

**Definition of 1.0**: the Phase 1 corpus, publicly deployed, with CI that means
something, the site's SPEC §9 feature list complete, and the agent-facing surface from
SPEC §6 in place. **Not** in 1.0: the Patterns track, Phase 2, the final phase — see
"Deliberately after 1.0" and the decision it needs.

Ordered by dependency. Each gate is cheap to check.

### R1 — Make the repo real again

- [ ] **Push `main`** (Dennis). 17 commits, 68 examples, the whole restyle.
- [ ] **`LICENSE` (MIT)** — M0 said it, it never landed. Blocks any public link.
- [ ] **Make nightly green so it can go red meaningfully.** B28 is the whole reason it's
      red. Two acceptable outcomes: root-cause B28 (it is a three/drei `<Environment>`
      teardown race — 27 examples can hit it), or teach the smoke tier to retry the
      _specific_ `PMREM.cubeUv` signature once and report it as a flake, not a failure.
      Root cause is better; the retry is fine for 1.0 if the brief stays open.
- [ ] Nightly then runs the **199-example corpus** (it has only ever seen 131). Expect
      new SwiftShader stalls in the wave-3 compute examples; `ciSkip` them with a reason,
      as the four existing ones are.

**Done when:** `origin/main` == local, nightly is green two nights running on the full
corpus, LICENSE present.

### R2 — Dennis's review gate (the thing REVIEW-QUEUE exists for)

- [ ] Resolve the **2 🔴**: `compute-reduce`'s dropped timing readout (does an example
      ever get to render its own DOM?) and the rule-4 slider clause.
- [ ] Skim the **10 🟡**. Most are yes/no.
- [ ] Contact-sheet pass over all 199 (`pnpm contact-sheet`). The wave-3 ports were
      screenshot-reviewed by agents, and I spot-checked ~6; Dennis has not seen them.

**Done when:** REVIEW-QUEUE has no 🔴 and every 🟡 has a decision row.

### R3 — Corpus polish

- [ ] **Credits pass** for the 54 blank entries — confirm "original credits nobody" vs
      "we dropped it".
- [ ] **B41 audit**: grep every example that assigns onto `renderer.*` from a Canvas
      child and ask whether anything reads it before the first render list. The
      `lights-clustered` failure was the loud case of a silent class.
- [ ] Deferred cleanups above (flames/tornado, volume-caustics, tag vocabulary).
- [ ] Decide the 4 `ciSkip`s stay skipped (they are compute-bound; SwiftShader is not a
      fair oracle) — record it as a decision, not a TODO.

**Done when:** zero blank credits, B41 audit written up, tag count has a rationale.

### R4 — Site v1 complete (the open half of M2)

SPEC §9 promises: gallery + sidebar with **search and tag filters**; **thumbnail** per
example; per-example page with **live demo, code view, links**. Shipped: search, links,
live demo. Missing:

- [ ] **Tag filter** in the sidebar (the manifest already carries normalised tags).
- [ ] **Code view** on the example page — the file is already known via
      `exampleFilePaths`; a read-only pane with copy is enough (the action row covers
      "open in editor").
- [ ] **Thumbnails**: `screenshots/` is gitignored and not served. Either commit a
      `public/thumbs/` set generated by `pnpm contact-sheet` at a fixed size, or generate
      at build in CI. `Home.tsx` already has the `onError` gradient fallback wired.
- [ ] **OG/meta tags** on `index.html` + per-route title.

**Done when:** every SPEC §9 noun exists on the site.

### R5 — Deploy

- [ ] GitHub Pages: `base` in `vite.config.ts`, a deploy job on push to `main`, SPA
      fallback (`404.html` copy of `index.html` — react-router needs it on Pages).
- [ ] Assets stay hotlinked from jsdelivr@r185 (SPEC §14) — but the CDN 403'd us once
      under load. Note the risk; no action for 1.0.
- [ ] `package.json` version `1.0.0` at tag time; a `CHANGELOG.md` seeded from the
      HANDOFF wave sections.

**Done when:** a public URL renders the corpus on WebGPU, from a tagged commit.

### R6 — Agent-facing surface (SPEC §6, the M4 half that isn't Patterns)

- [ ] **For-agents page** with the extraction story (where the file lives, the starter
      shell, how to wire deps) + the top-level HTML pointer on every example page.
- [ ] **In-repo Claude Code skill** — "lift this example into my project".
- [ ] `llms.txt` generated from the manifest (cheap, decorative — SPEC says so).
- [ ] The Claude Code / Cursor action-row prompts get reviewed against the real page
      (they were written before the page existed).

**Done when:** an agent given only the public URL can find the source, the manifest and
the extraction instructions without guessing.

### R7 — Launch pass

- [ ] Full nightly green on the final corpus; one real-GPU spot check (tier 4 can be a
      person with a laptop for 1.0).
- [ ] Link check (every `original` URL, every action-row target, every asset).
- [ ] Prune `AGENTS.md` on the dependency state at tag time (SPEC §7 — a rule that
      outlives its bug is worse than none). Fiber alpha.4 / drei alpha.6 / three 0.185.1
      are the pins; if any moves before 1.0, the prune happens first.
- [ ] Announcement timed with r3f v10 (SPEC context).

**Done when:** tag `v1.0.0`, public URL live, announcement out.

---

## Deliberately after 1.0 — and the decision it needs

The old M4 bundled the **Patterns track** (12–20 app-scale examples) into launch. That
is a second project: none of it exists, its subject is different (app architecture, not
demo ports), and it needs its own conventions pass. **Recommendation: 1.0 is the examples
site; Patterns is 1.1.** The gallery site itself is the first pattern (dogfooding) and
can be documented as such without building the other 12–20 first. _Dennis decides._

Then, in the order SPEC §4 already sets:

- **1.1 — Patterns track.**
- **1.2 — Phase 2**: the 34 validated webgl-unique examples, ported to WebGPU where
  feasible. The **loader gallery** (47 formats) is its own decision, still open in SPEC
  §14: all formats, or a representative set.
- **Final phase**: the 7 deferred (`xr-cubes`, `xr-native-layers`, `xr-rollercoaster`,
  `compute-audio`, `tsl-editor`, `tsl-graph`, `tsl-transpiler`) — WebXR needs
  `@react-three/xr` on v10; TSL tooling is a separate product.
- **Standing**: monthly three `files.json` re-diff (SPEC §11); drei gap-closure watch —
  when drei ships something in `utils/`, migrate and retire.

## CI hardening (unchanged from before, still deferred)

- Screenshot-regression tier 2 (SwiftShader goldens, changed-examples-only).
- Nightly full-corpus screenshot tier 3.
- Real-GPU dispatch runner (tier 4).
- Animates tier on CI (needs the window retuned for SwiftShader frame rates).

## Agent economics (kept — it held)

The cheapest verifier wins. Machines verify; models port and review. Wave 3 confirmed
the shape: one agent per cluster batch, machine checks, a screenshot the agent LOOKS at,
and the doc absorbs every divergence. Three AGENTS.md rules turned out to be wrong during
the last wave and each was caught by a probe, not a review — keep paying for probes, not
for second model passes.

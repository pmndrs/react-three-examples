# pmndrs/r3f-examples — Spec (v1.1)

> Status: FINAL (2026-07-26), **amended 2026-09-01** after the first style review of
> the ported corpus. §5, §7 and §8 changed — see §15. The amendments reconcile this
> spec with [AGENTS.md](../AGENTS.md) v1.0, which is the operational contract agents
> read; where the two ever disagree, AGENTS.md is what actually steers the work and
> this file should be corrected to match.
> Executing per docs/ROADMAP.md. Name note: "r3f-examples" chosen as pragmatic working name; may fold
> into pmndrs/examples someday — not the current intent.
> Context: promoting the react-three-fiber v10 release. Research reports live in `research/`.

## 1. One-liner

The official three.js examples rebuilt in clean, idiomatic React Three Fiber v10 —
WebGPU-first — designed to be read equally well by humans and coding agents, showcasing
how dramatically R3F simplifies genuinely annoying three.js tasks, and demonstrating that
R3F is an AND with vanilla three.js, not an OR.

## 2. Goals

- Prove and promote R3F v10 + drei v11 on the WebGPU renderer.
- **The "wow" factor is a primary goal**: where three.js needs 200 lines of loader/setup
  code, show `<Canvas><CameraControls /><Gltf src="/model.glb" /></Canvas>`. Minimal code
  on each example's index file is a design objective, not a side effect.
- Actively showcase v10's DX surface: the phase-based scheduler/useFrame, `useNodes`/TSL
  hooks, `fromRef()`, `background`/`environment` as Canvas options, declarative
  postprocessing — consult the v10 branch docs (.mdx) as we build; they are the primary
  source (the docs site is not yet updated).
- Establish and document the _conventions_ of modern R3F — general "how R3F works," not
  "how to build one-page demos." The doc co-evolves with the examples (§7) and is
  exportable as docs + lint rules.
- Serve as v10/drei-v11's de facto integration test suite; surface drei WebGPU gaps by
  building our own components where drei doesn't cover something yet (§5 utils).
- Better discovery than threejs.org/examples: searchable/filterable sidebar, tags,
  per-example links (source, original example, open-in-agent).

## 3. Non-goals

- Not a re-teaching of three.js fundamentals.
- No ports of API/stress/capability tests, renderer internals, or the TSL editor /
  transpiler / graph pages — those are tooling UIs (Monaco, the Inspector), not scenes.
  Marked internal, not porting (Dennis, 2026-09-03; v1.1 had them as "later-phase").
- WebXR and webaudio: explicitly out of scope for now — final-phase items if things go fast.
- **Not pixel-parity with upstream.** Idiomatic-primary; divergence expected (§8).
- Not a fork of the three.js examples — originals are linked, not vendored.

## 4. Scope & phases

Inventory (dev branch, 2026-07-26): 595 total examples; 221 webgpu; 296 webgl (219 with no
name-matched webgpu counterpart — semantic dedup in progress, expected to shrink sharply);
77 exist on both renderers. WebGPU set grows ~5/month; re-diff `files.json` monthly.

- **Phase 1: 100% of the `webgpu_*` set** minus stress/internal tests (~190–200 ports).
  Start with the 77 dual-renderer examples (best-understood ground truth), then the
  webgpu-only set (compute, TSL, MRT — the high-value thin-training-data territory).

  _(Amended 2026-09-02 — "stress/internal tests" enumerated.)_ These 10 r185 `webgpu_*`
  pages are **excluded from Phase 1**: they exercise renderer internals or measure
  performance rather than teaching a visual technique, so a React port of them would
  demonstrate nothing about R3F.

  | excluded                                              | why                                                |
  | ----------------------------------------------------- | -------------------------------------------------- |
  | `sandbox`                                             | scratch page, no stable subject                    |
  | `test_memory`                                         | allocates until it breaks; a leak harness          |
  | `performance`, `performance_renderbundle`             | throughput benchmarks                              |
  | `pmrem_test`, `furnace_test`                          | renderer-correctness checks (white-furnace, PMREM) |
  | `compile_async`                                       | shader-compilation timing, not a scene             |
  | `multisampled_renderbuffers`, `reversed_depth_buffer` | renderer configuration probes                      |
  | `centroid_sampling`                                   | MSAA sampling-mode probe                           |

  Two are genuinely arguable — `furnace_test` is a real PBR-correctness technique and
  `centroid_sampling` teaches an MSAA subtlety a reader could hit. Revisit if the
  Patterns track wants a "renderer correctness" group. **Phase 1 target is therefore 75
  remaining ports, not 85.**

- **Patterns track (not ports): ~12–20 app-scale examples** — _decided 2026-09-03: out of
  1.0 and likely a separate repo; this project duplicates the existing three.js examples._
  Kept here as the pointer. Teaching what single-canvas demos can't: canvas in a real layout, persistent canvas across routes, shared DOM↔scene
  state, suspense/loading orchestration, multiple views, DOM↔scene events, testing R3F
  components. The gallery site itself is built with these patterns (dogfooding).
- **Phase 2: webgl-only examples — validated list only (research/webgl-unique-list.md).**
  Semantic dedup confirmed the 219 "gap" was mostly illusory: 83 are technique-covered by
  differently-named webgpu examples, 55 are low-value (deprecated/stress/thin toggles).
  Genuinely unique: **34 non-loader examples** (decals, CSG, marchingcubes, text geometry,
  multiple-views, BVH raycasting, path tracer, offscreencanvas worker, modifiers, etc.)
  **+ 47 loader-format gallery examples** (only glTF/KTX2/MaterialX have webgpu ports).
  Phase 2 = curate from the 34; the loader gallery is its own decision (❓ port all formats,
  or a representative set?). Ported to WebGPURenderer where feasible.
- **Final phase (aspirational): WebXR (@react-three/xr), webaudio.** The TSL editor/
  transpiler/graph pages are excluded outright (§3), not deferred.

## 5. Example format

- **Language: TypeScript.** No JS examples.
- Examples live in **category folders**: `src/examples/<category>/<slug>.tsx`, or
  `<category>/<slug>/<slug>.tsx` when subcomponents are needed (entry filename matches the
  folder). The category never appears in the URL — the route is always `/examples/<slug>`.
  **~200 lines on the index file** triggers the folder pattern, and that split is itself a
  taught, standardized pattern: split by scene role, not by arbitrary size.
- **The example owns its `<Canvas>`.** The scene lives self-contained inside `<Canvas>` —
  no forced `<Scene>` extraction (real-world r3f almost never does that). The _file_ is the
  unit of reuse; extraction into a user's project is handled by tooling (§6), not by file
  structure contortions.
- **Header comment block** at the top of every entry file, written for an intermediate
  R3F reader first: one or two plain sentences on what you are looking at, the original
  link, then DEMONSTRATES. **DIVERGENCE is optional** — a faithful port says nothing, and
  requiring the section only manufactures boilerplate. Schema in AGENTS.md § House style.
- No module-scope mutable state. (One-time idempotent registration at module scope is
  fine — `extend()`, `RectAreaLightNode.setLTC`.)
- **Controls: leva `useControls`, placed NEXT TO what they control** — never at the page
  root and drilled down as props. leva merges multiple `useControls` calls into one panel,
  and the v10 TSL hooks are designed to consume its output directly
  (`useControls` -> `useUniforms` -> `useNodes`). The only hard constraint is that fiber
  hooks must be inside `<Canvas>`, so the consuming component is a Canvas child.
  _(Amended: the original "controls at the edge" wording is what produced corpus-wide
  prop drilling.)_
- **Inspector: deferred.** v10 has a root-state slot but this repo has never wired it;
  every port drops `renderer.inspector` and leva covers the control surface. Revisit when
  the drei wrapper lands — until then do not write it into examples.
- **Shared `utils/` folder**: our own reusable components built for the demos — both
  drei-gap fillers (each one a documented candidate/brief for a future drei component) and
  demo furniture (stages, grids, loaders' UX).
- Drei imports follow v11 renderer-split subpaths (`/webgpu`, `/core`); never `/legacy` in
  webgpu examples. Known v11 gaps (MeshReflectorMaterial, SpotlightMaterial,
  AccumulativeShadows — drei #2533/#2658): build our own in utils/ and flag upstream.
- Post-processing: R3F v10's native TSL pipeline (`useRenderPipeline` wrapping
  THREE.PostProcessing) — NOT @react-three/postprocessing (stalled, WebGL-only).
- Per-example metadata (sibling meta or frontmatter): title, slug, original URL, tags,
  APIs used, difficulty, divergence/enhancement notes. Feeds the site index and agents.

## 6. Agent-facing design

- Consistent, predictable structure so agents pattern-match across the corpus; the corpus
  itself must model good habits (agents learn from example gravity more than prose).
- **Mechanism strategy (validated — see research/agent-interface-options.md):**
  - **Backbone: `AGENTS.md` at repo root** (the proven standard: 60k+ repos, Linux
    Foundation-stewarded, native in Codex/Cursor/Copilot/20+ tools) + thin `CLAUDE.md`
    whose first line imports it (`@AGENTS.md` — Claude Code doesn't read AGENTS.md natively).
  - **Machine-readable `examples.json` manifest** (slug, tags, APIs, paths) — cheapest
    highest-leverage move; feeds the site, agents, and the extraction tool from one file.
  - **llms.txt: generate it (cheap) but treat as decorative**, not discovery — evidence is
    damning: ~97% of llms.txt files get zero bot requests; Google explicitly compares it to
    the dead keywords meta tag; AI crawlers fetch HTML directly.
  - **In-repo Claude Code Skill** for "lift an example into your project" (Claude-only but
    real; complements the cross-tool extraction CLI).
  - **MCP server: deferred.** Real precedents are shared hubs (docs.pmnd.rs, Context7), not
    per-repo servers; users don't install long-tail project servers, and GitHub Pages
    cannot host one (static-only). Revisit on Cloudflare Workers if the corpus outgrows the
    static manifest; meanwhile pursue _inclusion in existing hubs_ (docs.pmnd.rs MCP,
    Context7 indexing) rather than running our own.
  - Consumers served: (a) site-browsing agents → HTML + manifest; (b) cloned-repo agents →
    AGENTS.md + structure; (c) user's-own-project agents → extraction CLI + skill.
- **Extraction story**: not necessarily a CLI — a launch-task page. Every served example
  page carries a top-level agent-readable pointer in its HTML (first-line comment/meta +
  visible link) to a "for agents" page with extraction instructions: where the file lives,
  the starter-shell template, how to wire deps. Agents reading the page HTML get routed
  there; humans get the same page linked in the UI. Starter shell template lives in-repo.
- **Open-in-agent buttons (researched — see research/agent-open-buttons.md):** v1 row =
  GitHub source link + **Claude Code** (`claude.ai/code?prompt=...&repositories=owner/repo`
  — officially documented; only mechanism carrying both prompt AND repo; subfolder goes in
  the prompt text) + **StackBlitz** (`/github/owner/repo/tree/branch/<subfolder>` — best
  subfolder support, no auth for public repos) + **Codespaces** badge + **Cursor**
  best-effort (`cursor://` deeplink is prompt-text-only, and Cursor now interposes a
  confirmation dialog after 2026 deeplink-abuse disclosures). **Skip:** Codex (no URL-launch
  scheme exists; tasks bind to pre-provisioned environments) and CodeSandbox (repo imports
  shut down July 2026). All links are client-side URL templates from
  {owner, repo, branch, examplePath} — no library exists, hand-assemble the row.

## 7. Conventions doc — structure and co-evolution

- Three sections, explicitly labeled so agents know which transfers:
  1. **House style** — what makes a port good, and the FIRST thing an agent reads. The
     mandate: a port that is longer, more indirect, or more imperative than the vanilla
     original has failed even if it renders perfectly.
  2. **R3F v10 idioms** — general rules valid in any app (the "how R3F works" layer).
  3. **Repo format** — this repo's shape (categories, header schema, thresholds, manifest).
     The doc states that examples are micro-scoped by design and points to the patterns track.
- **Prune on every dependency bump.** The doc went stale against fiber alpha.4 and kept
  mandating workarounds for four bugs that had been fixed (B9/B12/B16/B17), which is how
  agents ended up writing `useMemo` where v10 hooks belong and prop-drilling nodes that a
  scoped store could have carried. A rule that outlives its bug is worse than no rule.
- **Co-evolution loop:** seed from known v10/v11 idioms → port a batch → every review
  divergence becomes an example fix OR a doc amendment, never silent → periodically
  re-conform older examples. Doc carries a changelog for later agent batches.
- **Mechanize everything mechanizable:** checkable conventions become eslint rules (custom
  plugin); lint feedback beats prose for steering agents. Prose reserved for judgment calls.
- Micro-examples cross-link to patterns rather than absorbing app architecture.

## 8. Look, fidelity & enhancement policy

- **Idiomatic-primary. Divergence from the originals is expected and fine.**
- **"Poimandres baseline" = a visible, generic `<DemoHelpers>` component** (working name):
  infinite grid, CameraControls, readiness signal — a real toggleable component users
  see and can turn off, not hidden furniture. The baseline was SET BY BUILDING THE FIRST
  EXAMPLE TOGETHER (Dennis + Fable) — that example is the golden path everything else
  conforms to.
- **Tone mapping is a per-port decision, not a default.** fiber's Canvas defaults to
  ACESFilmic while the three.js originals render with the WebGPURenderer default
  (NoToneMapping) unless they set one; taking the default visibly mutes emissive and unlit
  palettes. Decide `renderer={{ toneMapping }}` deliberately on every port and compare
  against the LIVE original, not the (stale) gallery thumbnail.
  _(Amended: "not picky" was wrong — it silently changed the look of emissive examples.)_
- **Enhancements: restrained, and NOT extra controls.** A richer drei option or a better
  GLB is welcome. Adding UI the original never had is not: we are comparing this demo to
  that demo, so a control that doubles or triples the code is a net loss even when it is
  fun. If a control forces state lifting, registries or instance plumbing, drop it.
  _(Amended: "added controls" as a blanket encouragement is a direct cause of the bloat
  found in the first style review.)_
- Quality/perf drift vs vanilla would be surprising (thin wrapper over core) — not a
  primary test axis.

## 9. Site

- **Stack: Vite + react-router SPA. Tailwind + shadcn-style UI. No Next.js.**
- Single app; examples are glob-routed files within it — NOT per-demo standalone packages.
- Gallery + sidebar with search and tag filters; thumbnail per example. Per-example page:
  live demo, code view, links (GitHub, original three.js example, open-in-agent buttons).
- **Hosting: GitHub Pages** (static export), custom domain later. Cloudflare only if a
  real need emerges (e.g. MCP endpoint compute, advanced CI).

## 10. Quality & verification

- Definition of done per example: typechecks, passes conventions lint, builds, initializes
  and renders on WebGPU, metadata complete, header block present.
- **Test harness verifies "it works," not upstream parity.** No pixel-diff against three.js.
- **First-port review**: screenshot contact sheets batched for human/Fable visual review
  (the oracle at creation time is a person, not upstream pixels).
- **Regression thereafter**: golden screenshots of OUR OWN output via Playwright.
- **CI design (researched — research/webgpu-ci-github.md):** free `ubuntu-latest` runners
  ARE viable. Key fact: WebGPU initializes fine on SwiftShader (software Vulkan), but
  _headless_ Chrome on Linux never presents the WebGPU canvas (confirmed Chromium bug →
  black screenshots — the likely cause of past bad headless experiences). Fix: **headed
  Chromium under Xvfb**. Three.js's own screenshot CI proves the pattern at 150+ examples:
  puppeteer + mesa/xvfb, 5-way sharding, pixelmatch with loose thresholds, a readiness
  signal (`window._renderFinished`-style) instead of sleeps, exception list for
  non-deterministic demos. We adopt a readiness signal in the shell from day one.
  - **Tier 1** (every PR): full smoke suite — readiness signal fires, canvas context is
    really `webgpu`, canvas non-black, console clean.
  - **Tier 1.5 — "animates"** (SHIPPED, `tests/animates.spec.ts`): two-frame pixel diff
    plus dual-root-warning capture. Added because smoke's non-black check cannot see a
    FROZEN scene — a corpus sweep found 17 examples rendering a static first frame with a
    clean console. Examples that are static by design declare `"static": true` in the
    manifest (the test then asserts a live loop instead); long stop-go easings declare
    `"animationWindowMs"`. Local-only for now: SwiftShader's frame rate would need the
    window retuned before this can gate CI.
  - **Tier 2** (every PR): screenshot regression on _changed_ examples only; goldens
    generated on the same SwiftShader path (never mix GPU/software goldens).
  - **Tier 3** (nightly): full-corpus screenshot run (catches shared-utils regressions).
  - **Tier 4** (manual dispatch): real-GPU runner (GitHub gpu-t4 or cheaper third-party)
    to disambiguate SwiftShader flakiness when nightly goes red.
  - **Cadence (amended 2026-07-28, porting phase):** smoke does NOT run on every push —
    at corpus scale that is ~30 min of software raster. It runs on PRs, nightly, and on
    demand (`gh workflow run ci.yml`); the fast lint/build job still gates every push.
    **Local Metal is the oracle** — land nothing that is not green there first. Revisit
    when the corpus is complete and pushes drop to a few a month.
  - Cloudflare Browser Rendering investigated and rejected: headless Chrome underneath,
    same black-canvas limitation.
  - Follow-up: clone pmndrs/examples' packages/e2e and read its Canvas-monkeypatch Vite
    plugin directly (same-stack precedent).

## 11. Maintenance

- Pin a three.js version per site release; monthly `files.json` re-diff + agent-driven
  upgrade-and-port-new-examples pass.
- Track drei v11 gap-closures: when drei ships a component we stubbed in utils/, migrate
  the affected examples (agent task) and retire the util.

## 12. Execution model

- Fable: spec, conventions doc, orchestration, batch review, contact-sheet review.
- Opus 5 / Sonnet: porting, research, verification passes.
- Pipeline per example: port → self-verify (typecheck/lint/build/render) → screenshot →
  batch review → merge. Blocked/divergent is a first-class pipeline state (drei gaps etc.).

## 13. Resources to acquire (pending spec sign-off)

- three.js: shallow/sparse checkout — `examples/` + `src/` at the pinned version. No history.
- react-three-fiber `v10` branch — code AND the .mdx docs (primary doc source until the
  docs site updates). Pin to `canary` npm tag or build from branch.
- drei `v11` branch/alpha; leva; the drei Inspector-hooks PR and three.js Inspector source.
- Local agent reference corpus assembled from the above + our conventions doc.

## 14. Remaining open items

- Loader gallery scope (all 47 formats vs representative subset) — decide at Phase 2.
- Asset hosting: hotlink threejs.org for now; must self-host when examples swap in
  alternate/better models.
- `<DemoHelpers>` exact API — SETTLED in M1 (grid, CameraControls with dolly/polar/zoom
  clamps, `controlsRef` escape hatch, readiness signal).
- Restyle scale: the first style review (2026-09-01) left 115 of 131 examples needing a
  pass. Whether to restyle all of them or a flagship subset is decided at the pilot gate.

## 15. Amendment log

- **v1.1 (2026-09-01)** — first style review of the ported corpus (131 examples, 16
  hand-tuned by Dennis). Three spec clauses turned out to be _causes_ of the drift, not
  just silent about it:
  - §5 "controls at the edge" -> **controls next to what they control**. The old wording
    produced corpus-wide prop drilling of leva values into `useUniforms`.
  - §8 "Enhancements encouraged … added controls" -> **restrained, and not extra
    controls**. Invented UI is the main reason several ports are 2-3x the size they need.
  - §8 "Tonemapping: R3F's ACES default, not picky" -> **a deliberate per-port decision**.
    The default silently mutes emissive palettes against the originals.
    Also: §5 folder categories + ~200-line threshold + DIVERGENCE made optional; §5
    Inspector marked deferred (never wired, every port drops it); §7 restructured to three
    labelled sections with a prune-on-bump rule; §10 records the shipped animates tier and
    the real CI cadence. Operational detail lives in [AGENTS.md](../AGENTS.md) v1.0.
- **v1.2 (2026-09-03)** — §3/§4: the three TSL tooling pages (`webgpu_tsl_editor`,
  `webgpu_tsl_transpiler`, `webgpu_tsl_graph`) moved from "later-phase project" to
  **excluded as internal tooling** — their UI (a Monaco editor, the Inspector's node graph)
  is the demo, so a port would be an editor product, not an example. The transpiler
  runtime is already exercised by `shadertoy`. Final phase is now WebXR + webaudio only.

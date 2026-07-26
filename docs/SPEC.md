# pmndrs/r3f-examples — Spec (v1.0)

> Status: FINAL (2026-07-26) — all round-1/2/3 decisions folded in; executing per
> docs/ROADMAP.md. Name note: "r3f-examples" chosen as pragmatic working name; may fold
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
- Establish and document the *conventions* of modern R3F — general "how R3F works," not
  "how to build one-page demos." The doc co-evolves with the examples (§7) and is
  exportable as docs + lint rules.
- Serve as v10/drei-v11's de facto integration test suite; surface drei WebGPU gaps by
  building our own components where drei doesn't cover something yet (§5 utils).
- Better discovery than threejs.org/examples: searchable/filterable sidebar, tags,
  per-example links (source, original example, open-in-agent).

## 3. Non-goals

- Not a re-teaching of three.js fundamentals.
- No ports of API/stress/capability tests or renderer internals; the TSL editor/transpiler
  pages are a *later-phase project*, not v1.
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
- **Patterns track (not ports): ~12–20 app-scale examples** teaching what single-canvas
  demos can't: canvas in a real layout, persistent canvas across routes, shared DOM↔scene
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
- **Final phase (aspirational): WebXR (@react-three/xr), webaudio, TSL editor tooling.**

## 5. Example format

- **Language: TypeScript.** No JS examples.
- One file per example where possible; folder with matching-name entry file when subcomponents
  are needed. **Line-count threshold on the index file** triggers the folder/subcomponent
  pattern — and that split is itself a taught, standardized pattern.
- **The example owns its `<Canvas>`.** The scene lives self-contained inside `<Canvas>` —
  no forced `<Scene>` extraction (real-world r3f almost never does that). The *file* is the
  unit of reuse; extraction into a user's project is handled by tooling (§6), not by file
  structure contortions.
- **Header comment block** at the top of every index file addressing both HUMAN and AGENT:
  what this demonstrates, the original example link, key APIs, divergence notes. Exact
  schema TBD in conventions doc.
- No module-scope mutable state; controls at the edge; props where they clarify.
- **Controls: leva `useControls`** — solid, trusted, first choice. The v10 TSL hooks are
  designed to work with useControls outputs (see existing v10 examples).
- **Inspector: include the new three.js `Inspector`** at minimum as the perf/FPS tracker.
  v10 has a root-state slot for it; drei react-hook wrappers are an open PR — use the slot
  now, adopt the drei component when it lands. Leva covers the control-surface side until
  its upgrade addresses advanced cases (renderTarget outputs, etc.).
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
    static manifest; meanwhile pursue *inclusion in existing hubs* (docs.pmnd.rs MCP,
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

- Two layers, explicitly labeled so agents know which transfers:
  1. **R3F core idioms** — general rules valid in any app (the "how R3F works" layer).
  2. **Corpus conventions** — this repo's format (header schema, thresholds, metadata).
  The doc states that examples are micro-scoped by design and points to the patterns track.
- **Co-evolution loop:** seed from known v10/v11 idioms → port a batch → every review
  divergence becomes an example fix OR a doc amendment, never silent → periodically
  re-conform older examples. Doc carries a changelog for later agent batches.
- **Mechanize everything mechanizable:** checkable conventions become eslint rules (custom
  plugin); lint feedback beats prose for steering agents. Prose reserved for judgment calls.
- Micro-examples cross-link to patterns rather than absorbing app architecture.

## 8. Look, fidelity & enhancement policy

- **Idiomatic-primary. Divergence from the originals is expected and fine.**
- **"Poimandres baseline" = a visible, generic `<DemoHelpers>` component** (working name):
  infinite grid, CameraControls, Inspector/perf slot — a real toggleable component users
  see and can turn off, not hidden furniture. Tonemapping: R3F's ACES default, not picky.
  The baseline is SET BY BUILDING THE FIRST EXAMPLE TOGETHER (Dennis + Fable) — that
  example is the golden path everything else conforms to.
- **Enhancements encouraged** where they showcase better: richer drei component options, a
  better GLB, added controls — restrained, not over-complicated. Enhancements are recorded
  in the example's divergence notes.
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
  *headless* Chrome on Linux never presents the WebGPU canvas (confirmed Chromium bug →
  black screenshots — the likely cause of past bad headless experiences). Fix: **headed
  Chromium under Xvfb**. Three.js's own screenshot CI proves the pattern at 150+ examples:
  puppeteer + mesa/xvfb, 5-way sharding, pixelmatch with loose thresholds, a readiness
  signal (`window._renderFinished`-style) instead of sleeps, exception list for
  non-deterministic demos. We adopt a readiness signal in the shell from day one.
  - **Tier 1** (every PR): full smoke suite — renders + non-black canvas, no pixel diff,
    sharded on free runners.
  - **Tier 2** (every PR): screenshot regression on *changed* examples only; goldens
    generated on the same SwiftShader path (never mix GPU/software goldens).
  - **Tier 3** (nightly): full-corpus screenshot run (catches shared-utils regressions).
  - **Tier 4** (manual dispatch): real-GPU runner (GitHub gpu-t4 or cheaper third-party)
    to disambiguate SwiftShader flakiness when nightly goes red.
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
- `<DemoHelpers>` exact API — set while building example #1 together (M1).

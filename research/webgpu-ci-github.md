# Running WebGPU Rendering Tests in CI on GitHub Actions (July 2026)

Research for: ~200 R3F/WebGPU examples needing (a) "does it render at all" smoke tests and
(b) screenshot regression tests against the project's own golden images. Constraint:
GitHub-hosted runners, Playwright + real browsers preferred over headless-Chrome-only,
Cloudflare as an escape hatch.

## Verdict up front

Software WebGPU (SwiftShader/Vulkan-on-CPU) **does initialize** on stock `ubuntu-latest`
runners in 2026 — no physical GPU or `/dev/dri` needed. The catch isn't initialization,
it's **capture**: headless Chrome on Linux never delivers WebGPU's canvas presentation to
the headless compositor, so `--headless=new` screenshots of WebGPU canvases come back
black regardless of flag combination. The fix everyone converges on is the same one
three.js already ships in production: run **headed** Chromium under **Xvfb**, not
`--headless`. That combination works reliably on free `ubuntu-latest` runners today,
just slower and occasionally flakier than a real GPU. three.js's own example-screenshot
CI (`test/e2e/puppeteer.js`, 5-way sharded, `mesa-vulkan-drivers` + `xvfb-run`) is direct
proof this runs at ~150+ example scale on free/standard GitHub-hosted runners.

Recommendation: **default to free ubuntu-latest + Xvfb + headed Chromium + SwiftShader**
for both smoke tests (every PR) and screenshot regression (every PR, changed examples
only), reserving GitHub's GPU larger runners (`gpu-t4-4-core`, ~$0.07/min) for an optional
nightly full-suite run if flakiness or runtime on software rendering becomes a problem.
Cloudflare Browser Rendering is not a fit for WebGPU pixel testing (see §6) — treat it as
a non-starter escape hatch, not a real option.

---

## 1. GitHub-hosted runner GPU reality

- **Standard `ubuntu-latest`**: 4 vCPU / 16 GiB RAM, **no GPU**, no `/dev/dri`. Free and
  unlimited(-ish) for public repos. This has been the spec since the Dec 2023 doubling;
  still current as of mid-2026 changelogs.
- Chrome's WebGPU backend on Linux without a GPU falls back to **SwiftShader**, Google's
  CPU implementation of Vulkan 1.3 (Dawn backend targets Vulkan; SwiftShader is the
  software Vulkan ICD). This is the same mechanism used for WebGL software fallback,
  just one layer lower in the stack.
- Required flags for WebGPU + software Vulkan on a GPU-less Linux box, converged on
  across every source checked (agent-browser.dev, three.js, Promaton, Barth
  Paleologue's blog):
  ```
  --enable-unsafe-webgpu
  --enable-features=Vulkan
  --use-angle=vulkan
  --use-vulkan=swiftshader
  --use-webgpu-adapter=swiftshader
  --disable-vulkan-surface
  --ignore-gpu-blocklist
  --disable-gpu-driver-bug-workarounds
  --no-sandbox            # CI-only
  ```
  `WebGPU` is still gated behind `--enable-unsafe-webgpu` on Linux specifically — it's
  "experimental" there while shipped-by-default on macOS/Windows.
- **Headless vs headed matters more than any flag combo.** Multiple independent sources
  (Chromium issue trackers, agent-browser.dev, Promaton/Dave Snider posts) confirm: on
  Linux, `--headless=new` initializes WebGPU rendering correctly but the canvas
  presentation never reaches the headless compositor — screenshots come back solid
  black. No known flag fixes this. The workaround is running **headed** Chromium inside
  a virtual framebuffer (**Xvfb**), which is what three.js's CI, Promaton's GPU-runner
  post, and agent-browser.dev's `--headed` fallback all do. macOS and Windows headed/GPU
  paths don't have this bug, only Linux headless does — irrelevant here since GitHub
  Linux runners are the target.
- System packages needed on the runner: `mesa-vulkan-drivers` (provides the SwiftShader/
  llvmpipe Vulkan ICD) and `xvfb` (`sudo apt-get install -y mesa-vulkan-drivers xvfb`) —
  exactly what three.js's `ci.yml` installs before its e2e job.
- **GitHub GPU-enabled larger runners**: GA since July 2024. Label `gpu-t4-4-core`:
  4 vCPU, 28 GB RAM, 1x NVIDIA Tesla T4 (16 GB VRAM), **$0.07/min**. Only available on
  GitHub Team/Enterprise Cloud plans, **not free for public repos** (unlike standard
  runners), and third-party alternatives (RunsOn on AWS, machine.dev) are 5–10x cheaper
  per T4-minute if you outgrow GitHub's native offering. Real GPU acceleration
  eliminates the headless-capture bug entirely (headed+GPU pipeline works normally) and
  cuts a Promaton-reported suite from 5+ min to 1.4 min, with zero flakiness vs.
  SwiftShader's canvas-timeout flakiness on the same suite.

## 2. Playwright specifics

- Use **Chromium channel `chromium`** (Playwright's bundled build), not `chrome` or
  `msedge`, unless you specifically need to match a consumer auto-update channel —
  bundled Chromium is what all the WebGPU-in-CI writeups above use and what's validated
  against the flag set. `channel: 'chrome'` is documented as an option but adds a
  dependency on Chrome-for-Testing installation with no WebGPU benefit.
- Pass the flag list above via `launchOptions.args` in `playwright.config.ts`, plus
  `headless: false` and run the whole job under `xvfb-run --auto-servernum
  --server-args="-screen 0 1920x1080x24"` (or `xvfb-action`/`Xvfb` GH Action). This is
  the exact pattern in the Promaton/Dave Snider GPU-runner post and in
  barthpaleologue.github.io's WebGL/WebGPU Playwright setup post (`--use-gl=swiftshader`
  there, for WebGL; add the Vulkan/WebGPU flags above for WebGPU specifically).
- Docker: `mcr.microsoft.com/playwright:v1.5x-jammy` (pmndrs' own tooling —
  `pmndrs/playwright` repo — ships a Dockerfile off this base) gives a pinned,
  reproducible Chromium + all system deps (including Vulkan/Mesa) baked in, avoiding
  apt-get drift between CI runs. Recommended over ad-hoc `apt-get install` if
  screenshot stability across weeks/months matters (it does, for golden-image diffing).
- Known issues: WebGPU device loss under memory pressure with SwiftShader on long test
  runs (three.js's puppeteer.js explicitly restarts the browser on WebGPU device loss);
  first-load canvas init can take up to 30s under pure SwiftShader with no warm-up
  (Promaton's before/after numbers) — mitigate with an explicit `_renderFinished`
  readiness flag (see §4) rather than a fixed sleep.

## 3. Prior art

### three.js (`mrdoob/three.js`) — directly relevant, most mature reference

- `test/e2e/puppeteer.js`: Puppeteer (not Playwright) launches Chromium with the flag
  set in §1, viewport 800×500 rendered at 2x then downsampled, JPEG @95%. Waits for
  network-idle (2s) *and* polls a `window._renderFinished` flag every 100ms (configurable
  timeout, default 5s), plus a size-proportional parse-time buffer (~1s/MB) before
  starting that poll — belt-and-suspenders against both "canvas not ready" and "network
  still loading" flakiness.
- Screenshot diffing: `pixelmatch`, per-pixel threshold **0.1**, global failure threshold
  **0.1% of pixels differing**. On failure, writes `actual`/`expected`/`diff` triptychs
  to `test/e2e/output-screenshots/`.
- Maintains a hardcoded **exception list** of examples excluded from e2e for known
  causes: >1min render time, HTML-in-canvas, black-screen-by-design, physics/audio
  timing-sensitivity, webcam/video dependency. This is a directly reusable pattern for
  a 200-example gallery — you will have webcam demos, physics demos, and slow shader
  demos that need the same triage bucket rather than blocking CI.
  CLI supports `--make` (regenerate goldens) and `--webgpu` (filter to WebGPU-only
  examples) — worth mirroring exactly.
- **CI workflow** (`.github/workflows/ci.yml`, e2e job): `ubuntu-latest`, installs
  `mesa-vulkan-drivers xvfb` via apt, Node 24, **matrix-sharded 5 ways**
  (`CI: [0,1,2,3,4]`), runs `xvfb-run -a npm run test-e2e`, uploads
  `test/e2e/output-screenshots` as `Output screenshots-${{matrix.os}}-${{matrix.CI}}`
  conditional on files existing.
- **Reporting workflow** (`report-e2e.yml`): separate `workflow_run`-triggered job
  (`ubuntu-latest`, `contents:write` + `pull-requests:write`), pulls the e2e job's
  artifacts via `actions/github-script`, unzips safely (`unzip -j`, flattened, guards
  against zip-slip), pushes diff images to an orphan commit on an `e2e-screenshots`
  branch (force-pushed each run), and posts/updates a single PR comment with an
  expected/actual/diff table (capped at 10 inline images, rest listed by name). This
  decoupled report-job pattern is worth copying wholesale — it keeps secrets/write
  permissions off the untrusted PR-triggered job.

### pmndrs/examples (`pmndrs/examples`, packages/e2e)

- Confirmed to exist and use a Vite-plugin canvas monkeypatch ("CheesyCanvas") to make
  R3F `<Canvas>` deterministic for Playwright screenshots — this is the closest sibling
  project to this repo's own stack (R3F, not raw three.js). Could not pull the exact
  monkeypatch source or playwright.config contents via fetch (GitHub's raw content for
  the current file states came back mostly empty/stale in this session — the repo may
  have reorganized recently). **Recommend a direct clone-and-read** before final design
  since this is the single most relevant prior-art repo (same rendering stack) — worth a
  follow-up pass with `gh repo clone pmndrs/examples` or `WebFetch` on the *current*
  default branch tree once available.
- Related: `pmndrs/playwright` — a maintained Docker image
  (`mcr.microsoft.com/playwright:v1.45.3-jammy`-based) used across pmndrs projects
  including `drei`'s own Playwright e2e tests, for reproducible snapshot generation.
  `drei` itself runs Playwright-in-Docker for its e2e suite — another same-stack
  reference worth reading directly (`pmndrs/drei`, e2e directory + Dockerfile).

### Babylon.js / Babylon-Lite

- `BabylonJS/Babylon-Lite`: WebGPU-exclusive engine, uses Playwright browsers for
  parity and bundle-size tests against upstream Babylon.js — pixel-identical output
  comparison, same spirit as this project's golden-image approach but engine-parity
  rather than regression-over-time.

### PlayCanvas

- WebGL/WebGPU dual-backend engine; nothing WebGPU-CI-specific and public in their
  `playcanvas/engine` Actions runs surfaced by search — did not find a distinct pattern
  beyond what three.js and Babylon already establish.

### General tooling worth knowing about

- **agent-browser** (agent-browser.dev): a CLI/library specifically built around this
  exact problem (headless-Chrome WebGPU capture). Ships a `--webgpu` preset bundling
  the full flag set, auto-detects GPU-less Linux and falls back to SwiftShader, and
  auto-launches Xvfb when `--headed` is requested without an existing display. Documents
  the Linux/Windows headless-screenshot black-canvas bug explicitly as unfixable via
  flags. Also flags that `canvas.drawImage`-based screenshot capture is unreliable for
  WebGPU and recommends `copyTextureToBuffer` + `mapAsync` for pixel-perfect capture —
  relevant if hand-rolling capture rather than relying on Playwright's own
  `page.screenshot()` (which goes through the compositor, not WebGPU's copy API, and is
  what everyone above actually uses in practice — the copyTextureToBuffer approach is a
  more exotic/precise alternative worth knowing exists but not necessary for
  screenshot-regression-with-thresholds use cases).

## 4. Determinism techniques

Consistent findings across three.js, Promaton, and barthpaleologue:

1. **Explicit readiness signal, not a fixed sleep.** three.js polls
   `window._renderFinished`; barthpaleologue's game waits on a DOM attribute
   (`canvas.dataset.ready = "1"`) set by the app after first frame. For an R3F gallery,
   the equivalent is a small test-only hook — e.g. an `onCreated`/`useFrame`-driven
   `window.__r3fReady = true` (or reuse whatever `pmndrs/examples`' CheesyCanvas
   monkeypatch already does, since it's built for exactly this) — set after N frames or
   after a specific frame count/time budget so animated scenes settle before capture.
2. **Fixed timestep / seeded time for animated scenes.** Not fully detailed in any
   single source fetched here, but the standard technique (and implied by "wait for
   render finished" + pixel-threshold diffing rather than frame-exact matching) is:
   either (a) pause the R3F render loop and manually advance the Three.js clock a fixed
   number of ticks before capture, or (b) accept nondeterminism and rely on generous
   pixel-diff thresholds (below). Given this project already plans smoke + golden-image
   tests, (a) is worth building as a shared test utility (e.g. a `?e2e=1` query param
   the example harness reads to freeze `THREE.Clock`/`useFrame` at a fixed delta) rather
   than depending on threshold tolerance alone for anything with continuous animation.
3. **Pixel-diff thresholds, not exact match.** Two converged reference points:
   - three.js: per-pixel threshold 0.1, global 0.1% of pixels.
   - barthpaleologue's WebGL/WebGPU Playwright setup: 3% global pixel-diff ratio, 1%
     per-pixel threshold (looser — explicitly to tolerate anti-aliasing jitter).
   Given SwiftShader (software rasterizer) will differ subtly from any real-GPU-rendered
   golden image if goldens are ever regenerated on a GPU runner, **keep goldens and CI
   renderer matched** — i.e., generate/update golden images using the exact same
   software-rendering path (SwiftShader via Xvfb) that CI diffs against, not a
   developer's real GPU locally. This avoids the single most common source of "works on
   my machine, fails in CI" for this kind of test.
4. **Network idle + parse-time buffer** before starting the readiness poll (three.js's
   pattern) guards against premature capture on slower CI runners.
5. **Restart browser on WebGPU device loss** (three.js does this explicitly) — a
   pragmatic mitigation for SwiftShader's occasional context loss under memory pressure
   during a long sharded run.

## 5. Scale: ~200 examples per CI run

Realistic strategies, combining what three.js already proves works at ~150+-example
scale plus standard Playwright/GH Actions patterns:

- **Build once, test many, shard the testing.** One job builds the static gallery
  (`vite build` or equivalent) and either uploads it as an artifact for shard jobs to
  download, or shard jobs share a single `serve` step if using a single long-running
  job with `--shard=N/M`. Matrix-based sharding (`strategy.matrix: shardIndex:
  [1..N]`) is the standard GH Actions + Playwright pattern; `playwright test
  --shard=${{matyrix.shardIndex}}/${{matrix.shardTotal}}` splits by test file, and
  results merge via Playwright's blob reporter. three.js uses a flatter matrix
  (`CI: [0,1,2,3,4]`) consumed by its own custom test runner script rather than
  Playwright's built-in `--shard`, since it's Puppeteer-based — either approach works;
  Playwright's native `--shard` is less code to own.
- **5-way shard is a reasonable starting point** (mirrors three.js at similar example
  count) — with 200 examples that's ~40/shard. On free `ubuntu-latest` + SwiftShader,
  budget several seconds to ~30s per example depending on scene complexity (Promaton's
  worst-case pre-optimization number), so 40 examples/shard could be anywhere from
  ~5–20 min — tune shard count from actual measured per-example time once the harness
  exists, don't guess further than this.
- **Every-PR: smoke test only changed examples + always run full smoke suite is
  probably overkill for 200 at this per-example cost.** Better split, matching the
  "does it render" vs "pixel regression" split in the task:
  - **Smoke test (renders without throwing/black screen)**: cheap enough (no pixel
    diffing, just "did `_renderFinished` fire and is the canvas non-blank") to run on
    **every PR, full 200-example suite, sharded**.
  - **Screenshot regression**: run on **every PR but scoped to changed examples only**
    (diff the PR's touched example directories against `git diff --name-only`), plus a
    **nightly full-suite run** across all 200 to catch cross-cutting regressions (shared
    component/library changes) that a changed-files filter would miss.
- **Nightly full screenshot run is also the natural place to spend GPU-runner budget**
  if SwiftShader flakiness becomes a real problem — pay the ~$0.07/min T4 rate once a
  day across a full 200-example sharded run rather than on every PR.

## 6. If free-runner software WebGPU proves genuinely unworkable

In rough order of cost/complexity:

1. **GitHub GPU larger runners, nightly-only** (`gpu-t4-4-core`, $0.07/min, Team/
   Enterprise Cloud only, not free even for public repos). Cleanest "stay inside GitHub"
   escape hatch; real GPU sidesteps the headless-capture bug entirely and removes
   SwiftShader flakiness/slowness. Native GitHub GPU runners are ~8–17x more expensive
   per minute than third-party equivalents (RunsOn on AWS ~$0.009/min on-demand,
   ~$0.004/min spot for the same T4/4vCPU/16GB spec) — worth comparing before
   committing budget, though RunsOn requires bringing your own AWS account (still
   "GitHub Actions" from the workflow YAML's perspective via a custom runner label, not
   truly "self-hosted" in the ops-burden sense).
2. **Self-hosted runner with a real GPU** (own hardware or a cloud VM you manage) — most
   control, most ops burden; only worth it if nightly GPU-runner cost or GitHub's
   larger-runner plan gating (Team/Enterprise only) becomes a blocker for what is
   presumably a personal/OSS-scale project.
3. **BrowserStack-type managed real-browser services** — not evaluated in depth here
   since the owner already prefers Playwright-with-real-browsers-on-GitHub-runners and
   these services mainly solve cross-browser/cross-device matrices, not the
   GPU-less-Linux-CI problem specifically; would still hit the same SwiftShader-vs-GPU
   tradeoff unless the service specifically offers GPU-backed browser instances.
4. **Cloudflare Workers Browser Rendering** — investigated per the task's "escape
   hatch" framing, but it's the wrong tool here. Cloudflare Workers gained a *WebGPU
   compute* binding in 2023 (GPU compute inside a Worker, unrelated to browser
   rendering), and Browser Rendering (recently rebranded "Browser Run") is a managed
   headless-browser-as-a-service product for scraping/PDF/screenshot automation — it
   runs on Cloudflare's own headless Chrome fleet, which inherits the same
   headless-WebGPU-canvas-capture limitation as any other headless Chrome, with no
   published GPU-backed rendering tier for this use case as of this research. Not
   recommended as a WebGPU screenshot-testing backend; only useful here if the project
   ever needs plain WebGL/non-3D page screenshots at scale.

## 7. Recommended tiered CI design

```
Tier 1 — Every PR, smoke only (fast, cheap, free runner)
  ubuntu-latest, matrix shardIndex [1..5]
  apt: mesa-vulkan-drivers xvfb
  xvfb-run -a npx playwright test --project=smoke --shard=${{matrix.shardIndex}}/5
  assertion: page loaded, no console errors, _renderFinished fired, canvas not all-black
  no pixel diffing — just existence/health checks
  runtime target: a few minutes per shard

Tier 2 — Every PR, screenshot regression on changed examples only (free runner)
  compute changed example dirs via `git diff --name-only origin/main...HEAD`
  ubuntu-latest, single job (small N), same xvfb+SwiftShader flag set
  pixelmatch against golden images checked into repo (or an orphan `goldens` branch)
  thresholds: start at three.js's 0.1%/0.1 per-pixel; loosen per-example if
  SwiftShader-vs-golden noise requires it (keep goldens generated on the *same*
  SwiftShader path to minimize this)
  on failure: three.js-style separate report job posts actual/expected/diff to the PR
  via a github-script step reading uploaded artifacts (decouples write-permission job
  from the untrusted PR-code job)

Tier 3 — Nightly, full screenshot suite, all ~200 examples (free runner, sharded 5-8x)
  same as Tier 2 but scoped to everything, not just changed dirs
  catches regressions from shared-component/library changes that Tier 2's diff-based
  scoping would miss

Tier 4 — Escape hatch, manual/on-demand only (optional, budget-gated)
  workflow_dispatch-triggered job on gpu-t4-4-core ($0.07/min) or a third-party
  GPU runner (RunsOn/machine.dev, ~$0.004-0.009/min) re-running Tier 3 on real GPU
  hardware to disambiguate "is this a real regression or SwiftShader flakiness"
  before spending investigation time — pull this lever only when Tier 3 goes red
  and the cause is unclear.
```

Golden images: store alongside each example (or in a dedicated `__screenshots__/`
tree) and treat regeneration (`--make` a la three.js) as an explicit, reviewed action
in a PR — never auto-committed by CI.

Example harness needs (build once, shared across tiers):
- A test-mode query param / global flag (`window.__e2eReady`, or reuse
  `pmndrs/examples`' CheesyCanvas pattern if it fits this repo's `<Canvas>` usage) set
  after first stable frame.
- An optional fixed-timestep hook for animated examples so Tier 2/3 golden diffing
  isn't fighting continuous motion — freeze `useFrame`/`THREE.Clock` at a deterministic
  delta when a `?e2e=1`-style flag is present.
- A machine-readable exception list (three.js-style) for examples that are
  legitimately non-deterministic or expensive (webcam, physics, audio-reactive,
  >60s render) — excluded from Tier 2/3 pixel diffing but still covered by Tier 1
  smoke checks.

---

## Sources

- [SwiftShader brings software 3D rendering to Chrome — Chrome for Developers](https://developer.chrome.com/blog/swiftshader-brings-software-3d-rendering-to-chrome/)
- [google/swiftshader (GitHub)](https://github.com/google/swiftshader)
- [Running Playwright with GPU powered Actions — Dave Snider](https://davesnider.com/gputests)
- [Testing 3D applications with Playwright on GPU — Promaton (Medium)](https://blog.promaton.com/testing-3d-applications-with-playwright-on-gpu-1e9cfc8b54a9)
- [End-to-end testing for web games — Barth Paleologue](https://barthpaleologue.github.io/Blog/posts/webgl-webgpu-playwright-setup/)
- [WebGPU — agent-browser.dev](https://agent-browser.dev/webgpu)
- [WebGPU: Troubleshooting tips and fixes — Chrome for Developers](https://developer.chrome.com/docs/web-platform/webgpu/troubleshooting-tips)
- [Support GPU hardware in headless mode — Chromium issue 40540071](https://issues.chromium.org/issues/40540071)
- [New Headless Chrome on Linux via Puppeteer does not use GPU — Chromium issue 40274484](https://issues.chromium.org/issues/40274484)
- [mrdoob/three.js — test/e2e/puppeteer.js](https://github.com/mrdoob/three.js/blob/dev/test/e2e/puppeteer.js)
- [mrdoob/three.js — .github/workflows/ci.yml](https://github.com/mrdoob/three.js/blob/dev/.github/workflows/ci.yml)
- [mrdoob/three.js — .github/workflows/report-e2e.yml](https://github.com/mrdoob/three.js/blob/dev/.github/workflows/report-e2e.yml)
- [pmndrs/examples (GitHub)](https://github.com/pmndrs/examples)
- [pmndrs/playwright (GitHub)](https://github.com/pmndrs/playwright)
- [pmndrs/drei (GitHub)](https://github.com/pmndrs/drei)
- [BabylonJS/Babylon-Lite (GitHub)](https://github.com/BabylonJS/Babylon-Lite)
- [GitHub Actions: GPU hosted runners are now generally available — GitHub Changelog](https://github.blog/changelog/2024-07-08-github-actions-gpu-hosted-runners-are-now-generally-available/)
- [Larger runners reference — GitHub Docs](https://docs.github.com/en/actions/reference/runners/larger-runners)
- [GitHub-hosted runners reference — GitHub Docs](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
- [GitHub-hosted runners: Double the power for open source — GitHub Blog](https://github.blog/news-insights/product-news/github-hosted-runners-double-the-power-for-open-source/)
- [GPU Runners — machine.dev docs](https://machine.dev/docs/platform-specifications/gpu-runners/)
- [RunsOn — GPU runners for GitHub Actions](https://runs-on.com/runners/gpu/)
- [Sharding — Playwright docs](https://playwright.dev/docs/test-sharding)
- [Dynamic Playwright Sharding in GitHub Actions — Danny Foster](https://foster.sh/blog/dynamic-playwright-sharding-in-github-actions)
- [WebGPU support for graphics rendering — cloudflare/workerd issue 1276](https://github.com/cloudflare/workerd/issues/1276)
- [You can now use WebGPU in Cloudflare Workers — Cloudflare Blog](https://blog.cloudflare.com/webgpu-in-workers/)
- [The Cloudflare Blog: Browser Rendering (tag index)](https://blog.cloudflare.com/tag/browser-rendering/)

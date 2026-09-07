# Site shell — contract

> Companion to [SPEC.md](SPEC.md) §9 ("Site") and §6 ("Agent-facing design"). SPEC
> states the _goals_ for the shell; this doc records what was actually built and the
> decisions behind it, the way AGENTS.md does for examples. Amend it here when the
> shell changes shape — don't let it go stale the way a couple of other docs in this
> repo did against a newer AGENTS.md (see "A note on doc drift" below).

## What's here

- `src/app/Home.tsx` — landing page at `/` (previously a bare redirect to the first
  example). Leads with what the repo is, links to GitHub, then the full gallery
  grouped by category.
- `src/app/Layout.tsx` — sidebar: grouped-by-category nav + live substring search,
  composable with a tag multi-select (see "Tag filter").
- `src/app/Titleblock.tsx` — per-example overlay: title, three.js original link,
  credits, and the "open in ..." action row.
- `src/app/ExamplePage.tsx` — the `/examples/<slug>` route element: the live demo,
  `Titleblock`, and the "Code" toggle that opens `CodePanel` (see "Code view").
- `src/app/CodePanel.tsx` / `src/app/exampleSources.ts` — the code view's panel and its
  lazy source loader.
- `src/app/Thumb.tsx` — `<img>` onto `/thumbs/<slug>.jpg` with a category-accent
  fallback; shared by `Home.tsx`'s cards and `Layout.tsx`'s sidebar rows (see
  "Thumbnails").
- `src/app/useDocumentMeta.ts` — per-route `document.title` + meta description/OG sync
  (see "OG / meta tags").
- `src/app/manifest.ts` — typed view over `examples.json`, now including `CATEGORIES`,
  `categoryLabels`, and `categoryAccent`.
- `src/app/routes.ts` — glob-routes examples; also exports `exampleFilePaths` (slug ->
  repo-root-relative source path), computed from the same glob so the action row never
  hand-maintains a slug→path table.
- `src/app/agentLinks.ts` — URL builders for the action row (GitHub, StackBlitz,
  vscode.dev, Codespaces, Claude Code, Cursor).
- `scripts/generate-manifest.mjs` — generates `category` and normalises `tags` in
  `examples.json`. Re-run after adding examples: `pnpm generate:manifest`. `--check`
  exits 1 if the file is out of date (wire into CI if this repo wants that gate).
- `scripts/thumbs.mjs` — generates `public/thumbs/<slug>.jpg` (see "Thumbnails").

## Category data: why it's a hand-written map, not a folder read

The task this shell was built from assumed examples live in category folders
(`src/examples/<category>/<slug>.tsx`) and that `category` could just be read off the
directory an example lives in. **That's not the case in this checkout**: all 131
examples live flat under `src/examples/<slug>.tsx` (or `<slug>/<slug>.tsx` when the
example needs subcomponents) — there is no category directory to read.

So `scripts/generate-manifest.mjs` carries an explicit `CATEGORY_MAP` (slug ->
category), derived by hand from each example's original three.js example name (the
`#webgpu_<category>_<name>` anchor in its `original` URL) plus judgment calls for the
examples whose slug has no category-shaped prefix (`backdrop`, `sky`, `layers`,
`occlusion`, `fog-height`, `tonemapping`, ...). See the script for the full mapping
and its category-by-category comments. If this repo later reorganizes examples into
real category folders, swap the map for a directory read in one place — nothing else
in the shell (Home, Layout, Titleblock) cares how `category` was derived, only that
`ExampleMeta.category` exists.

Re-run the generator (`pnpm generate:manifest`) whenever an example is added,
renamed, or re-tagged — it validates that every slug in `examples.json` has a mapping
and fails loudly (exit 1) if one is missing, rather than silently leaving a new
example uncategorized.

## Tag vocabulary normalization

Audited all 172 distinct tags across 131 examples (`scripts/generate-manifest.mjs`,
`TAG_RENAME`). Two kinds of change:

**Semantic duplicates merged** (same concept, two spellings — the ones that would
have fragmented a tag-filter UI):

| From                  | To               | Occurrences                                         |
| --------------------- | ---------------- | --------------------------------------------------- |
| `post-processing`     | `postprocessing` | 10                                                  |
| `shadow`              | `shadows`        | 2                                                   |
| `texture`             | `textures`       | 3                                                   |
| `reflector`           | `reflection`     | 2                                                   |
| `glTF`                | `gltf`           | 1                                                   |
| `compressed-textures` | `compression`    | 1                                                   |
| `data-3d-texture`     | `3d-texture`     | 1                                                   |
| `envmap`              | `environment`    | 2                                                   |
| `render-to-texture`   | `render-target`  | 5                                                   |
| `webgpu`              | _(dropped)_      | 1 — redundant, every example in this repo is WebGPU |

**Casing normalized** (camelCase / smashed-compound outliers, kebab-cased to match
the other ~165 tags — e.g. `pointlight` → `point-light`, `lightsNode` →
`lights-node`, `cameraHelper` → `camera-helper`; 15 tags, see `TAG_RENAME` for the
full list).

Net: **172 → 162 distinct tags.** Deliberately _not_ merged, even though they look
similar at a glance: general/specific pairs that are a real, useful pattern
throughout the existing vocabulary (`environment` + `hdr`, `loader` + `gltf`/`obj`/
`ply`/`fbx`, `lines` + `line2`) — collapsing those would lose a real filter
distinction, not just a spelling.

## Thumbnails

R4 replaced the category-accent placeholder with real per-example thumbnails.
`scripts/thumbs.mjs` (`pnpm thumbs`) captures `public/thumbs/<slug>.jpg` — a
480x300 JPEG (quality ~70) — by reusing `contact-sheet.mjs`'s launch recipe exactly
(real Chromium channel, `--enable-unsafe-webgpu`, leva hidden, `localStorage.clear()`,
`startClick` honored, `SHOT_DELAY_MS` settle, hard per-example timeout, browser always
closes). It also hides the shell's own overlays — Titleblock and the Code toggle,
both marked `data-chrome-overlay` — so the thumbnail is the demo, not the site chrome
sitting on top of it (a real bug caught by looking at the first captures: without this
the "Code" button and the titleblock card were baked into every image).

**Viewport math, not a round number**: the capture viewport is `960 + 256` wide, not
960 — `Layout.tsx`'s sidebar is a fixed 256px (`w-64`) on every route including
examples, so the canvas itself (what gets screenshotted — `locator('canvas').first()`,
same as `contact-sheet.mjs`) only spans `viewport width - 256`. At `deviceScaleFactor:
0.5` that lands the canvas screenshot at exactly 480x300.

By default `pnpm thumbs` skips any slug that already has a thumb on disk — cheap to
re-run after adding a few examples. `--force` regenerates everything; `<slug> [slug...]`
scopes to specific examples (and implies regeneration, matching `pnpm shot`'s
convention). `--check-black` re-opens every existing thumb in the SAME browser
(`<img>` + `<canvas>`, no image-decoding dependency), computes its mean luma, and
re-shoots anything under a near-black threshold — the situation the R4 brief called out
by name: this repo has another agent editing examples concurrently, and an HMR reload
racing a capture can produce a black frame. Anything still black after one re-shoot is
reported, not silently retried forever.

`Thumb.tsx` is the read side: an `<img src="/thumbs/<slug>.jpg">` with an `onError`
fallback to the same category-accent gradient tile the site used before thumbnails
existed — an example added since the last `pnpm thumbs` run (or before the very first
run) degrades gracefully instead of showing a broken-image icon. Shared by `Home.tsx`'s
gallery cards (`aspect-[8/5]`, matching the 480x300 ratio) and `Layout.tsx`'s sidebar
rows (a small `h-4 w-6` swatch next to the title).

## Sidebar search and tag filter

Plain substring match over title, slug, tags, and category — no search library, no
fuzzy matching, no index; 268 items is nowhere near where that would matter
(`Layout.tsx`, `useMemo`d on the query string). Matching groups collapse to zero
entries rather than staying open empty. The active example's `NavLink` gets a ref
that's scrolled into view (`scrollIntoView({ block: 'nearest' })`) on navigation —
deliberately _not_ on every keystroke, so typing a search query doesn't yank the
scroll position around.

**Tag filter** (R4) composes with search rather than replacing it: a collapsible
"Tags" panel below the search box lists every distinct tag across the manifest
(alphabetical, in a scrollable `max-h-40` box so ~160 tags don't blow out the sidebar),
each one a toggle button. Selecting more than one tag is AND — every pick narrows
further, matching how a faceted filter reads. Selected tags also render as removable
chips above the panel, and a "Clear" control resets them in one click. The result count
("N results") now shows whenever EITHER a search query or a tag selection is active,
not just search.

Selection is synced to `?tag=` — a single comma-separated, alphabetically-sorted param
(`?tag=gltf,shadows`, not repeated `tag=` keys) via `useSearchParams`, so a filtered
sidebar view is one copy-pasteable URL. The search box's own query is deliberately
**not** URL-synced (matching the pre-R4 behavior) — only the tag selection was asked to
be shareable.

## Code view

`ExamplePage.tsx` (the `/examples/<slug>` route element, split out of `App.tsx` once it
needed local state) renders a "Code" toggle button that opens `CodePanel.tsx` — a
read-only source viewer over the right side of the canvas. Sources come from
`exampleSources.ts`, which wraps
`import.meta.glob('../examples/**/*.tsx', { query: '?raw', import: 'default' })`: every
file is a lazy `() => Promise<string>`, so opening the panel is the first time any
example's source text is actually fetched, and switching tabs on a multi-file example
fetches only the tab clicked.

A flat example (`src/examples/<category>/<slug>.tsx`) gets one tab. A folder-based
example is detected the same way `routes.ts`'s glob doesn't need to but this does: the
entry file's PARENT DIRECTORY NAME matches the slug
(`src/examples/compute/compute-water/compute-water.tsx`) — when it does, every `.tsx`
file in that folder becomes a tab (entry first, then alphabetical), not just the entry.

The panel itself is plain `<pre>` + a manual line-number gutter (a `<div>` per line,
sticky-positioned number column) — **no syntax highlighter**: neither `shiki` nor
`prismjs` is currently a dependency, and the task was explicitly no-new-dependencies.
Worth adding if this repo wants real highlighting — `shiki` over `prismjs` for its
TextMate-grammar fidelity on TSX/GLSL-in-template-strings, at the cost of a larger
bundle (mitigated by shiki's WASM-free "fine-grained" bundles, lazy-loadable the same
way the source text already is here).

Each tab has its own "view on GitHub" link (`githubBlobUrl`, reused from the action
row) and a "Copy" button (`navigator.clipboard.writeText`, with a 1.5s "Copied ✓"
confirmation).

**leva collision, found by the interactive click-through**: leva mounts into its own
portal at a very high z-index (the same reason `contact-sheet.mjs` has to hide it with
CSS rather than out-stacking it), so a normal in-tree panel can never cover it with
`z-index` alone — the Code toggle button and, on any example with visible leva
controls, the Copy button were both unclickable behind leva's panel. Fixed by hiding
leva (`display: none` via an injected `<style>`) for as long as the code panel is
open, the same technique `thumbs.mjs`/`contact-sheet.mjs` use for screenshots.

## Action row: what shipped and what didn't

Per `research/agent-open-buttons.md`'s v1 recommendation (also independently listed
in `docs/ROADMAP.md`'s M2 site bullet):

| Button               | Mechanism                                                 | Why                                                                                                                                                                                                                                                                                                                             |
| -------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GH** (source)      | `github.com/pmndrs/react-three-examples/blob/main/<path>` | Table stakes, zero auth, always works.                                                                                                                                                                                                                                                                                          |
| **SB** (StackBlitz)  | `stackblitz.com/github/<repo>/tree/main/<dir>`            | Best subfolder support of anything surveyed; zero auth.                                                                                                                                                                                                                                                                         |
| **VS** (vscode.dev)  | `vscode.dev/github/<repo>/blob/main/<path>`               | Zero-auth, zero-install code viewer; explicitly called out in the task brief.                                                                                                                                                                                                                                                   |
| **CS** (Codespaces)  | `codespaces.new/<repo>?quickstart=1`                      | Official badge pattern, near-zero cost to add alongside StackBlitz.                                                                                                                                                                                                                                                             |
| **CC** (Claude Code) | `claude.ai/code?repositories=<repo>&prompt=<...>`         | Only mechanism with a documented, stable query string carrying _both_ a real prompt and repo targeting.                                                                                                                                                                                                                         |
| **CX** (Cursor)      | `cursor://anysphere.cursor-deeplink/prompt?text=<...>`    | Best-effort: the deeplink is prompt-text-only (no repo/path params), so the clone URL and target path are spelled out in the prompt text itself. Rendered without `target="_blank"` — a custom protocol link paired with `target="_blank"` opens a stray blank tab in some browsers alongside the OS-level confirmation prompt. |

**Explicitly not built** (both per the research doc):

- **OpenAI Codex** — no URL-launch scheme exists; Codex tasks bind to a pre-provisioned
  server-side "environment" set up manually per repo, so a link would only dump a
  visitor on a generic landing page with no context.
- **CodeSandbox** — stopped accepting new repo imports April 2026, support wound down
  July 2026. Building against it would ship a dead button on day one.

`exampleFilePaths` in `routes.ts` is the single source for "where does this example's
code live" — StackBlitz opens the _containing folder_ of that path (its importer
takes a directory; for a flat single-file example that's `src/examples/`, for a
folder-based example it's that example's own folder), GitHub/vscode.dev open the file
directly.

## OG / meta tags

Two layers, because this is a client-rendered SPA with no per-route HTML:

- **`index.html`** carries static `description`/`og:*`/`twitter:*` tags — what a
  crawler that never runs JavaScript sees, for every URL on the site (there's only one
  real HTML document). `og:image` points at `%BASE_URL%og.jpg` — Vite's built-in HTML
  env-replacement syntax, so it resolves to `/og.jpg` locally and under a custom domain,
  `/react-three-examples/og.jpg` on GitHub Pages (see "Deploy" below) — a 1200x630 mosaic
  of example thumbnails, generated once via a throwaway Playwright script reusing
  `thumbs.mjs`'s
  launch recipe against a small HTML mosaic page rather than a single screenshot, since
  no one example represents the whole gallery. Not a committed script — regenerating
  it only matters when the thumbnail set changes substantially, and doing so is a
  five-minute rebuild from this description, not a maintained tool.
- **`useDocumentMeta.ts`** keeps `document.title` and the same meta names in sync on
  the client as the route changes — `ExamplePage.tsx` calls it with the current
  example's `ExampleMeta` (title -> `"<Title> — r3f-examples"`, description mentions
  the three.js original), `Home.tsx` calls it with no argument to reset to the site
  defaults. This is what makes the browser tab title and a same-tab share (e.g. a
  browser's own "Copy Link" / reading-list features that re-read `<head>` at share
  time) correct per example.

**What this does NOT fix**: a link unfurled by Slack, Discord, Twitter/X, etc. fetches
the URL with a plain HTTP client — no JS execution — so every `/examples/<slug>` link
unfurls with the SAME site-wide `index.html` tags, never the per-example ones. Real
per-route OG needs the HTML to differ per route at the HTTP-response level, which means
prerendering (or SSR, which this Vite SPA doesn't have). The smallest path to that on
GitHub Pages: a build step that, for each slug, renders the route (Playwright headless,
same recipe already in this repo) and writes the resulting `<head>` — or a static
`<meta>` block templated from `examples.json` — into a real
`examples/<slug>/index.html` file, so Pages serves distinct static HTML per example
without a server. `vite-plugin-ssr`/`vite-react-ssg`-style prerendering plugins do this
generically; given this repo builds its own Playwright-driven tooling already
(`contact-sheet.mjs`, `thumbs.mjs`), a small custom script following the same recipe is
more consistent with the rest of the toolchain than adding a prerendering framework
dependency.

## Deploy

R5 (docs/ROADMAP.md). This is a static Vite SPA — GitHub Pages serves it directly, no
server. Two things a subpath host needs that a root host doesn't: every asset/route URL
prefixed with the base path, and a fallback so a deep link 404 still boots the SPA.

- **Base path**: `vite.config.ts` sets `base: process.env.BASE_PATH ?? '/'` — unset (local
  `pnpm dev`/`pnpm build`) keeps today's root-relative `/assets/...` output. The
  `deploy.yml` workflow sets `BASE_PATH` to `vars.BASE_PATH` (a repository variable) or,
  if that's unset, `/<repo-name>/` — which is exactly the URL a GitHub Pages **project**
  site is served from (`https://pmndrs.github.io/react-three-examples/`).
  `<BrowserRouter basename={import.meta.env.BASE_URL}>` (`App.tsx`) makes react-router
  resolve `/examples/<slug>` under that same prefix; `Thumb.tsx`'s thumbnail `<img>` and
  `index.html`'s `og:image`/`twitter:image` (via `%BASE_URL%og.jpg`, Vite's built-in HTML
  env-replacement syntax — any `import.meta.env` key substitutes into HTML at build time)
  are the two other places a root-relative URL would otherwise 404 under a subpath.
  Nothing else in the shell hardcodes a leading `/` — internal navigation
  (`<Link to="/examples/...">`) goes through react-router, which prepends the basename
  itself.
- **SPA fallback**: Pages has no server-side rewrite, so a direct hit on
  `/examples/<slug>` 404s unless a `404.html` exists — Pages serves that file (still with
  a 404 status, but the browser renders its body) for any unknown path, and because
  `scripts/spa-fallback.mjs` makes it byte-identical to `index.html`, the SPA boots from
  whatever URL the browser already has and react-router takes it from there. Wired as a
  `postbuild` script (`package.json`), so every `pnpm build` produces `dist/404.html`,
  not just the deploy workflow's. `public/.nojekyll` (empty, committed) stops Pages'
  default Jekyll processing from ignoring the `_`-prefixed paths Vite can emit.
- **Workflow** (`.github/workflows/deploy.yml`): triggers on push to `main` and
  `workflow_dispatch`; mirrors `ci.yml`'s checkout/pnpm/node steps so the two don't drift.
  Build job uploads `dist/` via `actions/upload-pages-artifact`; a separate `deploy` job
  (environment `github-pages`) publishes it via `actions/deploy-pages`. `concurrency:
group: pages` means a newer push cancels an in-flight older deploy rather than queuing.
- **One-time manual step** (Dennis): Settings -> Pages -> Source: "GitHub Actions". The
  workflow does everything else; nothing before that click actually publishes.
- **Custom domain later** is a one-variable change, no workflow edit: set the repository
  variable `BASE_PATH` to `/` (Settings -> Secrets and variables -> Actions -> Variables),
  add `public/CNAME` containing the domain (e.g. `examples.pmnd.rs`), and point the
  domain's DNS at GitHub Pages per
  [GitHub's custom-domain docs](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site).
  `scripts/spa-fallback.mjs` and the base-path plumbing above need no changes either way
  — they're already parameterized on `BASE_PATH`.
- **Verified locally** (not achievable in this environment: the actual Pages
  environment/DNS/Jekyll behavior itself): `BASE_PATH=/react-three-examples/ pnpm build`
  produces `dist/404.html` and every asset/OG URL in `dist/index.html` prefixed with
  `/react-three-examples/`; a plain `pnpm build` (no `BASE_PATH`) is unchanged from
  before this change (`/assets/...`, root `/og.jpg`). A throwaway static server mapping
  `/react-three-examples/*` to `dist/*` (404.html fallback for unknown paths), driven with
  Playwright using `contact-sheet.mjs`'s launch recipe, confirmed: the home gallery
  renders with a loading thumbnail (`naturalWidth > 0`) under the prefix; a direct deep
  link to `/react-three-examples/examples/lights-phong` (exercising the 404-fallback +
  `basename` path together) reaches `window.__exampleReady === true` on a real `webgpu`
  canvas context; and a sidebar nav click keeps the prefix in the URL.

## A note on doc drift

This work was scoped against a newer `AGENTS.md`/`SPEC.md` (dated 2026-09-01, with a
"House style" section, category folders, and a Prettier `semi: true` convention) than
what's actually checked into this worktree — this checkout's `AGENTS.md` is the
2026-07-29 (v0.26) "Layer 1 / Layer 2" version, `SPEC.md` is v1.0 (2026-07-26), there
is no Prettier config, and the existing code (including every file this shell touches
before this change) writes **no semicolons**. New code in this change matches what's
actually here — no semicolons — rather than the newer doc's stated convention, for
consistency with the ~30 existing shell/util files and all 131 example files. If/when
this worktree's branch is rebased onto the newer main, that's a mechanical
`pnpm format`-equivalent pass away (there's no formatter configured yet to do it
automatically) — not a design decision this file needs to re-litigate.

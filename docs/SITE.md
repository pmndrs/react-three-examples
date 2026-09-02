# Site shell — contract

> Companion to [SPEC.md](SPEC.md) §9 ("Site") and §6 ("Agent-facing design"). SPEC
> states the *goals* for the shell; this doc records what was actually built and the
> decisions behind it, the way AGENTS.md does for examples. Amend it here when the
> shell changes shape — don't let it go stale the way a couple of other docs in this
> repo did against a newer AGENTS.md (see "A note on doc drift" below).

## What's here

- `src/app/Home.tsx` — landing page at `/` (previously a bare redirect to the first
  example). Leads with what the repo is, links to GitHub, then the full gallery
  grouped by category.
- `src/app/Layout.tsx` — sidebar: grouped-by-category nav + live substring search.
- `src/app/Titleblock.tsx` — per-example overlay: title, three.js original link,
  credits, and the "open in ..." action row.
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

| From | To | Occurrences |
| --- | --- | --- |
| `post-processing` | `postprocessing` | 10 |
| `shadow` | `shadows` | 2 |
| `texture` | `textures` | 3 |
| `reflector` | `reflection` | 2 |
| `glTF` | `gltf` | 1 |
| `compressed-textures` | `compression` | 1 |
| `data-3d-texture` | `3d-texture` | 1 |
| `envmap` | `environment` | 2 |
| `render-to-texture` | `render-target` | 5 |
| `webgpu` | *(dropped)* | 1 — redundant, every example in this repo is WebGPU |

**Casing normalized** (camelCase / smashed-compound outliers, kebab-cased to match
the other ~165 tags — e.g. `pointlight` → `point-light`, `lightsNode` →
`lights-node`, `cameraHelper` → `camera-helper`; 15 tags, see `TAG_RENAME` for the
full list).

Net: **172 → 162 distinct tags.** Deliberately *not* merged, even though they look
similar at a glance: general/specific pairs that are a real, useful pattern
throughout the existing vocabulary (`environment` + `hdr`, `loader` + `gltf`/`obj`/
`ply`/`fbx`, `lines` + `line2`) — collapsing those would lose a real filter
distinction, not just a spelling.

## Home page: no screenshot dependency

`screenshots/` (written by `pnpm shot`) is git-ignored and not served by Vite (no
`public/` directory copies it in) — so it exists locally for the contact-sheet
review workflow but is **not available at build time or on a deployed site**. The
task brief anticipated this ("if not, a clean text/card grid is fine"). The home
page and sidebar therefore use a flat color accent per category
(`categoryAccent` in `manifest.ts`, one hex per category spread across the wheel)
instead of a thumbnail. If screenshots get committed or built into `public/` later,
swap `ExampleCard`'s gradient div for an `<img src={`/screenshots/${slug}.png`}>`
with the gradient as an `onError` fallback — nothing else needs to change.

## Sidebar search

Plain substring match over title, slug, tags, and category — no search library, no
fuzzy matching, no index; 131 items is nowhere near where that would matter
(`Layout.tsx`, `useMemo`d on the query string). Matching groups collapse to zero
entries rather than staying open empty. The active example's `NavLink` gets a ref
that's scrolled into view (`scrollIntoView({ block: 'nearest' })`) on navigation —
deliberately *not* on every keystroke, so typing a search query doesn't yank the
scroll position around.

## Action row: what shipped and what didn't

Per `research/agent-open-buttons.md`'s v1 recommendation (also independently listed
in `docs/ROADMAP.md`'s M2 site bullet):

| Button | Mechanism | Why |
| --- | --- | --- |
| **GH** (source) | `github.com/pmndrs/react-three-examples/blob/main/<path>` | Table stakes, zero auth, always works. |
| **SB** (StackBlitz) | `stackblitz.com/github/<repo>/tree/main/<dir>` | Best subfolder support of anything surveyed; zero auth. |
| **VS** (vscode.dev) | `vscode.dev/github/<repo>/blob/main/<path>` | Zero-auth, zero-install code viewer; explicitly called out in the task brief. |
| **CS** (Codespaces) | `codespaces.new/<repo>?quickstart=1` | Official badge pattern, near-zero cost to add alongside StackBlitz. |
| **CC** (Claude Code) | `claude.ai/code?repositories=<repo>&prompt=<...>` | Only mechanism with a documented, stable query string carrying *both* a real prompt and repo targeting. |
| **CX** (Cursor) | `cursor://anysphere.cursor-deeplink/prompt?text=<...>` | Best-effort: the deeplink is prompt-text-only (no repo/path params), so the clone URL and target path are spelled out in the prompt text itself. Rendered without `target="_blank"` — a custom protocol link paired with `target="_blank"` opens a stray blank tab in some browsers alongside the OS-level confirmation prompt. |

**Explicitly not built** (both per the research doc):

- **OpenAI Codex** — no URL-launch scheme exists; Codex tasks bind to a pre-provisioned
  server-side "environment" set up manually per repo, so a link would only dump a
  visitor on a generic landing page with no context.
- **CodeSandbox** — stopped accepting new repo imports April 2026, support wound down
  July 2026. Building against it would ship a dead button on day one.

`exampleFilePaths` in `routes.ts` is the single source for "where does this example's
code live" — StackBlitz opens the *containing folder* of that path (its importer
takes a directory; for a flat single-file example that's `src/examples/`, for a
folder-based example it's that example's own folder), GitHub/vscode.dev open the file
directly.

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

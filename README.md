# react-three-examples

### [**→ Browse the gallery**](https://pmndrs.github.io/react-three-examples/)

The official [three.js examples](https://threejs.org/examples/), rebuilt in idiomatic
[React Three Fiber](https://github.com/pmndrs/react-three-fiber) v10 — WebGPU-first.

**The point:** show that the same demo is _clearer_ in React than in vanilla three.js.
Same GPU, same techniques, less ceremony. A port that ends up longer, more indirect or
more imperative than the original has failed, even if it renders perfectly.

**268 examples across 17 categories**, every one linking back to its three.js original —
this is a companion to the three.js examples, not a fork of them. Measured against the
originals they port, the corpus is **17% fewer code lines and 25% fewer non-whitespace
characters**; 251 of 262 comparable examples are smaller by content. The gap is lopsided
by category, and that is expected: scene-graph and event-driven demos collapse hard in
JSX, while shader-graph and pipeline demos land near parity because the graph is
irreducible work either way.

## Run it

```bash
pnpm install
pnpm dev          # http://localhost:5173
```

Requires a WebGPU-capable browser (Chrome/Edge 113+, Safari 18+). The whole gallery is a
single Vite app; each example owns its own `<Canvas>`.

## Commands

| command                     | what it does                                                                |
| --------------------------- | --------------------------------------------------------------------------- |
| `pnpm dev`                  | Vite dev server on 5173                                                     |
| `pnpm build`                | typecheck + production build (+ `404.html` SPA fallback)                    |
| `pnpm lint`                 | eslint **and** `prettier --check`                                           |
| `pnpm format`               | prettier `--write`                                                          |
| `pnpm test:changed <slug>`  | smoke + animates for one example                                            |
| `pnpm test:smoke`           | readiness / real `webgpu` context / non-black / clean console, all examples |
| `pnpm test:animates`        | two-frame pixel diff — catches freezes smoke can't see                      |
| `pnpm shot <slug>`          | screenshot to `screenshots/` (`SHOT_DELAY_MS` to capture later)             |
| `pnpm shot:original <name>` | screenshot the LIVE three.js original, the review oracle                    |
| `pnpm compare <slug>`       | our code lines **and** chars vs the original's                              |
| `pnpm thumbs [slug…]`       | gallery thumbnails into `public/thumbs/` (`--force`, `--check-black`)       |
| `pnpm inventory`            | regenerate `docs/DEMO-INVENTORY.md` — every r185 example, one bucket        |
| `pnpm generate:manifest`    | rebuild `category` + normalise tags in `examples.json`                      |

## Layout

```
src/examples/<category>/<slug>.tsx              one-file example
src/examples/<category>/<slug>/<slug>.tsx       example with subcomponents
src/app/                                        the gallery shell (home, sidebar, code view, titleblock)
src/examples.json                               the manifest — slug, title, category, tags, credits
public/thumbs/                                  generated gallery thumbnails
```

Routes are always `/examples/<slug>` — the category never appears in the URL. The router
identifies entry files by matching their **basename** against the manifest, so nesting
depth can change without touching routing.

## Deploy

Pushing to `main` publishes the gallery to GitHub Pages
(`.github/workflows/deploy.yml`). The build is base-path-aware (`BASE_PATH` env var /
`vars.BASE_PATH` repo variable), so the same build works at the project-site URL
(`https://pmndrs.github.io/react-three-examples/`, the default) or at a custom domain
(`vars.BASE_PATH=/` + `public/CNAME`) with no code change. Details:
[docs/SITE.md](docs/SITE.md) "Deploy".

## Scope

Of the **588** examples three.js ships in r185, **310 are worth a page here** and **279
are done** (267 with their own page, 12 folded into combined pages). The rest are
duplicates of a `webgpu_` twin, renderer-internal or benchmark pages, or skipped with a
recorded reason — every one of the 588 is accounted for in
[docs/DEMO-INVENTORY.md](docs/DEMO-INVENTORY.md), which is generated, not hand-kept.

- **Phase 1 — the `webgpu_*` set: COMPLETE.** 198 of 214 ported, 13 excluded, 3 deferred
  ([docs/PORTING-BACKLOG.md](docs/PORTING-BACKLOG.md)). The excluded ones exercise
  renderer internals or measure throughput rather than teaching a visual technique, so a
  React port would demonstrate nothing about R3F; the TSL editor, transpiler and graph
  pages are tooling UIs whose interface _is_ the demo.
- **Phase 2 — curated webgl-only examples: COMPLETE.** 70 ported, 2 blocked on
  third-party packages ([docs/PORTING-BACKLOG-PHASE2.md](docs/PORTING-BACKLOG-PHASE2.md)).
  This is where React wins biggest: these ports average **32% fewer lines** than their
  originals.
- **webaudio: shipped** — 5 examples in the `audio` category, gated behind the same
  click-to-start overlay the originals use.
- **WebXR (29): deferred.** Nothing here can enter an XR session, `@react-three/xr` has
  no v10 branch, and today even the `webgpu_xr_*` originals swap in a WebGL renderer at
  session start — a swap fiber cannot express. Revisit when `XRGPUBinding` ships.

## Docs

| file                                                             | what it is                                              |
| ---------------------------------------------------------------- | ------------------------------------------------------- |
| [AGENTS.md](AGENTS.md)                                           | **house style + v10 idioms — the operational contract** |
| [docs/SPEC.md](docs/SPEC.md)                                     | the project contract                                    |
| [docs/ROADMAP.md](docs/ROADMAP.md)                               | milestones and the road to 1.0                          |
| [docs/HANDOFF.md](docs/HANDOFF.md)                               | session-by-session state                                |
| [docs/REVIEW-QUEUE.md](docs/REVIEW-QUEUE.md)                     | judgment calls waiting on a human                       |
| [docs/UPSTREAM.md](docs/UPSTREAM.md)                             | patch ledger + 54 upstream fix briefs                   |
| [docs/upstream-issues/](docs/upstream-issues/)                   | long-form write-up behind each brief                    |
| [docs/DEMO-INVENTORY.md](docs/DEMO-INVENTORY.md)                 | all 588 r185 examples, each in exactly one bucket       |
| [docs/SITE.md](docs/SITE.md)                                     | the gallery shell                                       |
| [docs/PORTING-BACKLOG.md](docs/PORTING-BACKLOG.md)               | Phase 1 ledger                                          |
| [docs/PORTING-BACKLOG-PHASE2.md](docs/PORTING-BACKLOG-PHASE2.md) | Phase 2 ledger                                          |

If you're contributing a port, read AGENTS.md first — it is the file that decides whether
a port is good.

## Upstream

Porting 268 examples surfaced a lot of alpha-era bugs. Every one is written up as a
self-contained brief in [docs/UPSTREAM.md](docs/UPSTREAM.md) — evidence, root-cause line,
suggested fix, and the workaround this repo carries — with the long-form write-up in
[docs/upstream-issues/](docs/upstream-issues/). Several have already been fixed upstream
and are marked retired. The current findings went to the maintainers directly, so check
before filing anything from them; a brief that turns out stale or wrong is worth a pull
request against the ledger either way.

## Stack

`@react-three/fiber` 10.0.0-alpha.4 · `@react-three/drei` 11.0.0-alpha.7 ·
`three` 0.185.1 · React 19.2 · TypeScript · Tailwind v4 · Vite · leva.

Alpha-era pins: versions matter, and `AGENTS.md` records why each is pinned.

## Credits

Every example credits its original author and assets in the titleblock, sourced from
`examples.json`. The three.js examples are by [mrdoob](https://github.com/mrdoob) and the
three.js contributors.

## License

[MIT](LICENSE). The three.js examples these port from are MIT-licensed too; assets are
hotlinked from the three.js repo at its r185 tag, not vendored.

# react-three-examples

The official [three.js examples](https://threejs.org/examples/), rebuilt in idiomatic
[React Three Fiber](https://github.com/pmndrs/react-three-fiber) v10 — WebGPU-first.

**The point:** show that the same demo is _clearer_ in React than in vanilla three.js.
Same GPU, same techniques, less ceremony. A port that ends up longer, more indirect or
more imperative than the original has failed, even if it renders perfectly.

263 examples across 16 categories. Every one links back to its three.js original — this
is a companion to the three.js examples, not a fork of them.

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
| `pnpm build`                | typecheck + production build                                                |
| `pnpm lint`                 | eslint **and** `prettier --check`                                           |
| `pnpm format`               | prettier `--write`                                                          |
| `pnpm test:changed <slug>`  | smoke + animates for one example                                            |
| `pnpm test:smoke`           | readiness / real `webgpu` context / non-black / clean console, all examples |
| `pnpm test:animates`        | two-frame pixel diff — catches freezes smoke can't see                      |
| `pnpm shot <slug>`          | screenshot to `screenshots/` (`SHOT_DELAY_MS` to capture later)             |
| `pnpm shot:original <name>` | screenshot the LIVE three.js original, the review oracle                    |
| `pnpm compare <slug>`       | our code lines **and** chars vs the original's                              |
| `pnpm generate:manifest`    | rebuild `category` + normalise tags in `examples.json`                      |

## Layout

```
src/examples/<category>/<slug>.tsx              one-file example
src/examples/<category>/<slug>/<slug>.tsx       example with subcomponents
src/app/                                        the gallery shell (home, sidebar, titleblock)
src/examples.json                               the manifest — slug, title, category, tags, credits
```

Routes are always `/examples/<slug>` — the category never appears in the URL. The router
identifies entry files by matching their **basename** against the manifest, so nesting
depth can change without touching routing.

## Scope

- **Phase 1 — the `webgpu_*` set: COMPLETE.** 197 of 214 r185 examples ported, 10
  excluded, 7 deferred ([docs/PORTING-BACKLOG.md](docs/PORTING-BACKLOG.md)).
- **10 examples are deliberately excluded**: `sandbox`, `test-memory`, `performance`,
  `performance-renderbundle`, `pmrem-test`, `furnace-test`, `compile-async`,
  `multisampled-renderbuffers`, `reversed-depth-buffer`, `centroid-sampling`. They
  exercise renderer internals or measure throughput rather than teaching a visual
  technique, so a React port of them would demonstrate nothing about R3F. Rationale and
  the two arguable cases are in [docs/SPEC.md](docs/SPEC.md) §4.
- **Phase 2 (webgl-only examples, curated): 66 of 72 ported so far, 6 review-queued**
  ([docs/PORTING-BACKLOG-PHASE2.md](docs/PORTING-BACKLOG-PHASE2.md)). WebXR (26) + webaudio
  (4) are a separate final phase Dennis verifies by hand — nothing here can enter an XR
  session. The Patterns track is described in the spec.

## Docs

| file                                               | what it is                                              |
| -------------------------------------------------- | ------------------------------------------------------- |
| [AGENTS.md](AGENTS.md)                             | **house style + v10 idioms — the operational contract** |
| [docs/SPEC.md](docs/SPEC.md)                       | the project contract                                    |
| [docs/ROADMAP.md](docs/ROADMAP.md)                 | milestones                                              |
| [docs/HANDOFF.md](docs/HANDOFF.md)                 | session-by-session state                                |
| [docs/UPSTREAM.md](docs/UPSTREAM.md)               | patch ledger + agent-ready upstream fix briefs          |
| [docs/SITE.md](docs/SITE.md)                       | the gallery shell                                       |
| [docs/PORTING-BACKLOG.md](docs/PORTING-BACKLOG.md) | what's left to port                                     |

If you're contributing a port, read AGENTS.md first — it is the file that decides whether
a port is good.

## Stack

`@react-three/fiber` 10.0.0-alpha.4 · `@react-three/drei` 11.0.0-alpha.6 ·
`three` 0.185.1 · React 19.2 · TypeScript · Tailwind v4 · Vite · leva.

Alpha-era pins: versions matter, and `AGENTS.md` records why each is pinned.

## Credits

Every example credits its original author and assets in the titleblock, sourced from
`examples.json`. The three.js examples are by [mrdoob](https://github.com/mrdoob) and the
three.js contributors.

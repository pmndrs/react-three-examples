# `createRoot` warning recurring with NO suspending hook present (possible new manifestation of the fixed #3850)

**Versions**: `@react-three/fiber@10.0.0-alpha.4`, `three@0.185.1`

> Filed despite B17's original mechanism being RETIRED/FIXED, per explicit instruction
> to flag a live regression prominently. This is NOT a re-opening of #3850 — the
> ORIGINAL mechanism (ungated Suspense boundary reaching `<Canvas>`) is confirmed fixed
> by source read: `createRoot()` (`node_modules/@react-three/fiber/dist/webgpu/index.mjs:14108`)
> now reuses `prevFiber`/`prevStore` when called again for the same canvas element,
> instead of tearing down and rebuilding. This issue is about a DIFFERENT trigger shape
> producing the SAME warning, currently live and unresolved in this repo's own corpus.

## Observed vs expected

- **Observed**: this repo's `src/examples.json` carries, for the `geometry-loft`
  example (slug used internally as "17-exhibit"):
  ```json
  "ciSkip": "17-exhibit shader-graph compile + B17 open anomaly (createRoot warning with no suspending hook) exceeds readiness on SwiftShader; passes on Metal",
  "animationWindowMs": 4500,
  "animatesSkip": "B17 open anomaly: createRoot warning with no suspending hook (UPSTREAM B17); animates but loop degraded — upstream investigation"
  ```
  i.e. the `R3F.createRoot should only be called once!` warning is firing in a scene
  that, per the comment, has **no suspending hook at all** — a shape the original
  #3850 report (which required an ungated `<Suspense>` boundary between a suspending
  child and `<Canvas>`) does not cover.
- **Expected**: `createRoot` should only warn/re-enter when the canvas element is
  legitimately being re-mounted through React's normal lifecycle (e.g. StrictMode's
  double-invoke), never during ordinary steady-state rendering of a scene with no
  suspending resources.

## Minimal reproduction

Not fully isolated — the repo's own investigation is still open ("upstream
investigation" per the `animatesSkip` comment). The affected example is
`src/examples/geometry/geometry-loft.tsx` (three.js original:
`webgpu_geometry_loft`), which compiles a nontrivial TSL shader graph but, per the
comment, does not suspend. Reproducing standalone would need: mount that scene under
Playwright/SwiftShader (where it's `ciSkip`'d) or under real Metal (where it "passes"
but the loop is reportedly "degraded").

## Root cause

Unknown/unconfirmed by static read — this needs the actual failing case isolated
first. Worth checking whether `createRoot`'s reuse-guard (see Observed above) is being
triggered by something OTHER than a Suspense re-entry — e.g. a shader-compile-driven
re-render path, HMR, or React 19.2's Activity/offscreen APIs re-invoking the canvas
lifecycle without an actual suspension.

## Proposed fix

Isolate a standalone repro (ideally with `console.trace()` at the `createRoot`
warning site to capture the call stack triggering the second `createRoot` call), then
file as a fresh, narrowly-scoped issue distinct from #3850.

## Workaround

`geometry-loft` is marked `ciSkip` (SwiftShader only; passes on Metal) and
`animatesSkip` in `src/examples.json` pending investigation. No code-level workaround
yet — this is tracked as an open anomaly, not resolved.

## Prior art

- **#3850** (closed 2026-08-14, fix branch `fix/3850-suspense-root-teardown` merged to
  `v10`) — covers the ORIGINAL, different-triggering-condition version of this warning.
  Does not appear to cover this shape (no suspending hook).
- No other issue matching "createRoot warning no suspense", "createRoot warning", or
  "loft" was found via `gh search issues`.

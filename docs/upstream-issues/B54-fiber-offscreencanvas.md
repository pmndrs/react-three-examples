### Title

Feature request: documented/validated `createRoot` + worker story for OffscreenCanvas on the `/webgpu` (v10) entry

### Type

Feature request / documentation gap — **not** a bug report. The underlying primitive
(`createRoot(offscreenCanvas)`) already works per a 2023 fix (PR #2770); what's missing is a
current, documented, v10/WebGPU-validated path for the worker + event-forwarding half of the
story.

### Motivation

We maintain a corpus of React Three Fiber v10 (`@react-three/fiber@10.0.0-alpha.4`,
`/webgpu` entry) ports of the official three.js examples. One official example,
`webgl_worker_offscreencanvas.html`, transfers an `OffscreenCanvas` to a Web Worker and
renders a self-contained three.js scene against it entirely off the main thread. We'd like to
port it (as a WebGPU-renderer scene, matching this corpus's WebGPU-first convention), but
there is currently no first-party fiber guidance on:

1. whether `createRoot()` on the `/webgpu` entry is safe to call inside a dedicated Worker
   with no `window`/`document` at all (versus the WebGL-era `createRoot` that #2770 fixed), and
2. how a worker-hosted root is supposed to receive resize/pointer input, since a transferred
   `OffscreenCanvas` never receives real browser-dispatched events itself.

### What exists today (found via source inspection, `@react-three/fiber@10.0.0-alpha.4`)

- `createRoot` is typed to accept `HTMLCanvasElement | OffscreenCanvas`
  (`dist/webgpu/index.d.mts:3233`).
- `computeInitialSize()` has a real runtime branch for `canvas instanceof OffscreenCanvas`,
  reading `canvas.width`/`canvas.height` directly (no `parentElement`/`getBoundingClientRect`
  dependency) — this is intentional OffscreenCanvas support, not a type-only shim.
  (`dist/webgpu/index.mjs`, `computeInitialSize`)
- `useIsomorphicLayoutEffect` and the default DPR calculation both guard
  `typeof window !== "undefined"` and degrade gracefully (to `useEffect`, to DPR `1`) rather
  than throwing when `window` is absent — i.e., genuinely worker-safe on those two paths.
- This traces back to real, merged upstream work: PR #2770 ("fix: play nice with
  OffscreenCanvas", fixing issue #2765 `createRoot errors with 'HTMLCanvasElement is not
defined'`), PR #2495 ("don't updateStyle on offscreen canvas"), PR #2493 ("Use `self` to get
  global context before `window` in `getEventPriority`") — all merged, all WebGL-era but
  apparently carried forward into the `/webgpu` build we inspected.
- A **separate community package**, `@react-three/offscreen` (`pmndrs/react-three-offscreen`
  on GitHub, published on npm — latest stable `0.0.8`, prerelease `1.0.0-rc.1`, last published
  2025-01-30) already implements the higher-level pieces: a drop-in `<Canvas worker={worker}
fallback={<Scene/>}>`, worker-side `render()`, DOM event forwarding, and a basic
  document/window shim. Its README explicitly claims it works with Drei, Rapier, and
  postprocessing. **Its peer dependency is `@react-three/fiber: ">=8.0.0"` with no verified
  upper bound**, and nothing in its repo/README confirms it has been exercised against v10's
  `/webgpu` entry or `WebGPURenderer` at all.

### What's missing

- No documentation anywhere in `@react-three/fiber`'s own docs (checked this repo's
  `reference/react-three-fiber` clone of `docs/webgpu/*.mdx`, which is the only v10 API
  documentation that exists per our own house conventions) mentioning `createRoot` +
  `OffscreenCanvas` at all, on either the legacy or `/webgpu` entry.
- No confirmation that `WebGPURenderer` construction against an `OffscreenCanvas`'s
  `getContext('webgpu')` inside a dedicated Worker actually succeeds (`navigator.gpu` is
  spec'd to be available in dedicated workers, but this was not independently verified as
  part of this research — flagging as an open question rather than a known-working or
  known-broken fact).
- No first-party (or confirmed-current third-party) answer for event/resize forwarding
  specific to the `/webgpu` entry's event system (`createPointerEvents`/`createEvents`).

### Proposed API shape (strawman, for discussion — not a demand)

Given the primitive already works, this may be closer to a docs ask than a code ask:

```ts
// worker.ts — already works today per #2770's repro, just undocumented for v10/webgpu:
import { createRoot } from '@react-three/fiber/webgpu';
const root = createRoot(offscreenCanvas); // OffscreenCanvas transferred in via postMessage
root.configure({ size: { width, height }, dpr: [1, 2] });
root.render(<Scene />);

// main.ts — the part with no first-party story:
const offscreen = canvas.transferControlToOffscreen();
worker.postMessage({ canvas: offscreen, width, height, dpr: devicePixelRatio }, [offscreen]);
// on resize / pointer events: postMessage a serializable subset to the worker,
// worker-side: synthesize into whatever createPointerEvents expects, or expose a
// documented `root.dispatchEvent(syntheticEvent)`-shaped hook for this purpose.
```

If the intended answer is "use `@react-three/offscreen`," we'd ask for that to be stated
explicitly in docs, along with confirmation (or a tracked gap) of its v10/WebGPU compatibility
— today a v10 user has to reverse-engineer both of these independently to find out.

### Prior art / discussion found

- Issue #280 "offscreencanvas" (closed, no resolution beyond discussion)
- PR #2770 "fix: play nice with OffscreenCanvas" (merged) — the core primitive this all rests on
- PR #2845 "offscreen support" (closed, unmerged, +512/−0, by drcmda) — spawned the separate
  `@react-three/offscreen` package instead of landing in core
- PR #2773 "use width and height from offscreen canvas" (closed, unmerged)
- PR #2309 "feat: export create-events" (merged) — building block for userland event bridging
- `@react-three/offscreen` (`pmndrs/react-three-offscreen`, npm `0.0.8`/`1.0.0-rc.1`) — existing
  higher-level package; compatibility with v10/`/webgpu` unconfirmed

### Offer

Happy to help validate — we can test `createRoot(offscreenCanvas)` against `/webgpu` inside an
actual dedicated Worker, and/or try `@react-three/offscreen` against our v10 alpha.4 stack, and
report back findings if that's useful groundwork for deciding docs-only vs. real code changes.

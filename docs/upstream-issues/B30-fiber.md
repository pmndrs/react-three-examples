# `useRenderPipeline` registers passes as `Record<string, any>` — every read-back needs a cast

**Versions**: `@react-three/fiber@10.0.0-alpha.4`, `three@0.185.1`

> Status note: as of this audit, `v10` HEAD (unpublished — 14 commits ahead of the
> installed alpha.4, including merged PR **#3901** "Harden render and node types",
> 2026-09-04) already narrows `PassRecord`/`RegisteredPasses` values from `any` to
> three's `Node` type — but EXPLICITLY, by documented design, does not make the hook
> generic per-key. See Prior art. This issue documents the gap as still published/open,
> and the narrower ask (full genericity) as apparently declined upstream.

## Minimal reproduction

```tsx
import { useRenderPipeline } from '@react-three/fiber/webgpu';
import { bloom } from 'three/tsl';
import type { BloomNode } from 'three/webgpu';

function Effects() {
  useRenderPipeline(({ renderPipeline, passes, scene, camera }) => {
    const bloomPass = bloom(passes.scenePass.getTextureNode());
    renderPipeline.outputNode = bloomPass;
    return { bloomPass }; // registers into state.passes
  });

  // Elsewhere — reading it back:
  const { passes } = useRenderPipeline();
  // `passes.bloomPass` types as `any` (installed alpha.4) — no autocomplete, no
  // type safety, and this cast is required to get either back:
  const typed = passes.bloomPass as BloomNode | undefined;
  return null;
}
```

## Observed vs expected

- **Observed** (installed, published alpha.4): `useRenderPipeline(mainCB?, setupCB?)`
  is not generic over what `mainCB`/`setupCB` return. `PassRecord = Record<string, any>`,
  so anything registered via the callbacks' return value comes back as `any` when read
  from `passes` elsewhere (`useThree()`, or `useRenderPipeline()`'s own return).
- **Expected** (per the original brief): the hook should be generic, inferring the
  registered pass shape from `mainCB`'s return type, so `passes.bloomPass` types as
  `BloomNode` directly with no read-site cast.

## Root cause

Packaged output at `node_modules/@react-three/fiber/dist/webgpu/index.d.ts:1341,1355,4124`:

```ts
type PassRecord = Record<string, any>;
type RenderPipelineMainCallback = (state: RenderPipelineCallbackState) => PassRecord | void;
declare function useRenderPipeline(
  mainCB?: RenderPipelineMainCallback,
  setupCB?: RenderPipelineSetupCallback,
): UseRenderPipelineReturn;
```

`RenderPipelineMainCallback`/`RenderPipelineSetupCallback` are fixed function types,
not generic over the hook's own type parameter — `useRenderPipeline` takes no type
argument.

## Proposed fix

Make `useRenderPipeline` generic, inferring the passes shape from what `mainCB`
(and/or `setupCB`) return, e.g.:

```ts
declare function useRenderPipeline<T extends Record<string, Node> = Record<string, Node>>(
  mainCB?: (state: RenderPipelineCallbackState) => T | void,
  setupCB?: (state: RenderPipelineCallbackState) => Record<string, Node> | void,
): UseRenderPipelineReturn<T>;
```

## Workaround

This repo casts at every read site rather than fighting the type:
`passes.xPass as ReturnType<typeof x> | undefined` — house style explicitly exempts
this cast from the "casts are a bug report" rule (AGENTS.md § Known typed-TSL gaps),
since `PassRecord = Record<string, any>` gives the cast something to add information
to, not something to hide an error behind.

## Prior art

**PR #3901** ("Harden render and node types", merged 2026-09-04, NOT yet in a
published npm release) already changes this area, but takes a documented, deliberate
middle path rather than making the hook generic:

```ts
// packages/fiber/types/renderPipeline.d.ts, v10 HEAD
interface PassRecord {
  scenePass?: ScenePassNode;
  [key: string]: import('three/webgpu').Node;
}
// comment: "Every other key is user-registered ... Node is the common base, so that
// is the bound. Narrow at the call site when you need a member, e.g.
// `passes.velocity as TextureNode`."
```

So upstream has already moved `any` → `Node` (meaningfully less unsafe — the cast now
narrows from a real base type instead of `any`), but the PR's own doc comment reads as
an explicit decision AGAINST the full per-key generic inference this brief originally
asked for, preferring the simpler bounded-record shape with narrowing casts at call
sites (matching what this repo already does). Recommend NOT filing a new issue asking
for full genericity — that specific ask appears to have already been considered and
declined in favor of the `Node`-bound approach. If anything, file a much narrower
request: publish a release containing #3901 so downstream consumers get the `any` →
`Node` improvement.

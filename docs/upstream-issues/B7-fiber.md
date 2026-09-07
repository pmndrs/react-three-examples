# `render-pipeline.mdx`'s "Prefer Uniforms" snippet fails strict TypeScript (depends on B1)

**Versions**: `@react-three/fiber@10.0.0-alpha.4`, `three@0.185.1`, `typescript@^6`

> Note: this narrows the original B7 brief. Re-verification found that the brief's OTHER
> claim — "mainCB param `renderPipeline` typed nullable but no snippet guards it" — is now
> **false** against installed alpha.4: `RenderPipelineCallbackState.renderPipeline` is
> already `ThreeRenderPipeline` (non-null), not `ThreeRenderPipeline | null`
> (`node_modules/@react-three/fiber/dist/webgpu/index.d.ts:1345`). Only the
> bloom-uniform half of the original brief still reproduces, and only because B1 is
> still open — this issue exists to be filed/tracked/closed together with B1.

## Minimal reproduction

Taken from `reference/react-three-fiber/docs/webgpu/render-pipeline.mdx`, "Prefer
Uniforms for Dynamic Values":

```tsx
import { useRenderPipeline, useUniforms } from '@react-three/fiber/webgpu';
import { bloom } from 'three/tsl';
import { useControls } from 'leva';

function Effects() {
  const { intensity } = useControls({ intensity: 1.0 });
  const { uIntensity } = useUniforms(() => ({ uIntensity: intensity }));

  useRenderPipeline(({ renderPipeline, passes, uniforms }) => {
    // Fails: uIntensity is UniformNode<unknown, unknown> (B1), bloom() wants
    // Node<'float'> | number for its strength argument.
    renderPipeline.outputNode = bloom(passes.scenePass.getTextureNode(), uniforms.uIntensity);
  });
  return null;
}
```

## Observed vs expected

- **Observed**: `uniforms.uIntensity` types as `UniformNode<unknown, unknown>` (see
  B1), which does not satisfy `bloom()`'s `strength: Node<'float'> | number` parameter
  — "No overload matches this call" under strict tsc.
- **Expected**: the doc's own recommended pattern (drive dynamic pipeline values
  through uniforms rather than closure values) should typecheck without a cast, since
  it is the pattern the docs explicitly recommend as the correct one.

## Root cause

Entirely downstream of B1 (`useUniforms`'s `UniformNode<T> = UniformNode<unknown, T>`
alias, `node_modules/@react-three/fiber/dist/webgpu/index.d.ts` — see that issue for
the exact packaged-output lines). No independent root cause in
`useRenderPipeline`/`render-pipeline.mdx` itself once B1 is accounted for.

## Proposed fix

Fix B1. Once `useUniforms` preserves per-key TSL node types, this snippet typechecks
with no changes needed to `render-pipeline.mdx` or `useRenderPipeline`'s own types.

## Workaround

This repo's B1 patch (`scripts/patch-fiber-types.mjs`) makes the equivalent pattern
typecheck project-wide; no separate `useRenderPipeline`-specific workaround exists or
is needed.

## Prior art

No issue specifically about this doc snippet was found. Track together with B1's prior
art (#3769, #3886, #3887) — fixing any of those closes this one as a side effect.
Separately, `v10` HEAD (merged, unpublished PR **#3901** "Harden render and node
types") already discriminates `UseRenderPipelineReturn` on `isReady` for the _read-only_
access pattern (`const { renderPipeline } = useRenderPipeline()`), which improves the
half of B7 concerning nullable `renderPipeline` ergonomics — but that was already the
non-nullable mainCB case here, so #3901 doesn't touch this specific snippet.

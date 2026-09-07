# `RootState.camera` is narrowed to `OrthographicCamera | PerspectiveCamera` but still needs a cast for `.fov`/`.aspect`

**Versions**: `@react-three/fiber@10.0.0-alpha.4`, `three@0.185.1`, `typescript@^6`

> Status note: this narrows the original B31 brief. Re-verification shows the brief's
> literal claim ("state.camera is typed base `Camera`, no `.near`/`.far`/`.fov`/`.aspect`")
> is now PARTIALLY STALE: `RootState.camera` is `ThreeCamera =
(THREE.OrthographicCamera | THREE.PerspectiveCamera) & { manual?: boolean }`, not bare
> `Camera`. `.near`/`.far` are common to both union members and now typecheck with NO
> cast (verified via `tsc`). Only `.fov`/`.aspect` (PerspectiveCamera-only) still need a
> narrowing check or cast — this issue covers that surviving gap.

## Minimal reproduction (empirically verified via a scratch `tsc --noEmit` run in this repo)

```ts
import { useThree } from '@react-three/fiber/webgpu';

function useAspect() {
  const { camera } = useThree();
  const near = camera.near; // OK — no cast needed, confirmed by tsc
  const far = camera.far; // OK — no cast needed, confirmed by tsc
  const fov = camera.fov; // Error: Property 'fov' does not exist on type
  // 'OrthographicCamera | PerspectiveCamera'
  return { near, far, fov };
}
```

Running this in the repo's own `tsc --noEmit` (with a `@ts-expect-error` on the `fov`
line) confirms: the file produces NO errors WITH the suppression present, and DOES
error without it — i.e. `.fov` genuinely fails to typecheck while `.near`/`.far` pass
clean.

## Observed vs expected

- **Observed**: `RootState.camera: ThreeCamera` where
  `ThreeCamera = (THREE.OrthographicCamera | THREE.PerspectiveCamera) & { manual?: boolean }`.
  Reading `.fov` or `.aspect` (PerspectiveCamera-only fields) requires either an
  `instanceof THREE.PerspectiveCamera` narrowing check or a cast, since
  `OrthographicCamera` doesn't have them.
- **Expected**: since the vast majority of R3F scenes use a perspective camera by
  default (and `orthographic` is an explicit opt-in Canvas prop), it would be
  reasonable for `useThree` to offer either a way to request the narrower type (e.g. a
  generic parameter) or at minimum, clearer ergonomics than an ad-hoc
  `instanceof`/cast at every call site that needs a lens property.

## Root cause

Packaged output at `node_modules/@react-three/fiber/dist/webgpu/index.d.ts:86,572`:

```ts
type ThreeCamera = (THREE.OrthographicCamera | THREE.PerspectiveCamera) & { manual?: boolean };
// ...
interface RootState {
  // ...
  camera: ThreeCamera;
}
```

Unchanged on `v10` HEAD (`packages/fiber/types/store.d.ts:281`: `camera: ThreeCamera`,
same definition).

## Proposed fix

At minimum, document the narrowing pattern in `useThree`'s JSDoc/docs. A fuller fix
would let `Canvas`'s `orthographic` prop or an explicit generic parameter flow through
to `useThree`'s return type so consumers who know their scene's camera kind don't need
a runtime check.

## Workaround

This repo's `src/examples/scene/backdrop-water/RenderPipelineFX.tsx` already has a
comment acknowledging this precisely: "this example's `<Canvas camera>` is a
PerspectiveCamera — UPSTREAM B31. (NOT the renderer gap B9, which alpha.4 fixed; this
one is still open.)" — i.e. the example relies on knowing its own camera kind out of
band rather than narrowing at the type level.

## Prior art

No matching issue found via `gh search issues` for "camera type RootState" or "fov
cast". Appears unfiled.

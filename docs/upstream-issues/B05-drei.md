# drei: `CameraControls` still has no `/webgpu` (or `/core`) export — only `/external`, which pulls the legacy WebGL bundle

**Versions**: `@react-three/drei@11.0.0-alpha.7`, `@react-three/fiber@10.0.0-alpha.4`, `three@0.185.1`

## Repro

```tsx
// A WebGPU app that wants drei's CameraControls, not a hand-rolled wrapper.
import { Canvas } from '@react-three/fiber/webgpu';
import { CameraControls } from '@react-three/drei/external'; // only place it exists
// import { CameraControls } from '@react-three/drei/webgpu'; // <- does not exist
// import { CameraControls } from '@react-three/drei/core';   // <- does not exist

function Scene() {
  return (
    <mesh>
      <boxGeometry />
      <meshStandardNodeMaterial color="orange" />
    </mesh>
  );
}

export default function App() {
  return (
    <Canvas renderer={{}}>
      <Scene />
      <CameraControls />
    </Canvas>
  );
}
```

`@react-three/drei/external/index.mjs` imports `useThree, extend, useFrame, useLoader` from the bare
`'@react-three/fiber'` specifier (the legacy WebGL-targeted entry) and `* as THREE from 'three'`
(not `'three/webgpu'`), so pulling in `CameraControls` from `/external` drags fiber's non-`/webgpu`
build and three's non-`/webgpu` build into a bundle that otherwise only ever imports the `/webgpu`
entries.

## Observed vs Expected

- **Observed**: `CameraControls` is exported only from the root entry (`.`) and `/external`. Neither
  `/core` nor `/webgpu` re-export it. `/external`'s module graph imports from `'@react-three/fiber'`
  and `'three'` directly.
- **Expected**: a `/webgpu`-safe `CameraControls` export whose imports resolve to
  `'@react-three/fiber/webgpu'` and `'three/webgpu'`, matching every other control drei ships in
  `/webgpu` (`OrbitControls`, `TrackballControls`, `MapControls`, etc., all present in
  `webgpu/index.mjs`).

## Root cause

- `node_modules/@react-three/drei/external/index.mjs:1` — `import { useThree, extend, useFrame, useLoader } from '@react-three/fiber';`
- `node_modules/@react-three/drei/external/index.mjs:4` — `import * as THREE from 'three';`
- `node_modules/@react-three/drei/external/index.mjs:87` — `const CameraControls = forwardRef((props, ref) => { ... extend({ CameraControlsImpl: Impl }); ... })`
- `node_modules/@react-three/drei/external/index.mjs:5079` — export list includes `CameraControls`
- `node_modules/@react-three/drei/webgpu/index.mjs` and `node_modules/@react-three/drei/core/index.mjs` — zero occurrences of the string `CameraControls` as an exported symbol (only an unrelated `isCameraControls` type-guard helper used by `useBounds`/similar).

This is packaged build output (a Rollup bundle), corresponding to drei source around
`src/external/Controls/CameraControls.tsx` (or wherever the pre-bundle source for `/external`
lives) not being renderer-split the way `/core` and `/webgpu` are.

## Proposed fix

Either (a) move `CameraControls` into a renderer-split shape like the rest of the controls (a
`/webgpu`-specific build importing `'@react-three/fiber/webgpu'`/`'three/webgpu'`), or (b) if
`/external` is meant to stay renderer-agnostic-by-convention, make its own imports renderer-neutral
(there is prior art: `core/index.mjs` and `webgpu/index.mjs` both exist as separate Rollup outputs
from presumably one shared source tree — whatever build step produces those two should also cover
`/external`).

## Workaround

This repo hand-rolls its own `CameraControls` wrapper around the `camera-controls` npm package
directly: `src/utils/CameraControls.tsx` (imports `@react-three/fiber/webgpu` and `three`, calls
`CameraControlsImpl.install({ THREE })` itself).

## Prior art

- Issue [pmndrs/drei#2547](https://github.com/pmndrs/drei/issues/2547) — "CameraControls component
  incorrectly marked as x-platform" (closed) — reported that `CameraControls` was wrongly reachable
  from `/native`, i.e. the export-path problem is a known sore spot, just not from the `/webgpu`
  angle.
- PR [pmndrs/drei#2548](https://github.com/pmndrs/drei/pull/2548) — "fix(CameraControls): move
  export path to make it dom-only" (merged) — moved `CameraControls` OUT of `/core` and into
  `/external` specifically to stop it being reachable from `/native`. This is the change that put
  `CameraControls` where it is today; it did not add a `/webgpu` path and does not appear to have
  considered the WebGPU renderer split at all (predates the `/webgpu` entry's stabilization work).
- No existing open issue/PR found for `CameraControls` + `/webgpu` specifically after multiple
  keyword searches (`CameraControls webgpu`, `CameraControls`).

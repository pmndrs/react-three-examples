# drei: `<TransformControls>` never mounts `getHelper()`, so on three >=r169 there is no visible gizmo and nothing to drag

**Versions**: `@react-three/drei@11.0.0-alpha.7`, `@react-three/fiber@10.0.0-alpha.4`, `three@0.185.1`

## Repro

```tsx
import { useState } from 'react';
import { Mesh } from 'three/webgpu';
import { Canvas } from '@react-three/fiber/webgpu';
import { TransformControls } from '@react-three/drei/webgpu';

export default function App() {
  const [target, setTarget] = useState<Mesh | null>(null);
  return (
    <Canvas renderer={{}} camera={{ position: [5, 5, 5] }}>
      <mesh ref={setTarget}>
        <boxGeometry />
        <meshStandardNodeMaterial color="orange" />
      </mesh>
      {target && <TransformControls object={target} />}
    </Canvas>
  );
}
```

## Observed vs Expected

- **Observed**: no gizmo arrows are drawn anywhere in the scene, and dragging over the mesh does
  nothing (no drag start fires) — `<TransformControls>` appears to do nothing at all.
- **Expected**: the translate gizmo (three colored arrows + planes) renders at the target's
  position and is draggable, matching every pre-r169 `<TransformControls>` screenshot in drei's own
  docs/stories.

## Root cause

Since three r169, `TransformControls` was refactored to extend `Controls` rather than `Object3D`
directly — it is no longer something you can just `scene.add()`. The actual drawable gizmo lives on
a separate `Group` returned by `controls.getHelper()`, which the CALLER is responsible for adding to
the scene (this is exactly what every vanilla three.js example does:
`scene.add(transformControls.getHelper())`).

drei's `<TransformControls>` constructs the controls, calls `.attach()`, and wires up event
listeners — but never calls or renders `.getHelper()`, so the drawable arrows never enter the scene
graph and are never hit-testable:

- `grep -c "getHelper" node_modules/@react-three/drei/webgpu/index.mjs` → **0** (verified against
  both alpha.6 and alpha.7 — zero occurrences of `getHelper` anywhere in the packaged `/webgpu`
  bundle).

## Proposed fix

Inside drei's `TransformControls` component, after constructing `controls`, conditionally render
`controls.getHelper()` when it exists (guarding for three versions where `getHelper` doesn't exist
yet, if drei still wants to support older three):

```tsx
const helper = useMemo(() => controls.getHelper?.() ?? controls, [controls]);
return <primitive object={helper} />;
```

(exact implementation detail is a call for whoever owns drei's `Controls` internals — the fix is
narrow: mount the helper object, not just the bare `Controls` instance, when `getHelper` is
present.)

## Workaround

`ref={setGizmo}` on `<TransformControls>` + conditionally rendering
`{gizmo && <primitive object={gizmo.getHelper()} />}` as a sibling, marked `TODO(drei-gap)`. Used in
four places in this repo:

- `src/examples/camera/controls-transform.tsx`
- `src/examples/animation/animation-skinning-ik.tsx`
- `src/examples/geometry/geometry-spline-editor.tsx`
- `src/examples/geometry/modifier-curve.tsx`

## Prior art

No matching open issue/PR found on `pmndrs/drei` after several keyword variants (`TransformControls
getHelper`, `TransformControls gizmo`, `TransformControls arrows`, `TransformControls r169`,
`TransformControls not visible`/`invisible`, `TransformControls drag`, plus a general
`getHelper` PR search). This appears to be a genuinely unfiled gap as of 2026-09-07, despite
`TransformControls` having an open, unrelated enhancement issue
([pmndrs/drei#2337](https://github.com/pmndrs/drei/issues/2337), missing min/max axis props) and
being actively touched on the `alpha`/`v11-working` branches for other reasons.

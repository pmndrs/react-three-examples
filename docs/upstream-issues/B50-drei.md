# drei: `<Html>` on a static object stays parked at `translate3d(0,-9999px,0)` under React StrictMode

**Versions**: `@react-three/drei@11.0.0-alpha.7`, `@react-three/fiber@10.0.0-alpha.4`, `three@0.185.1`

## Repro

```tsx
import { StrictMode } from 'react';
import { Canvas } from '@react-three/fiber/webgpu';
import { Html } from '@react-three/drei/webgpu';

export default function App() {
  return (
    <StrictMode>
      <Canvas renderer={{}} camera={{ position: [0, 0, 5] }}>
        {/* A label on an object that NEVER MOVES. */}
        <mesh position={[0, 0, 0]}>
          <boxGeometry />
          <meshStandardNodeMaterial color="orange" />
          <Html position={[0, 1, 0]}>
            <div style={{ background: 'white', padding: 4 }}>Static label</div>
          </Html>
        </mesh>
      </Canvas>
    </StrictMode>
  );
}
```

In dev (StrictMode on), the label never appears. In a production build (StrictMode has no effect
there), it appears immediately. Dragging the camera around eventually makes it pop in, because
that's the first time the projected screen position moves enough to clear the gate below.

## Observed vs Expected

- **Observed** (dev only): the label element is created and appended to the DOM, but its inline
  `style.transform` is left at the initial "parked off-screen" value
  (`translate3d(0,-9999px,0)`) indefinitely for an object whose projected screen position never
  changes.
- **Expected**: the label should un-park and show at its correct screen position on the very first
  frame, exactly like it does in a production build.

## Root cause

`Html`'s mount effect sets a parking transform, and the per-frame update only overwrites
`el.style.transform` once the projected position has moved more than `eps` from the LAST value it
wrote — tracked in a `useRef` that survives across a StrictMode mount → unmount → remount cycle:

- `node_modules/@react-three/drei/webgpu/index.mjs:5688` —
  `const oldPosition = React.useRef([0, 0]);`
- `node_modules/@react-three/drei/webgpu/index.mjs:5717` — the mount `useLayoutEffect`'s non-transform
  branch: `el.style.cssText = 'position:absolute;top:0;left:0;transform:translate3d(0,-9999px,0);transform-origin:0 0;';`
- `node_modules/@react-three/drei/webgpu/index.mjs:5788-5789` — the per-frame gate:
  ```js
  const vec = transform ? oldPosition.current : calculatePosition(group.current, camera, size);
  if (
    transform ||
    Math.abs(oldZoom.current - camera.zoom) > eps ||
    Math.abs(oldPosition.current[0] - vec[0]) > eps ||
    Math.abs(oldPosition.current[1] - vec[1]) > eps
  ) {
    // ...writes el.style.transform, then:
    oldPosition.current = vec; // line 5849
  }
  ```
  Default `eps` is `1e-3`. React 18 StrictMode's dev-only mount → unmount → remount cycle re-runs
  the layout effect (re-writing the `-9999px` parking `cssText`), but `oldPosition` (a `useRef`) is
  NOT reset by that cycle — it keeps whatever value the FIRST mount already converged on. For an
  object that genuinely never moves, `vec` on every subsequent frame is within `eps` of
  `oldPosition.current`, so the `if` never re-fires, and the parking transform from the SECOND
  layout-effect run is never overwritten.

Confirmed unchanged between drei alpha.6 and alpha.7 (identical `oldPosition`/`eps`/`-9999px`
pattern; only line numbers shifted due to unrelated file growth).

## Proposed fix

Reset `oldPosition.current` (and `oldZoom.current`) to a sentinel value that guarantees the first
post-remount frame's distance check exceeds `eps` — e.g. inside the same layout effect that writes
the parking `cssText`, also do `oldPosition.current = [Infinity, Infinity]` — so StrictMode's
remount can never leave a stale "already-converged" cache pointing at a state the currently-parked
element doesn't reflect.

## Workaround

Pass `eps={-1}` to force the per-frame transform write unconditionally, every frame (since no real
distance can be `> -1`... wait, since the comparison is `Math.abs(...) > eps`, a negative `eps`
makes the condition always true). Used in this repo:
`src/examples/scene/label.tsx:58,63` — both `<Html>` usages carry `eps={-1}`, with the reasoning
recorded as `// REVIEW(drei-html-eps): ...` at line 48 of that file.

## Prior art

No matching open issue/PR found on `pmndrs/drei` (`Html -9999`, `Html StrictMode`, `Html static
position`, `Html eps`).

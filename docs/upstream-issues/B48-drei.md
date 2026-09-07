# drei: `<ArcballControls>` constructs the underlying controls without `scene`, so gizmos can never appear even when a `scene` prop is passed

**Versions**: `@react-three/drei@11.0.0-alpha.7`, `@react-three/fiber@10.0.0-alpha.4`, `three@0.185.1`

## Repro

```tsx
import { useThree } from '@react-three/fiber/webgpu';
import { Canvas } from '@react-three/fiber/webgpu';
import { ArcballControls } from '@react-three/drei/webgpu';

function Controls() {
  const scene = useThree((state) => state.scene);
  // Passing `scene` looks like it should work — ArcballControls's own props type accepts it.
  return <ArcballControls scene={scene} enableGrid />;
}

export default function App() {
  return (
    <Canvas renderer={{}} camera={{ position: [5, 5, 5] }}>
      <mesh>
        <boxGeometry />
        <meshStandardNodeMaterial color="orange" />
      </mesh>
      <Controls />
    </Canvas>
  );
}
```

## Observed vs Expected

- **Observed**: no trackball gizmo (the circles/rings ArcballControls draws to show the rotation
  sphere) ever appears, `enableGrid` has no visible grid either, even though a `scene` prop was
  passed.
- **Expected**: passing `scene` (as three's own `ArcballControls` constructor signature supports)
  should make the gizmo/grid visible, matching vanilla three.js usage
  (`new ArcballControls(camera, domElement, scene)`).

## Root cause

three's `ArcballControls` only adds its gizmo group to a scene that was given to its CONSTRUCTOR —
`this.scene = scene` is a plain property assignment made once in the constructor
(`node_modules/three/examples/jsm/controls/ArcballControls.js:131`), and `this.scene.add(this._gizmos)`
(`ArcballControls.js:432`) runs during construction-time setup, before any caller has a chance to
assign `.scene` afterward.

drei's `<ArcballControls>` component only ever constructs with the camera argument:

- `node_modules/@react-three/drei/webgpu/index.mjs:3362` (packaged `/webgpu` build) —
  ```js
  const controls = useMemo(() => new ArcballControls$1(explCamera), [explCamera]);
  ```
  no `domElement`, no `scene` argument.

Worse, the component's prop destructuring doesn't even name `scene`:

```js
const ArcballControls = forwardRef(
  ({ camera, makeDefault, regress, domElement, onChange, onStart, onEnd, ...restProps }, ref) => {
    ...
    return React.createElement("primitive", { ref, object: controls, ...restProps });
  }
);
```

A `scene` prop silently falls into `...restProps`, which fiber's `<primitive>` then applies as a
**plain property assignment** (`controls.scene = scene`) AFTER the controls object already exists —
by which point the constructor's one-time `this.scene.add(this._gizmos)` call has already run
against `scene === null`. Setting `.scene` afterward does not retroactively add the gizmo group
anywhere. The prop is a complete no-op, silently.

**This repo's own gallery is currently exhibiting this bug live**: `src/examples/camera/controls.tsx:114-120`
passes `scene={scene}` to `<ArcballControls>` expecting it to enable the gizmo/grid, exactly the
shape this repro demonstrates — with no `REVIEW`/workaround comment yet, because the prop LOOKS
like it should work.

Confirmed unchanged between drei alpha.6 and alpha.7 — identical `new ArcballControls$1(explCamera)`
call in both.

## Proposed fix

Construct with all three arguments three's constructor accepts:

```js
const controls = useMemo(
  () => new ArcballControls$1(explCamera, explDomElement, explScene ?? null),
  [explCamera, explDomElement, explScene],
);
```

(`explDomElement` is already computed a few lines above in the current source — it's just never
passed to the constructor either, only used later for `.connect()`.)

## Workaround

None currently applied in this repo (the bug was found via source-reading during this audit, not
previously known) — `src/examples/camera/controls.tsx`'s `<ArcballControls scene={scene} .../>`
usage should be flagged as ineffective until this lands upstream or is worked around locally (e.g.
a small wrapper that constructs `ArcballControls` from `camera-controls`... no, from three's own
addon directly, the way `src/utils/CameraControls.tsx` does for `CameraControls`).

## Prior art

No matching open issue/PR found on `pmndrs/drei` (`ArcballControls gizmo`, `ArcballControls scene`
— only one old, unrelated, closed `ArcballControls focus function` issue turned up).

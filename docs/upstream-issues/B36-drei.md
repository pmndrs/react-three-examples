# drei: `/webgpu` exports `<CurveModifier>`, but it still imports the WebGL-only `Flow` (`onBeforeCompile`), inert on node materials

**Versions**: `@react-three/drei@11.0.0-alpha.7`, `@react-three/fiber@10.0.0-alpha.4`, `three@0.185.1`

## Repro

```tsx
import { CatmullRomCurve3, Vector3 } from 'three/webgpu';
import { Canvas } from '@react-three/fiber/webgpu';
import { CurveModifier } from '@react-three/drei/webgpu';

const curve = new CatmullRomCurve3([new Vector3(-5, 0, 0), new Vector3(0, 3, 0), new Vector3(5, 0, 0)]);

export default function App() {
  return (
    <Canvas renderer={{}}>
      <CurveModifier curve={curve}>
        <mesh>
          <boxGeometry args={[0.5, 0.5, 3]} />
          {/* A NODE material — this is the whole point of a WebGPU-first app */}
          <meshStandardNodeMaterial color="hotpink" />
        </mesh>
      </CurveModifier>
    </Canvas>
  );
}
```

## Observed vs Expected

- **Observed**: the mesh sits at its untouched local-space position; it never bends along `curve`.
  No console error.
- **Expected**: the mesh's geometry follows `curve`, matching the WebGL behavior.

## Root cause

- `node_modules/@react-three/drei/webgpu/index.mjs:24` —
  `import { Flow } from 'three/examples/jsm/modifiers/CurveModifier.js';`
- `node_modules/@react-three/drei/webgpu/index.mjs:4776` — `const CurveModifier = forwardRef(({ children, curve }, ref) => { ... })`, which constructs `new Flow(mesh, curve)` internally (this `Flow`).

`three/examples/jsm/modifiers/CurveModifier.js`'s `Flow` patches a `Mesh`'s material via
`material.onBeforeCompile`, injecting raw GLSL to rebase vertices along the spline. `NodeMaterial`
subclasses (`MeshStandardNodeMaterial`, etc. — everything the `/webgpu` renderer actually uses)
never call `onBeforeCompile`, so the patch is a silent no-op.

three ships a node-material-aware replacement,
`three/examples/jsm/modifiers/CurveModifierGPU.js`, whose own `Flow` bakes the spline into a
half-float `DataTexture` and is meant to be wired through a node material's `positionNode` — this
is exactly the mechanism `CurveModifierGPU`'s `Flow` provides. A `/webgpu`-targeted `CurveModifier`
importing THAT `Flow` instead would fix this.

Unchanged between drei alpha.6 and alpha.7 — identical `import { Flow } from '.../CurveModifier.js'`
in both packaged `/webgpu` builds.

### Independently confirmed caveat: `@types/three`'s `CurveModifierGPU.d.ts` overclaims

Whoever picks this up needs to know the typed surface for `CurveModifierGPU` does not match its
runtime exports:

- `node_modules/.pnpm/@types+three@0.185.1/node_modules/@types/three/examples/jsm/modifiers/CurveModifierGPU.d.ts`
  declares FIVE exports: `initSplineTexture`, `updateSplineTexture`, `getUniforms`, `modifyShader`,
  and `class Flow`.
- `node_modules/.pnpm/three@0.185.1/node_modules/three/examples/jsm/modifiers/CurveModifierGPU.js`
  — `grep '^export'` returns exactly one: `export class Flow`. The other four helper functions do
  not exist in the shipped `.js` at all.

So a `/webgpu` `CurveModifier` fix built against the `.d.ts` surface (e.g. trying to call
`modifyShader` or `getUniforms` directly instead of going through `new Flow(mesh, count)`) will
typecheck and then fail at import/runtime. `Flow` is the only real export to build against.

## Proposed fix

Swap `webgpu/index.mjs`'s import to `three/examples/jsm/modifiers/CurveModifierGPU.js`'s `Flow`,
and adjust the component's usage of the `Flow` API surface to match `CurveModifierGPU`'s
constructor (`new Flow(mesh, numberOfCurves?)` + `updateCurve(index, curve)` / `moveAlongCurve`,
vs. the WebGL version's different call shape) — using ONLY the real (`Flow`) export, not the
`.d.ts`-only helpers.

## Workaround

This repo's `modifier-curve` example bypasses drei's `<CurveModifier>` entirely and imports `Flow`
from `three/addons/modifiers/CurveModifierGPU.js` directly:
`src/examples/geometry/modifier-curve.tsx:31` —
`import { Flow } from 'three/addons/modifiers/CurveModifierGPU.js';`

## Prior art

No matching open issue/PR found on `pmndrs/drei` for `CurveModifier` + WebGPU/node-material/
`onBeforeCompile`/`CurveModifierGPU` (only old, unrelated, closed WebGL-era `CurveModifier` issues
turned up).

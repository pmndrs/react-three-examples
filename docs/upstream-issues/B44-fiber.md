# `<threeLine>` mounts correctly but crashes on the FIRST prop update of any ancestor

**Versions**: `@react-three/fiber@10.0.0-alpha.4`, `three@0.185.1`

## Minimal reproduction

```tsx
import { useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber/webgpu';
import type { Line } from 'three/webgpu';

function DashedLine() {
  const lineRef = useRef<Line>(null);
  return (
    <threeLine ref={lineRef}>
      <bufferGeometry />
      <lineDashedNodeMaterial />
    </threeLine>
  );
}

export default function Scene() {
  const [, forceRerender] = useState(0);
  return (
    <Canvas>
      <DashedLine />
      {/* Any prop change on an ANCESTOR of <threeLine> — not even on the line
          itself — re-renders it and triggers commitUpdate: */}
      <mesh onClick={() => forceRerender((n) => n + 1)} />
    </Canvas>
  );
}
// First click after mount: "R3F: ThreeLine is not part of the THREE namespace! Did you
// forget to extend?" — thrown from validateInstance, unmounting the whole Canvas root.
```

## Observed vs expected

- **Observed**: `<threeLine>` mounts fine on first render, but the FIRST time React
  re-renders any ancestor (calling `commitUpdate` on the `threeLine` fiber, even with
  unchanged props), it throws and unmounts the Canvas.
- **Expected**: `<threeLine>` should behave symmetrically on mount and update — either
  resolve to `Line` consistently in both `createInstance` and `commitUpdate`, or fail
  consistently (not resolve on mount and crash on update).

## Root cause (traced through the actual reconciler source)

Packaged output at `node_modules/@react-three/fiber/dist/webgpu/index.mjs`:

```js
// line 13556
const PREFIX_REGEX = /^three(?=[A-Z])/;
// line 13557
const toPascalCase = (type) => `${type[0].toUpperCase()}${type.slice(1)}`;

// line 13580 — createInstance, runs ONCE at mount
function createInstance(type, props, root) {
  type = toPascalCase(type) in catalogue ? type : type.replace(PREFIX_REGEX, '');
  validateInstance(type, props);
  // ...
}
```

For `type = "threeLine"`: `toPascalCase("threeLine")` = `"ThreeLine"`, which is NOT in
the default catalogue → falls to `type.replace(PREFIX_REGEX, "")`, stripping `"three"`
and leaving `"Line"` (the regex only matches when followed by an uppercase letter, so
the result is already PascalCase). `validateInstance("Line", ...)` then finds `Line` in
the catalogue (three's own class) — mount succeeds, and the element resolves to a real
`THREE.Line`.

```js
// line 13913 — commitUpdate, runs on every re-render of this fiber
commitUpdate(instance, type, oldProps, newProps, fiber) {
  validateInstance(type, newProps);   // <-- `type` here is the RAW original element
  // ...                                   type string ("threeLine"), NOT the resolved
}                                          // "Line" that createInstance computed —
                                           // createInstance's reassignment is local to
                                           // that function and never propagates back to
                                           // what react-reconciler passes into
                                           // commitUpdate.
```

`validateInstance("threeLine", ...)` computes `toPascalCase("threeLine")` = `"ThreeLine"`
again — but this time nothing strips the `three` prefix first, and `"ThreeLine"` is not
in the catalogue (only `"Line"` is) → throws
`` `R3F: ${name} is not part of the THREE namespace!` ``
(`validateInstance`, line 13569-13575).

## Proposed fix

`commitUpdate` should resolve the type the same way `createInstance` does (prefix-strip
before the catalogue check) before calling `validateInstance`, rather than validating
the raw, unresolved type string.

## Workaround

This repo registers the prefixed name directly so both code paths agree, in
`src/assets/ThreeLine.ts`:

```ts
import { Line } from 'three/webgpu';
import { extend } from '@react-three/fiber/webgpu';
extend({ ThreeLine: Line });
```

Imported by 6 examples: `src/examples/geometry/lines-dashed.tsx`,
`decals.tsx`, `geometry-nurbs.tsx`, `geometry-spline-editor.tsx`,
`modifier-curve.tsx`, `src/examples/scene/raycaster-helper.tsx`.

## Prior art

No exact match found via `gh search issues` for "threeLine" or "not part of the THREE
namespace" (all hits are older, unrelated eras — v6-era `div`/`Globe` extend
questions). Appears unfiled.

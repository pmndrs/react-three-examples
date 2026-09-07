# `once()` is typed `<T>(...args: T[]) => T`, rejecting every multi-arg use even though the runtime spreads them correctly

**Versions**: `@react-three/fiber@10.0.0-alpha.4`, `three@0.185.1`, `typescript@^6`

## Minimal reproduction

```tsx
import { once } from '@react-three/fiber/webgpu';

function Terrain() {
  return (
    <planeGeometry
      args={[10, 10]}
      // Runtime-correct: the reconciler spreads the stored args into
      // geometry.translate(x, y, z). Type-incorrect: `once<T>(...args: T[]): T`
      // infers T = number (all three args are numbers), so this returns `number`,
      // which does not satisfy `translate?: [x: number, y: number, z: number]`.
      translate={once(0, 50, 0)}
    />
  );
}
```

## Observed vs expected

- **Observed**: `once<T>(...args: T[]): T` collapses a multi-arg call to a single
  scalar type (`T` unified across all arguments, then returned bare — NOT as a tuple).
  `once(0, 50, 0)` types as `number`, which fails against
  `GeometryTransformProps['translate']: [x: number, y: number, z: number]`. Only
  single-arg forms (`rotateX={once(x)}`) happen to typecheck, because there `T` and the
  "tuple of one" coincide in a way that still doesn't match multi-arg geometry props.
- **Expected**: `once(...)` should preserve the argument tuple shape, e.g.
  `once<T extends readonly unknown[]>(...args: T): T`, so `once(0, 50, 0)` types as
  `[number, number, number]`.

## Root cause

Packaged output at `node_modules/@react-three/fiber/dist/webgpu/index.d.ts:3719`:

```ts
declare function once<T>(...args: T[]): T;
```

and `GeometryTransformProps` (line 1425 installed / `packages/fiber/types/three.d.ts:58`
on `v10` HEAD, unchanged):

```ts
translate?: [x: number, y: number, z: number]
```

The runtime (`ONCE` marker + reconciler spread) already handles the multi-arg case
correctly — this is purely a typing gap.

## Proposed fix

```ts
declare function once<T extends readonly unknown[]>(...args: T): T;
```

This preserves the tuple shape for both single- and multi-arg calls without breaking
existing single-arg usage.

## Workaround

This repo transforms multi-arg geometry calls in a `useMemo` instead of using `once()`
directly for those cases (pattern: `geometry-terrain-raycast`), per AGENTS.md's
documented workaround "Until B42 lands, transform multi-arg geometry in a `useMemo`."

## Prior art

No matching issue found via `gh search issues` for "once translate" or "once() type".
Appears unfiled.

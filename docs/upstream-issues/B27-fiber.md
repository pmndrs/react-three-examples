# `fromRef` can resolve a sibling ref but has no way to transform the resolved value, and only resolves top-level markers

**Versions**: `@react-three/fiber@10.0.0-alpha.4`, `three@0.185.1`

## Minimal reproduction

```tsx
import { useRef } from 'react';
import { fromRef } from '@react-three/fiber/webgpu';
import type { Mesh } from 'three/webgpu';

function Scene() {
  const targetRef = useRef<Mesh>(null);
  return (
    <>
      <mesh ref={targetRef} position={[2, 0, 0]} />
      {/* Works: assigns targetRef.current verbatim to `target`. */}
      <spotLight target={fromRef(targetRef)} />

      {/* Does NOT work: fromRef has no transform option, so you cannot derive
          e.g. a Vector3 from the ref's .position without a separate effect. */}
      {/* <spotLight targetPosition={fromRef(targetRef, (mesh) => mesh.position)} /> */}

      {/* Does NOT work: the marker is nested one level deep inside an object,
          not the direct prop value — commitMount only scans top-level props. */}
      {/* <mesh userData={{ linked: fromRef(targetRef) }} /> */}
    </>
  );
}
```

## Observed vs expected

- **Observed**: `fromRef<T>(ref: RefObject<T | null>): T` takes no second argument.
  `commitMount` resolves markers by scanning `instance.props` ONE LEVEL DEEP
  (`for (const prop in instance.props) if (isFromRef(instance.props[prop])) ...`) and
  assigns `ref.current` to the prop VERBATIM via `applyProps`. There is no way to (a)
  derive a value from the resolved ref before assignment, or (b) use a marker nested
  inside a prop's value (array element, object property) rather than as the prop's
  direct value.
- **Expected**: either an optional `transform` callback
  (`fromRef(ref, (value) => derived)`), or documented guidance that `fromRef` is
  strictly a verbatim same-type passthrough — plus, ideally, recursive marker
  resolution for markers nested inside prop values.

## Root cause

Packaged output at `node_modules/@react-three/fiber/dist/webgpu/index.d.ts:3683`:

```ts
declare function fromRef<T>(ref: React.RefObject<T | null>): T;
```

and `node_modules/@react-three/fiber/dist/webgpu/index.mjs:521-526,13935-13944`:

```js
const FROM_REF = Symbol.for("@react-three/fiber.fromRef");
function fromRef(ref) {
  return { [FROM_REF]: ref };
}
// isFromRef(value) => value !== null && typeof value === "object" && FROM_REF in value

// in the reconciler's HostConfig:
commitMount(instance) {
  const resolved = {};
  for (const prop in instance.props) {              // <-- top-level only
    const value = instance.props[prop];
    if (isFromRef(value)) {
      const ref = value[FROM_REF];
      if (ref.current != null) resolved[prop] = ref.current;   // <-- verbatim, no transform
    }
  }
  if (Object.keys(resolved).length) applyProps(instance.object, resolved);
}
```

No recursion into `value`'s own properties/array elements, and no hook for
transforming `ref.current` before assignment.

## Proposed fix

- Add an optional second parameter: `fromRef<T, R = T>(ref: RefObject<T | null>, transform?: (value: T) => R): R`,
  storing the transform alongside the ref in the marker object, and calling it in
  `commitMount` before assignment.
- Separately (could be a follow-up), consider recursing one level into array/plain-object
  prop values to resolve nested markers — or explicitly document that `fromRef` markers
  are only recognized as a prop's direct value.

## Workaround

None in this repo currently — no example needs a transformed or nested `fromRef` value
yet, but the gap is real for any future case (e.g. deriving a look-at target's
direction vector from a sibling mesh's position).

## Prior art

No matching issue found via `gh search issues` for "fromRef" or "FROM_REF". Appears
unfiled.

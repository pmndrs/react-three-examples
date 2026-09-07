# `diffProps` resets a removed prop to `0` on any class whose constructor takes arguments (every node material)

**Versions**: `@react-three/fiber@10.0.0-alpha.4`, `three@0.185.1`

## Minimal reproduction

```tsx
import { useState } from 'react';

function Toggle() {
  const [textured, setTextured] = useState(true);
  return (
    <mesh onClick={() => setTextured((t) => !t)}>
      <boxGeometry />
      {textured ? (
        <meshStandardNodeMaterial color="red" map={someTexture} />
      ) : (
        // Removing the `map` prop (rather than swapping it) sets material.map = 0,
        // not undefined/null — because MeshStandardNodeMaterial's constructor takes
        // a parameters object (constructor.length === 1, not 0).
        <meshStandardNodeMaterial color="red" />
      )}
    </mesh>
  );
}
```

## Observed vs expected

- **Observed**: when a prop is present on the old render but absent on the new one,
  `diffProps` only restores the value from the memoized prototype default when
  `root.constructor.length === 0`. Every node material's constructor takes a single
  parameters object (`constructor.length === 1`), so this branch is never taken for
  them — the removed prop is set to the literal number `0` instead. Removing `color`
  makes the material render solid black; removing `map` sets `.map = 0` (a number,
  where three expects `Texture | null`).
- **Expected**: a removed prop should reset to the class's actual default value (as it
  does for zero-arg constructors), regardless of constructor arity — or at minimum,
  reset to `null`/`undefined` rather than `0` for object-typed properties.

## Root cause

Packaged output at `node_modules/@react-three/fiber/dist/webgpu/index.mjs:611-630`:

```js
function diffProps(instance, newProps) {
  const changedProps = {};
  // ... (additions/changes omitted)
  for (const prop in instance.props) {
    if (RESERVED_PROPS.includes(prop) || newProps.hasOwnProperty(prop)) continue;
    const { root, key } = resolve(instance.object, prop);
    if (root.constructor && root.constructor.length === 0) {
      const ctor = getMemoizedPrototype(root);
      if (!is.und(ctor)) changedProps[prop] = ctor[key];
    } else {
      changedProps[prop] = 0; // <-- every node material lands here
    }
  }
  return changedProps;
}
```

`getMemoizedPrototype` (which would give the real default) is only consulted when the
constructor takes no arguments — the `else` branch is a blunt fallback that doesn't
attempt to look up a real default for parameterized constructors, even though the
memoized-prototype mechanism could plausibly extend to cover them too (a fresh
zero-config instance can usually still be constructed for comparison, or the specific
key's own class-level default could be read some other way).

## Proposed fix

Extend the "read the default from a memoized/freshly-constructed prototype" path to
also cover parameterized constructors — e.g. memoize an instance built with no
arguments (or the same args, sans the object literal) purely for default-lookup
purposes, the same way `getMemoizedPrototype` already does for zero-arg classes.

## Workaround

This repo's `src/examples/geometry/modifier-subdivision.tsx` sidesteps the bug
entirely rather than triggering it: it never OMITS the `map` prop, it always passes it
with a ternary value —

```tsx
const material: ExhibitProps['material'] = {
  color: textured ? '#ffffff' : '#808080',
  map: textured ? map : null, // always present; toggles between texture and null
  // ...
};
```

— so `diffProps`'s removed-prop branch is never reached (the prop is always present in
`newProps`, just with a different value). AGENTS.md's own description of this pattern
("Key the element on the selection so it remounts instead of diffing") does not
literally match what's in the file today — no `key=` prop appears in
`modifier-subdivision.tsx`; the actual fix in place is the always-present-value
ternary shown above, which is arguably simpler and worth correcting in AGENTS.md.

## Prior art

No exact match found via `gh search issues` for "diffProps" or "removed prop". Two
older, different-mechanism issues exist from the v9/pre-node-material era — **#2755**
("setting a transform related prop to undefined r3f noops the update instead of
resetting to default values") and **#981** ("Re-rendering component with removed props
does not update underlying object") — both closed, and neither is about the
`constructor.length === 0` branch specifically (that branch and the node-material
constructor shape are v10/WebGPU-era). Appears unfiled for the current mechanism.

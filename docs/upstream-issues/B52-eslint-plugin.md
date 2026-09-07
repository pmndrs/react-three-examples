### Title

`no-clone-in-loop`'s esquery selector matches the identifier `clone`, not `.clone()` calls (false positive on a `clone`-named loop variable)

### Versions

- `@react-three/eslint-plugin` **1.0.0-alpha.2** (current installed version — confirmed still present, selector unchanged from the version the brief was originally written against)
- `eslint` (flat config), `@react-three/fiber` 10.0.0-alpha.4

### Repo/rule location

`node_modules/@react-three/eslint-plugin/dist/index.mjs:34`

```js
["CallExpression[callee.name=useFrame] CallExpression MemberExpression Identifier[name=clone]"](node) {
  ctx.report({ messageId: "noClone", node });
}
```

### Minimal repro

```tsx
import { useFrame } from '@react-three/fiber/webgpu';
import { useRef } from 'react';
import type { Mesh, Object3D } from 'three';

function TrailFollowers({ clones }: { clones: Object3D[] }) {
  const meshRef = useRef<Mesh>(null);

  useFrame(() => {
    if (!meshRef.current) return;
    // No `.clone()` anywhere in this body — `clone` is just the loop variable's name,
    // used only in the OBJECT position of a MemberExpression (`clone.position`).
    for (const clone of clones) {
      meshRef.current.position.copy(clone.position);
    }
  });

  return null;
}
```

### Observed

`@react-three/no-clone-in-loop` flags the `clone.position` access inside the `for...of` body with `noClone`: "Cloning vectors in the frame loop can cause performance problems…" — even though the file contains zero `.clone()` invocations.

### Expected

No warning. There is no vector/object clone happening; `clone` is merely a descriptively-named loop variable that happens to share the property name the rule is trying to catch.

### Root cause

The rule's selector is an esquery **descendant** match:
`CallExpression[callee.name=useFrame] CallExpression MemberExpression Identifier[name=clone]`

It has no constraint on _which side_ of the `MemberExpression` the `clone`-named `Identifier` sits. It correctly matches the intended case (`positions.clone()`, where `clone` is the **property**) but also matches `clone.position` (where `clone` is the **object**) — any nested call inside `useFrame` containing a `MemberExpression` with a `clone`-named identifier anywhere under it trips the rule, call or no call.

### Proposed fix

Constrain the selector to the property position of a call expression, e.g.:

```js
'CallExpression[callee.name=useFrame] CallExpression > MemberExpression.callee > Identifier.property[name=clone]';
```

or equivalently, in the visitor body:

```js
create(ctx) {
  return {
    ["CallExpression[callee.name=useFrame] CallExpression MemberExpression Identifier[name=clone]"](node) {
      if (node.parent.type === 'MemberExpression' && node.parent.property === node) {
        ctx.report({ messageId: "noClone", node });
      }
    }
  };
}
```

Either form eliminates the false positive on `clone` as an object/loop-variable identifier while keeping the true-positive `.clone()` call detection.

### Workaround

No code-level suppression needed/used — rename the loop variable to something other than `clone` (e.g. `instance`, `other`, `item`). This is a behavioral convention, not a code change, so there is nothing to grep for in the consuming repo beyond the convention itself.

### Prior art

- `gh search issues --repo pmndrs/react-three-fiber "no-clone-in-loop"` → only hit is **#2701**, "RFC: @react-three/eslint-plugin rules" (open, labels: help wanted, request for comments, v10) — general rule-design discussion for this plugin, no specific false-positive report found there.
- No existing issue in `pmndrs/react-three-fiber` (the plugin ships from that monorepo — `packages/eslint-plugin`, confirmed via the rule's own `gitHubUrl()` docs link and the package.json `repository` field) specifically about this esquery false positive.
- `gh search issues --owner pmndrs "no-clone-in-loop"` and `"eslint clone"` returned nothing else relevant.
- This appears to be a novel, unreported bug — worth filing fresh against `pmndrs/react-three-fiber` (the eslint-plugin lives in that monorepo, not a separate `pmndrs/eslint-plugin` repo, which does not exist).

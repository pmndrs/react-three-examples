## Scope note

Filing as **one issue covering both sub-problems** rather than two: both are types-package gaps
in the same package (`@react-three/rapier`'s bundled `.d.ts`), both were hit while porting the
same two examples, and both have the identical shape of fix (loosen/correct a type that is
stricter or narrower than what the runtime actually needs/accepts). Splitting would just
duplicate the "Versions" and "Prior art" sections. If upstream triage prefers separate tickets
per file (`joints.d.ts` vs `types.d.ts`), they can be split trivially — noting that here in case
it matters to the caller.

---

### Title

`@react-three/rapier` types: joint hooks reject React 19 refs (`RefObject<T>` instead of `RefObject<T | null>`); `HeightfieldArgs.heights` typed `number[]` instead of `Float32Array`

### Versions

- `@react-three/rapier@2.2.0`
- `react@19.2` (peer range `>=19.0 <19.3` via `@react-three/fiber@10.0.0-alpha.4`)
- `@dimforge/rapier3d-compat` (bundled transitively by r3r 2.2, WASM 0.19.2 per r3r's own pin)

### Sub-issue 1 — joint hooks reject React 19's `useRef(null)`

**Root cause — path:line**
`node_modules/@react-three/rapier/dist/declarations/src/hooks/joints.d.ts:8` (and every joint
hook declared via the same `UseImpulseJoint` alias, lines 8–46):

```ts
export declare const useImpulseJoint: <JointType extends ImpulseJoint>(
  body1: RefObject<RapierRigidBody>,
  body2: RefObject<RapierRigidBody>,
  params: Rapier.JointData,
) => RefObject<JointType | undefined>;

export declare const useSphericalJoint: UseImpulseJoint<SphericalJointParams, SphericalImpulseJoint>;
export declare const useRevoluteJoint: UseImpulseJoint<RevoluteJointParams, RevoluteImpulseJoint>;
// ...same shape for usePrismaticJoint, useRopeJoint, useSpringJoint, useFixedJoint
```

Every joint hook parameter is typed `RefObject<RapierRigidBody>` — React's **non-nullable**
`RefObject`. But React 19's `useRef<T>(null)` (the only legal call when you have no initial
value) returns `RefObject<T | null>`, which is NOT assignable to `RefObject<T>` (the `.current`
variance makes it a real narrowing, not just a strictness nit). There is no way to produce a
`RefObject<RapierRigidBody>` (never null) in React 19 user code without lying to the type
system.

**Minimal repro** (derived from the actual code in `src/examples/physics/rapier-joints.tsx`
in this repo):

```tsx
import { useRef } from 'react';
import { useSphericalJoint, type RapierRigidBody } from '@react-three/rapier';

function Link() {
  // React 19: useRef<T>(null) infers RefObject<T | null> — this is the ONLY legal call shape.
  const hangsFromRef = useRef<RapierRigidBody>(null);
  const linkRef = useRef<RapierRigidBody>(null);

  // TS2345: Argument of type 'RefObject<RapierRigidBody | null>' is not assignable to
  // parameter of type 'RefObject<RapierRigidBody>'.
  useSphericalJoint(hangsFromRef, linkRef, [
    [0, -0.5, 0],
    [0, 1.15, 0],
  ]);
}
```

**Observed**: `tsc` rejects the call — `useRef(null)`'s inferred type doesn't satisfy the
hook's declared parameter type.

**Expected**: the hooks should accept `RefObject<RapierRigidBody | null>`, matching how every
other React-19-era ref consumer in the ecosystem (including `@react-three/fiber` itself, per
this repo's own house style — "Type the exposed prop `React.RefObject<T | null>`") types a
ref parameter.

**Proposed fix**: widen every joint hook's `RefObject<RapierRigidBody>` parameters (and the
internal `useImpulseJoint`) to `RefObject<RapierRigidBody | null>` in
`hooks/joints.d.ts`/`.ts`. This is additive (widening an input type) and should not be a
breaking change for existing callers.

**Workaround actually used** (`src/examples/physics/rapier-joints.tsx:60-63`):

```tsx
// `null!`: the joint hooks type their refs as `RefObject<RapierRigidBody>` (never null),
// which React 19's `useRef(null)` no longer produces — a @react-three/rapier types gap.
const pivotRef = useRef<RapierRigidBody>(null!);
const linkRefs = [useRef<RapierRigidBody>(null!), useRef<RapierRigidBody>(null!), useRef<RapierRigidBody>(null!)];
```

Using `null!` (non-null assertion) forces `useRef`'s inferred type to `RefObject<RapierRigidBody>`
to satisfy the hook signature — functionally identical to `useRef(null)` at runtime, but it is a
type-system lie the caller has to write everywhere a joint hook is used.

---

### Sub-issue 2 — `HeightfieldArgs.heights` typed `number[]` instead of `Float32Array`

**Root cause — path:line**
`node_modules/@react-three/rapier/dist/declarations/src/types.d.ts:20-24`:

```ts
export type HeightfieldArgs = [
  columns: number,
  rows: number,
  heights: number[],
  scale: { x: number; y: number; z: number },
];
```

Rapier's own heightfield collider constructor (`@dimforge/rapier3d-compat`) takes a
`Float32Array` for the heights buffer, but `@react-three/rapier`'s `HeightfieldArgs` /
`<HeightfieldCollider>` types declare `heights: number[]` — a plain-array copy is required to
satisfy the type even though a `Float32Array` would be the more natural (and more efficient —
no copy) representation, and is what the WASM boundary actually wants.

**Minimal repro / actual usage** (`src/examples/physics/rapier-terrain.tsx:47-58`):

```tsx
// the original's Float32Array only because that is what `<HeightfieldCollider>` is typed
// to take; rapier accepts either.
function generateHeights(width: number, depth: number, minHeight: number, maxHeight: number) {
  const data: number[] = [];
  const range = maxHeight - minHeight;
  for (let j = 0; j < depth; j++) {
    for (let i = 0; i < width; i++) {
      const radius = Math.hypot((i - width / 2) / (width / 2), (j - depth / 2) / (depth / 2));
      data.push((Math.sin(radius * 12) + 1) * 0.5 * range + minHeight);
    }
  }
  return data;
}
```

**Observed**: `<HeightfieldCollider args={[cols, rows, heights, scale]}>` only typechecks when
`heights` is a plain `number[]`; passing a `Float32Array` (what the upstream three.js
`physics_rapier_terrain` original actually builds and what rapier's WASM constructor wants)
is a type error against `HeightfieldArgs`.

**Expected**: `heights` should be typed to accept `Float32Array` (or `number[] | Float32Array`
for backward compat), matching `Rapier.RigidBodyDesc`/collider-desc heightfield APIs.

**Proposed fix**: widen `HeightfieldArgs[2]` to `number[] | Float32Array` in `types.d.ts`.

**Workaround actually used**: build the height table as a plain `number[]` from the start
(shown above) rather than a `Float32Array` + cast. This is cast-free but diverges slightly from
the original's buffer choice, purely to satisfy the type.

---

### Prior art

- `gh search issues --repo pmndrs/react-three-rapier "React 19"` → **#771** "Rapier basic
  project doesn't work with react 19?" (open) — general React 19 compat complaint, not
  specifically about joint-hook ref typing, but consistent with this gap.
- `gh search issues --repo pmndrs/react-three-rapier "RefObject React 19"`,
  `"heightfield Float32Array"`, and `"useSphericalJoint"` → no direct hits.
- Related but distinct: **#758** "Ref Forwarding Issues with RigidBody Component" (closed) and
  **#743** "joint not work (version 2.0.0)" (closed) — both ref/joint-adjacent but not this
  exact typing mismatch.
- No open PR found addressing either the joint-hook ref typing or the heightfield array typing
  specifically; `gh api repos/pmndrs/react-three-rapier/commits?per_page=30` showed no recent
  commit touching `joints.d.ts`/`types.d.ts` in this direction.
- Also noted per the brief (not duplicated here): drei's `PointerLockControls` reading the
  deprecated `state.gl` alias is separate territory, already tracked as drei's B49.

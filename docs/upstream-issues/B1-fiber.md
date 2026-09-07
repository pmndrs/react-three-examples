# `useUniforms` erases both the TSL node type and the value type under strict TypeScript

**Versions**: `@react-three/fiber@10.0.0-alpha.4`, `three@0.185.1`, `typescript@^6` (repo pin; reproduces on 5.x too per upstream issue #3769)

## Minimal reproduction

```tsx
import { useUniforms, Canvas } from '@react-three/fiber/webgpu';
import { mix, color } from 'three/tsl';

function Tinted() {
  // `intensity` is a number, `tint` is a hex string — three's own uniform()
  // overloads would resolve these to UniformNode<'float', number> and
  // UniformNode<'color', Color> respectively.
  const { intensity, tint } = useUniforms({ intensity: 1, tint: '#ff0000' });

  // Fails: intensity is typed UniformNode<unknown, unknown>, not Node<'float'>.
  const scaled = mix(color('#000000'), tint, intensity);

  return null;
}
```

## Observed vs expected

- **Observed**: `useUniforms`'s declared return type is
  `UniformsWithUtils<UniformRecord<UniformNode>>`, i.e.
  `Record<string, UniformNode<unknown, unknown>>` — every key collapses to the same
  bare type, keys are lost, and `.value` reads back as `unknown`. Passing `intensity`
  into `mix()` (which wants `Node<'float'> | number`) fails to typecheck because
  `UniformNode<unknown, unknown>` is not assignable to `Node<'float'>`.
- **Expected**: each returned key keeps its own inferred TSL node type —
  `intensity: UniformNode<'float', number>`, `tint: UniformNode<'color', Color>` —
  mirroring the value → node-type mapping `three`'s own `uniform()` overloads already
  encode (number → 'float', Color/hex string → 'color', Vector3 → 'vec3', ...).

## Root cause

Packaged output at `node_modules/@react-three/fiber/dist/webgpu/index.d.ts:3809-3813`
(pre-patch; corresponds to the monorepo's `packages/fiber/types` + generated hook
declarations thereabouts):

```ts
declare function useUniforms<T extends UniformInputRecord>(uniforms: T): UniformsWithUtils<UniformRecord<UniformNode>>;
```

`T` is captured in the generic parameter but never used in the return type — it's
discarded. Separately, `type UniformNode<T = unknown> = three_webgpu.UniformNode<unknown, T>`
pins three's own two-param `UniformNode<TNodeType, TValue>`'s first parameter to
`unknown`, so even a correctly-narrowed value type is still a `Node<unknown>`, which
satisfies no typed TSL signature.

An unmerged fix attempt already exists upstream: commit `00c846ab` ("fix(types): derive
UniformNode's TSL node type from its value type") on a branch that has since diverged
from `v10` HEAD (`gh api repos/pmndrs/react-three-fiber/compare/v10...00c846ab` →
`"status": "diverged", "ahead_by": 6, "behind_by": 4`) — i.e. drafted, not shipped.

## Proposed fix

Two changes, both needed:

1. Map each `TNodeType` name from the input value's type (mirroring three's `uniform()`
   overload table: `number → 'float'`, `boolean → 'bool'`, `Vector2 → 'vec2'`,
   `Vector3 → 'vec3'`, `Vector4 → 'vec4'`, `Color`/hex-string → `'color'`,
   `Matrix3 → 'mat3'`, `Matrix4 → 'mat4'`, an existing `Node` passed through unchanged).
2. Preserve `T`'s keys in the return type via a mapped type
   (`{ [K in keyof T]: UniformNodeFor<T[K]> }`) instead of collapsing to
   `Record<string, UniformNode>`.

A working reference implementation is `scripts/patch-fiber-types.mjs` in this repo
(a postinstall types-only patch) — its `UniformNodeFor<V>`/`MappedUniforms<T>` types are
exactly this fix, already verified against the full corpus.

## Workaround

This repo carries a local postinstall patch: `scripts/patch-fiber-types.mjs`, applied via
`package.json`'s `postinstall` script, rewriting the compiled `.d.ts` in place. Ledgered
as UPSTREAM A9 in `docs/UPSTREAM.md`; unwind condition is "fiber ships the B1 fix (both
halves)".

## Prior art

- **#3769** — "[v10] Improved Typescript inference for useUniforms hook" (open). Covers
  exactly the value-type half of this bug, with its own minimal repro.
- **#3886** — "Types: store uniforms aren't assignable to material node slots
  (`UniformNode<unknown>` vs `Node<"color">`)" (open). Covers the TSL-node-type half
  from the consumption side (assigning a store uniform to a `NodeMaterial` slot like
  `material.colorNode`).
- **#3887** — "Types: the ScopedStore surface (`useLocalNodes`, `uniforms.scope`,
  `nodes.scope`) — uniforms need a double cast, nodes are `any`" (open). Follow-on
  covering the `CreatorState` wrapper surface (`useNodes`/`useLocalNodes` creator
  functions), a related but distinct consumption path.

None of the three is closed or has a merged fix as of this audit. Given how precisely
they already cover this brief, **filing a fourth issue would likely be a duplicate** —
recommend cross-linking to #3769/#3886/#3887 (and to the diverged `00c846ab` commit as
prior work) rather than opening new ground.

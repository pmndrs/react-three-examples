# fiber's `declare module 'three/tsl'` augmentation drops @types/three's own `Fn` overloads project-wide

**Versions**: `@react-three/fiber@10.0.0-alpha.4`, `three@0.185.1`, `@types/three@0.185.1`, `typescript@^6`

## Minimal reproduction (empirically verified in this repo via a scratch `tsc --noEmit` run)

```ts
// Anywhere in a project that ALSO has a file importing '@react-three/fiber/webgpu'
// (fiber's ambient module augmentation then applies to the WHOLE program — this file
// itself does not even need to import fiber):
import { Fn } from 'three/tsl';

// The "statement-call" form: second arg is a layout STRING, documented and typed by
// @types/three (`layout?: Layout | string`).
const myFn = Fn((builder) => {
  console.log(builder);
}, 'void');
```

Running `npx tsc --noEmit` against this repo (which already imports
`@react-three/fiber/webgpu` from dozens of unrelated files) produces:

```
error TS2769: No overload matches this call.
  The last overload gave the following error.
    Type '"void"' has no properties in common with type '{ layout?: unknown; }'.
```

Removing the fiber import from every file in the program is not necessary to
reproduce — the failure happens even in a file that only imports `three/tsl` and
nothing from fiber, as long as fiber's `.d.ts` is anywhere in the compiled program
(confirmed: identical error with and without a direct `@react-three/fiber/webgpu`
import in the test file itself).

## Observed vs expected

- **Observed**: fiber's `three/tsl` module augmentation declares exactly 4 `Fn`
  overloads, all of whose optional second parameter is `{ layout?: unknown }` (an
  object) — none accept a bare `string`. Once this augmentation is anywhere in the
  compiled program, TypeScript's overload resolution for `Fn(fn, 'void')` reports
  failure against fiber's LAST overload only — @types/three's own 3 overloads (which
  accept `layout?: Layout | string`, confirmed present at
  `node_modules/@types/three/src/nodes/tsl/TSLCore.d.ts:1781-1791`) are not being
  offered as alternatives.
- **Expected**: TypeScript module augmentation should ADD fiber's overloads
  alongside @types/three's existing ones (7 total), so both the array/object
  destructuring forms fiber documents AND the string-layout statement-call form
  @types/three already supports keep working together.

## Root cause

Packaged output at `node_modules/@react-three/fiber/dist/webgpu/index.d.ts:1297-1327`:

```ts
declare module 'three/tsl' {
  export function Fn<R extends Node = Node>(
    jsFunc: (inputs: ShaderNodeObject<Node>[]) => ShaderNodeObject<R>,
  ): ShaderCallable<R>;
  export function Fn<T extends Record<string, unknown>, R extends Node = Node>(
    jsFunc: (inputs: T) => ShaderNodeObject<R>,
  ): ShaderCallable<R>;
  export function Fn<R extends Node = Node>(
    jsFunc: (inputs: ShaderNodeObject<Node>[]) => ShaderNodeObject<R>,
    layout: { layout?: unknown },
  ): ShaderCallable<R>;
  export function Fn<T extends Record<string, unknown>, R extends Node = Node>(
    jsFunc: (inputs: T) => ShaderNodeObject<R>,
    layout: { layout?: unknown },
  ): ShaderCallable<R>;
}
```

vs. `@types/three`'s own (reached via `three/package.json`'s `exports['./tsl']` having
no `types` condition, so TS falls back to the sibling `.d.ts`,
`node_modules/@types/three/build/three.tsl.d.ts` → `export * from "../src/Three.TSL.js"`
→ `node_modules/@types/three/src/nodes/tsl/TSLCore.d.ts:1781-1791`):

```ts
export function Fn<TReturn>(jsFunc: (builder: NodeBuilder) => TReturn, layout?: Layout | string): FnNode<[], TReturn>;
export function Fn<TArgs extends readonly unknown[], TReturn>(
  jsFunc: (args: TArgs, builder: NodeBuilder) => TReturn,
  layout?: Layout | string,
): FnNode<ProxiedTuple<TArgs>, TReturn>;
export function Fn<TArgs extends { readonly [key: string]: unknown }, TReturn>(
  jsFunc: (args: TArgs, builder: NodeBuilder) => TReturn,
  layout?: Layout | string,
): FnNode<[ProxiedObject<TArgs>], TReturn>;
```

`three` itself ships NO types for `three/tsl` (its own package.json `exports['./tsl']`
has no `types` field) — `@types/three` is the ONLY source of typing for that module
specifier. fiber's `.d.ts` is a real module file (has top-level `export type {...}`
elsewhere), so its `declare module 'three/tsl' {...}` block should be a pure
augmentation, merging with — not replacing — @types/three's declarations. The
empirical result (fiber's overloads only) suggests something in how the two are
resolved/ordered is causing @types/three's overloads to be excluded from the
candidate list, rather than a true additive merge.

## Proposed fix

Either (a) add a matching statement-call overload to fiber's own augmentation
(`layout?: Layout | string`, re-exporting or importing three's `Layout` type), or (b)
investigate why the module-augmentation merge isn't additive here and fix the
declaration structure so both overload sets are genuinely combined.

## Workaround

None identified in this repo; the statement-call form (`Fn(fn, 'void')`) is not
currently used by any example (fiber's 4 overloads cover this corpus's usage), but
`postprocessing-anamorphic.tsx` already carries a comment noting the object-destructured
form doesn't cover something under this same augmentation family (B21 pre-existing
mention in that file).

## Prior art

No matching issue found via `gh search issues` for "Fn overload", "three/tsl", "Fn
layout", or "module augmentation" — the closest hits (#3887, #3886, #3769) are about
the separate B1 uniform-typing family, not this `Fn` overload-shadowing issue. Appears
unfiled.

# `.` and `./webgpu` entry points are two independent bundles — loading both creates two reconcilers

**Versions**: `@react-three/fiber@10.0.0-alpha.4`, `three@0.185.1`

## Minimal reproduction

```tsx
// App code imports the WebGPU entry:
import { Canvas, useThree } from '@react-three/fiber/webgpu';

// ...but any dependency that imports the ROOT specifier (e.g. an older/other
// version of a drei-style helper, or a package that hasn't been updated to
// import '/webgpu' explicitly) pulls in a SECOND, independent copy:
import '@react-three/fiber'; // <- simulates what a transitive dep does

function Scene() {
  const camera = useThree((s) => s.camera); // may read from the WRONG reconciler's store
  return null;
}
```

Concretely in this repo, drei's `/webgpu` build still imports the bare
`@react-three/fiber` specifier internally in places, which is why
`vite.config.ts` carries a forced resolve alias (see Workaround) rather than
relying on package resolution.

## Observed vs expected

- **Observed**: `@react-three/fiber`'s `package.json` `exports` map ships `.` and
  `./webgpu` as two _separately bundled_ files with no shared chunk:
  `dist/index.mjs` (683,855 bytes / 15,278 lines) and `dist/webgpu/index.mjs`
  (16,138 lines). Both independently define their own module-scope
  `function createReconciler(config)` and `const reconciler = createReconciler({...})`
  singleton (`index.mjs:13540,13874` vs `webgpu/index.mjs:13548,13882`). If both
  modules are ever loaded in one page (e.g. because one dependency imports the root
  specifier while app code imports `/webgpu`), React ends up with two independent
  `react-reconciler` instances and two separate zustand stores/contexts, which
  manifests as "Invalid hook call" or hooks silently reading stale/wrong state.
- **Expected**: the root `.` entry should re-export from the same underlying runtime
  chunk that `./webgpu` uses (WebGPU is a superset of the legacy WebGL runtime), so
  that loading both specifiers in one page resolves to the same module instance.

## Root cause

`node_modules/@react-three/fiber/package.json` `exports` field:

```json
".": { "types": "./dist/index.d.ts", "import": "./dist/index.mjs", "require": "./dist/index.cjs" },
"./webgpu": { "types": "./dist/webgpu/index.d.ts", "import": "./dist/webgpu/index.mjs", "require": "./dist/webgpu/index.cjs" }
```

Packaged output at `node_modules/@react-three/fiber/dist/index.mjs:13540` and
`node_modules/@react-three/fiber/dist/webgpu/index.mjs:13548` (both define
`function createReconciler(config) { const reconciler2 = r0(config); ...; return reconciler2; }`
independently) — corresponds to the monorepo's separate `packages/fiber/src/index.tsx`
and `packages/fiber/src/webgpu/index.tsx` entry builds, each presumably bundling the
shared reconciler-setup module inline rather than importing a common chunk at the
package-output level.

## Proposed fix

Build the root `.` entry as a thin re-export of the `./webgpu` bundle's shared
internals (or vice versa — whichever is the canonical runtime), so both specifiers
resolve to one module graph at the bundler level, the same way importing the same
package twice under two specifiers should behave.

## Workaround

This repo forces both specifiers to resolve to the same file via a Vite resolve alias
in `vite.config.ts`:

```ts
const fiberWebgpu = fileURLToPath(new URL('./node_modules/@react-three/fiber/dist/webgpu/index.mjs', import.meta.url));
resolve: {
  alias: [{ find: /^@react-three\/fiber(\/webgpu)?$/, replacement: fiberWebgpu }];
}
```

Ledgered as UPSTREAM A3 in `docs/UPSTREAM.md`.

## Prior art

No matching open or closed issue found via `gh search issues`/`gh search prs` for
"webgpu entry two instances", "Invalid hook call webgpu", "duplicate react", or "two
reconcilers" against `pmndrs/react-three-fiber`. The closest hit (#860, closed, v4-era
"Hooks error in a class component") is unrelated. This appears to be genuinely unfiled.

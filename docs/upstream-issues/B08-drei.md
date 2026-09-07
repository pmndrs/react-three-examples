# drei (docs): `useProgress`'s non-reactive `getState()` escape hatch is undocumented

**Versions**: `@react-three/drei@11.0.0-alpha.7`, `@react-three/fiber@10.0.0-alpha.4`, `three@0.185.1`

This is a minor, docs-level issue, not a runtime bug — flagging it because it is easy to hit by
accident and the fix (a one-line docs addition) is cheap.

## Repro

```tsx
import { useProgress } from '@react-three/drei/webgpu';
import { useLoader } from '@react-three/fiber/webgpu';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Component A starts a loader synchronously during ITS render (e.g. inside useLoader's
// suspense-throwing read, or an eagerly-kicked-off `useLoader.preload`).
function Model() {
  const gltf = useLoader(GLTFLoader, '/model.glb');
  return <primitive object={gltf.scene} />;
}

// Component B is subscribed to the shared useProgress store and re-renders whenever
// progress changes.
function LoadingBar() {
  const { progress } = useProgress(); // reactive subscription
  return <div>{progress.toFixed(0)}%</div>;
}

export default function App() {
  return (
    <>
      <LoadingBar />
      <Model />
    </>
  );
}
```

If `Model`'s render is what triggers `DefaultLoadingManager.onStart`/`onProgress` synchronously
(same call stack as React's render phase), `useProgress`'s internal `set(...)` fires while React is
still rendering `Model`, and any OTHER already-mounted component subscribed to `useProgress` (like
`LoadingBar`, if it happens to be rendering in the same pass, or on a fast-enough loader) can hit
React's "Cannot update a component while rendering a different component" warning.

## Observed vs Expected

- **Observed**: `useProgress` is a plain reactive zustand hook (`create$1((set) => {...})`); every
  consumer that calls `useProgress()` directly subscribes and re-renders on every `set()`. Nothing
  in drei's own typings/docs surfaces the standard zustand non-reactive read,
  `useProgress.getState()`, as the "safe to call during someone else's render" alternative.
- **Expected**: the docs (or at least the exported type) call out `useProgress.getState()`
  (or a dedicated non-hook `getProgress()`) as the way to read current progress without
  subscribing, for exactly this loader-started-during-render shape.

## Root cause

- `node_modules/@react-three/drei/webgpu/index.mjs:8427` —
  ```js
  const useProgress = create$1((set) => {
    DefaultLoadingManager.onStart = (item, loaded, total) => { set({ active: true, ... }); };
    ...
    return { errors: [], active: false, progress: 0, item: "", loaded: 0, total: 0 };
  });
  ```
  `create$1` is zustand's `create`, which — per zustand's own API — automatically attaches
  `.getState()`/`.setState()`/`.subscribe()` to the returned hook. That escape hatch **does**
  exist at runtime (confirmed: this is standard zustand behavior, not something drei would need to
  add code for), it is just not documented anywhere in drei's own docs/JSDoc for `useProgress`.

This is unchanged between alpha.6 and alpha.7.

## Proposed fix

Add a one-line JSDoc/docs mention: "Call `useProgress.getState()` for a non-reactive read (safe to
call during another component's render); use the hook form only where you want re-renders on
progress change."

## Workaround

Use `useProgress.getState().progress` (etc.) instead of the destructured hook form when a read is
needed synchronously from inside another component's render or from a non-component context.

## Prior art

No matching open issue/PR found on `pmndrs/drei` (`useProgress setState`, `useProgress render`
returned nothing). Given the low severity, this may be better as a docs PR than an issue.

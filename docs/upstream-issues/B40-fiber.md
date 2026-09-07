# `Canvas`'s `onCreated` hands back the WebGL/WebGPU union `RootState`, unlike `useThree` on the `/webgpu` entry

**Versions**: `@react-three/fiber@10.0.0-alpha.4`, `three@0.185.1`

## Minimal reproduction

```tsx
import { Canvas, useThree } from '@react-three/fiber/webgpu';

function Scene() {
  // On the /webgpu entry, useThree()'s renderer is correctly narrowed:
  const renderer = useThree((s) => s.renderer); // WebGPURenderer, no cast
  return null;
}

function App() {
  return (
    <Canvas
      onCreated={(state) => {
        // state.renderer is R3FRenderer = WebGLRenderer | WebGPURenderer here,
        // even though this IS the /webgpu entry's <Canvas> — every WebGPU-only
        // call needs a narrowing check or cast that useThree() doesn't need.
        state.renderer.compute; // Error: Property 'compute' does not exist on type
        // 'WebGLRenderer | WebGPURenderer'.
      }}>
      <Scene />
    </Canvas>
  );
}
```

## Observed vs expected

- **Observed**: `Canvas`'s `onCreated?: (state: RootState) => void` prop is typed
  against the GENERIC `RootState` interface, whose `renderer` field is
  `R3FRenderer = THREE.WebGLRenderer | WebGPURenderer` — the union. Meanwhile,
  `useThree()` called from inside a `/webgpu`-entry component is documented and typed
  to return `WebGPURootState`, whose `renderer` is narrowed to `WebGPURenderer` alone.
  Two different call sites for "the current root state" on the SAME entry point give
  two different types for the same runtime value.
- **Expected**: on the `/webgpu` entry, `Canvas`'s `onCreated` should also receive
  `WebGPURootState` (or the entry-specific root state type), matching what `useThree`
  already gives.

## Root cause

Packaged output at `node_modules/@react-three/fiber/dist/webgpu/index.d.ts`:

- `onCreated` (line 835): `onCreated?: (state: RootState) => void` — where `RootState`
  here is the shared/generic interface (line 567: `renderer: R3FRenderer`).
- `R3FRenderer` (line 398): `type R3FRenderer = THREE.WebGLRenderer | WebGPURenderer`.
- Compare `WebGPURootState` (line 4163): `interface WebGPURootState extends
Omit<RootState, 'renderer' | 'gl' | 'internal'> { renderer: WebGPURenderer; ... }` —
  this is what `useThree`'s doc comment shows as the `/webgpu` entry's return type, but
  `Canvas`'s own `onCreated` prop is never retyped against it.

Unchanged on `v10` HEAD (`packages/fiber/types/store.d.ts:276`:
`renderer: R3FRenderer`, same union; no `onCreated`-specific narrowing found in the
current hand-authored `types/*.d.ts` sources).

## Proposed fix

Either give the `/webgpu` entry's exported `CanvasProps` its own `onCreated?: (state:
WebGPURootState) => void` override (mirroring how `WebGPURootState` already overrides
`RootState` elsewhere in that entry's types), or make `RootState` itself
entry-parameterized so both call sites share one narrowed type per entry point.

## Workaround

This repo hasn't needed one directly (examples generally read `renderer` via
`useThree`/`useFrame` rather than `onCreated`), but any future `onCreated`-based setup
needing WebGPU-only renderer members would need a local cast.

## Prior art

No matching issue found via `gh search issues` for "onCreated renderer" or "onCreated".
Appears unfiled.

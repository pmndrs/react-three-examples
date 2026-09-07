# `useGPUStorage`'s `StorageLike` union omits `Storage3DTexture` (and `StorageArrayTexture`)

**Versions**: `@react-three/fiber@10.0.0-alpha.4`, `three@0.185.1`

## Minimal reproduction

```tsx
import { useGPUStorage } from '@react-three/fiber/webgpu';
import { Storage3DTexture } from 'three/webgpu';

function Volume() {
  // compute.mdx documents exactly this pattern:
  //   voxelData: new Storage3DTexture(64, 64, 64)
  const { voxelData } = useGPUStorage(() => ({
    // Type error: Storage3DTexture is not assignable to StorageLike
    voxelData: new Storage3DTexture(64, 64, 64),
  }));
  return null;
}
```

## Observed vs expected

- **Observed**: `StorageLike` is `StorageTexture | Data3DTexture | Node`. `three`'s
  runtime (`three/build/three.webgpu.js`) exports `Storage3DTexture` as its own class —
  `class Storage3DTexture extends Texture` (line 87381) — which is a SIBLING of
  `Data3DTexture`, not a subtype of it. Passing a real `Storage3DTexture` into a
  `useGPUStorage` creator is a type error even though the runtime handles it fine (this
  repo's `compute-texture-3d.tsx` and `volume-fire`'s `createStorage3D` both hit this
  and route around it).
- **Expected**: `StorageLike` should include `Storage3DTexture` (and, while touching
  this union, `StorageArrayTexture`, which is the same shape of gap for texture
  arrays) — both are documented storage-texture-family types the WebGPU compute API
  supports.

## Root cause

Packaged output at `node_modules/@react-three/fiber/dist/webgpu/index.d.ts:381-386`
(unchanged on `v10` HEAD, `packages/fiber/types/store.d.ts:85-91` as of this audit):

```ts
type StorageLike =
  | StorageTexture // GPU storage texture
  | Data3DTexture // 3D texture (can be used as storage)
  | Node; // TSL storage texture nodes (storageTexture)
```

`three`'s actual export list (`three.webgpu.js:88140`) includes `Storage3DTexture`,
`StorageArrayTexture`, `StorageTexture`, `StorageBufferAttribute`,
`StorageInstancedBufferAttribute` as distinct classes — `StorageLike` only names two of
the texture-shaped ones (`StorageTexture`, and the unrelated `Data3DTexture`).

## Proposed fix

```ts
type StorageLike = StorageTexture | Storage3DTexture | StorageArrayTexture | Data3DTexture | Node;
```

## Workaround

None in this repo beyond routing the 3D-storage-texture case through the `Node` arm of
the union where possible, or a local cast at the call site
(`compute-texture-3d.tsx`, `volume-fire`'s `createStorage3D`).

## Prior art

No matching issue found via `gh search issues` for "Storage3DTexture", "useGPUStorage
StorageLike", or "Data3DTexture". Appears unfiled.

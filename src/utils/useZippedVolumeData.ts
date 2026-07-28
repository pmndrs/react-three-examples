// useZippedVolumeData — drei has no loader for zip-archived binary assets. The
// three.js examples ship raw volumetric data (head256x256x109.zip) zipped rather
// than as a plain binary, and it feeds TWO ports in this corpus
// (textures-2d-array, rendertarget-2d-array-3d/). This wraps `THREE.FileLoader`
// (arraybuffer response) behind fiber's `useLoader` — Suspense-compatible,
// cached by URL — then unpacks one named entry with fflate's `unzipSync`.
import { useMemo } from 'react'
import { useLoader } from '@react-three/fiber/webgpu'
import { FileLoader } from 'three/webgpu'
import { unzipSync } from 'three/addons/libs/fflate.module.js'

export function useZippedVolumeData(url: string, entryName: string): Uint8Array {
  const buffer = useLoader(FileLoader, url, (loader) => {
    loader.setResponseType('arraybuffer')
  })
  // FileLoader<TData> defaults its generic to `string | ArrayBuffer`; the
  // `setResponseType('arraybuffer')` above guarantees ArrayBuffer at runtime —
  // this narrows the union (local cast, not an upstream gap: FileLoader's own
  // typed surface has no way to thread the responseType into the return type).
  return useMemo(() => {
    const zip = unzipSync(new Uint8Array(buffer as ArrayBuffer))
    return new Uint8Array(zip[entryName].buffer)
  }, [buffer, entryName])
}

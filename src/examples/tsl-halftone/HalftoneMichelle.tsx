// The GLTF model keeps its own loaded material (and PBR look) — only `outputNode` is
// overridden, per mesh, in an effect (the mesh list is only known once the model loads,
// unlike HalftonePrimitives' statically-known meshes).
import { useEffect } from 'react'
import { useGLTF } from '@react-three/drei/webgpu'
import { output } from 'three/tsl'
import type { Material, Mesh } from 'three/webgpu'
import type { HalftonesFn } from './halftoneEffect'

const MICHELLE_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/Michelle.glb'

export function HalftoneMichelle({ halftones }: { halftones: HalftonesFn }) {
  const { scene } = useGLTF(MICHELLE_URL)

  useEffect(() => {
    scene.traverse((child) => {
      if (!(child as Mesh).isMesh) return
      // GLTFLoader's materials are plain MeshStandardMaterial, not a NodeMaterial
      // subclass — `outputNode` is a runtime-only WebGPURenderer field on ANY material,
      // not part of its type (matches the original's untyped `child.material.outputNode
      // = ...` assignment).
      const material = (child as Mesh).material as Material & { outputNode: unknown }
      material.outputNode = halftones(output)
    })
  }, [scene, halftones])

  return <primitive object={scene} position={[0, -2, 0]} scale={2.5} />
}

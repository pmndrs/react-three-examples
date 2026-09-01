// Loaded character: plays its one clip, and overrides every mesh's `outputNode` with an
// oscillating posterize pulse. See backdrop.tsx header DEMONSTRATES / DIVERGENCE.
import { useEffect } from 'react'
import { output, oscSine, posterize, time } from 'three/tsl'
import type { Material, Mesh } from 'three/webgpu'

import { useAnimations, useGLTF } from '@react-three/drei/webgpu'

const MICHELLE_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/Michelle.glb'

export function Michelle() {
  const { scene, animations } = useGLTF(MICHELLE_URL)
  const { actions } = useAnimations(animations, scene)

  useEffect(() => {
    // Play by name, never Object.values(actions) — Michelle.glb ships one clip, but a
    // GLTF can carry rest/utility clips that would otherwise pollute the blend.
    const name = animations[0]?.name
    if (name) actions[name]?.play()
  }, [actions, animations])

  useEffect(() => {
    const pulse = oscSine(time.mul(0.1)).mix(output, posterize(output.add(0.1), 4).mul(2))
    scene.traverse((child) => {
      if (!(child as Mesh).isMesh) return
      // GLTFLoader's materials are plain MeshStandardMaterial, not a NodeMaterial
      // subclass — `outputNode` is a runtime-only WebGPURenderer field on ANY material,
      // not part of its type (matches the original's untyped `child.material.outputNode
      // = ...` assignment; same cast as `tsl-halftone`'s `HalftoneMichelle.tsx`).
      const material = (child as Mesh).material as Material & { outputNode: unknown }
      material.outputNode = pulse
    })
  }, [scene])

  return <primitive object={scene} />
}

// Loaded animated character: plays its one clip, casts/receives shadows, and floats
// on the `floorY` value shared with the water/floor diorama below it. See
// backdrop-water.tsx header DEMONSTRATES.
import { useEffect } from 'react'
import type { Mesh } from 'three/webgpu'

import { useAnimations, useGLTF } from '@react-three/drei/webgpu'

const MICHELLE_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/Michelle.glb'

interface MichelleProps {
  floorY: number
}

export function Michelle({ floorY }: MichelleProps) {
  const { scene, animations } = useGLTF(MICHELLE_URL)
  const { actions } = useAnimations(animations, scene)

  useEffect(() => {
    // Play by name, never Object.values(actions) — Michelle.glb ships one clip, but a
    // GLTF can carry rest/utility clips that would otherwise pollute the blend.
    const name = animations[0]?.name
    if (name) actions[name]?.play()
  }, [actions, animations])

  useEffect(() => {
    scene.traverse((child) => {
      if (!(child as Mesh).isMesh) return
      child.castShadow = true
      child.receiveShadow = true
    })
  }, [scene])

  return <primitive object={scene} position={[0, floorY, 0]} />
}

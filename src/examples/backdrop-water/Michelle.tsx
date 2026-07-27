// Loaded animated character: plays its one clip, casts/receives shadows, and floats
// on the `floorY` value shared with the water/floor diorama below it. See
// backdrop-water.tsx header DEMONSTRATES.
import { useEffect } from 'react'
import { useAnimations, useGLTF } from '@react-three/drei/webgpu'
import type { Mesh } from 'three/webgpu'

const MICHELLE_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/Michelle.glb'

interface MichelleProps {
  floorY: number
}

export function Michelle({ floorY }: MichelleProps) {
  const { scene, animations } = useGLTF(MICHELLE_URL)
  const { actions } = useAnimations(animations, scene)

  useEffect(() => {
    // Michelle.glb ships a single clip — same "first action" idiom as
    // skinning-instancing/backdrop (no named-clip ambiguity to worry about here).
    const first = Object.values(actions)[0]
    first?.play()
  }, [actions])

  useEffect(() => {
    scene.traverse((child) => {
      if (!(child as Mesh).isMesh) return
      child.castShadow = true
      child.receiveShadow = true
    })
  }, [scene])

  return <primitive object={scene} position={[0, floorY, 0]} />
}

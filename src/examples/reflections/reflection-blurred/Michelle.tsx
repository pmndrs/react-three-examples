// The animated dancer reflected in the floor: Michelle.glb playing its single clip.
// See reflection-blurred.tsx header DEMONSTRATES / DIVERGENCE.
import { useEffect } from 'react'
import { useAnimations, useGLTF } from '@react-three/drei/webgpu'
import type { Mesh } from 'three/webgpu'

const MICHELLE_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/Michelle.glb'

export function Michelle() {
  const { scene, animations } = useGLTF(MICHELLE_URL)
  const { actions } = useAnimations(animations, scene)

  useEffect(() => {
    // Michelle.glb ships a single clip — same "first action" idiom as
    // backdrop/Michelle.tsx (no named-clip ambiguity to worry about here).
    Object.values(actions)[0]?.play()
  }, [actions])

  useEffect(() => {
    // The original marks the skinned mesh a shadow caster
    // (`model.children[0].children[0].castShadow = true`) — traverse is the
    // hierarchy-robust equivalent.
    scene.traverse((child) => {
      if ((child as Mesh).isMesh) child.castShadow = true
    })
  }, [scene])

  return <primitive object={scene} />
}

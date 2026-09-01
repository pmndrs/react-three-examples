// Three normal-shaded shapes arranged on a circle, matching the original's fixed trio.
import { useRef } from 'react'
import type { Mesh } from 'three/webgpu'

import { useFrame } from '@react-three/fiber/webgpu'

export function Shapes() {
  const meshRefs = useRef<(Mesh | null)[]>([])

  useFrame(() => {
    for (const mesh of meshRefs.current) {
      if (!mesh) continue
      mesh.rotation.x += 0.01
      mesh.rotation.y += 0.02
    }
  })

  return (
    <>
      <mesh ref={(m) => void (meshRefs.current[0] = m)} position={[0.5, 0.1, 0]}>
        <boxGeometry args={[0.4, 0.4, 0.4]} />
        <meshNormalMaterial />
      </mesh>
      <mesh ref={(m) => void (meshRefs.current[1] = m)} position={[-0.25, 0.1, 0.4330127]}>
        <icosahedronGeometry args={[0.3]} />
        <meshNormalMaterial />
      </mesh>
      <mesh ref={(m) => void (meshRefs.current[2] = m)} position={[-0.25, 0.1, -0.4330127]}>
        <torusKnotGeometry args={[0.4, 0.05, 256, 24, 1, 3]} />
        <meshNormalMaterial />
      </mesh>
    </>
  )
}

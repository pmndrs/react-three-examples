// The two uv-grid toruses — the loudest motion-vector sources: the right one spins
// fast around Y, the left one pulses its scale. Both mutated imperatively in
// useFrame (v10: `state.delta` seconds, `state.elapsed` seconds — no clock).
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber/webgpu'
import { useTexture } from '@react-three/drei/webgpu'
import { SRGBColorSpace } from 'three/webgpu'
import type { Mesh } from 'three/webgpu'

const UV_GRID_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/uv_grid_opengl.jpg'

export interface SpinningTorusesProps {
  speed: number
}

export function SpinningToruses({ speed }: SpinningTorusesProps) {
  const map = useTexture(UV_GRID_URL, (tex) => {
    tex.colorSpace = SRGBColorSpace
  })
  const rightRef = useRef<Mesh>(null)
  const leftRef = useRef<Mesh>(null)

  useFrame((state) => {
    if (rightRef.current) rightRef.current.rotation.y += state.delta * 4 * speed
    if (leftRef.current) leftRef.current.scale.setScalar(1 + Math.sin(state.elapsed * 10 * speed) * 0.2)
  })

  return (
    <>
      <mesh ref={rightRef} position={[3.5, 1.5, -4]}>
        <torusGeometry args={[0.8]} />
        <meshBasicMaterial map={map} />
      </mesh>
      <mesh ref={leftRef} position={[-3.5, 1.5, -4]}>
        <torusGeometry args={[0.8]} />
        <meshBasicMaterial map={map} />
      </mesh>
    </>
  )
}

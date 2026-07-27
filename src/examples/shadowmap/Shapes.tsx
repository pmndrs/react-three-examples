// The rotating torus knot (its own maskNode-punched shadow caster, see the file header
// DEMONSTRATES) plus the four static pillars around it.
import { useMemo, useRef } from 'react'
import { useFrame, useUniforms } from '@react-three/fiber/webgpu'
import { mx_fractal_noise_float, positionLocal } from 'three/tsl'
import type { Mesh, Node } from 'three/webgpu'

const BASE_COLOR = '#999999'
const PILLAR_POSITIONS: [number, number, number][] = [
  [8, 3.5, 8],
  [8, 3.5, -8],
  [-8, 3.5, 8],
  [-8, 3.5, -8],
]

export interface TorusKnotProps {
  maskThreshold: number
  spinSpeed: number
}

// The torus knot's material doubles as its own shadow-caster material: `maskNode`
// discards fragments below the noise threshold, and that discard applies to the shadow
// depth pass too, punching matching holes in the shadow (header DEMONSTRATES).
export function TorusKnot({ maskThreshold, spinSpeed }: TorusKnotProps) {
  const meshRef = useRef<Mesh>(null)
  const { threshold } = useUniforms({ threshold: maskThreshold }, 'shadowmapMask')

  // Cast: fiber's `UniformNode<T>` pins the value type to `unknown` (documented fiber
  // typing gap, see tsl-halftone/skinning-instancing) — this uniform really is a float.
  const maskNode = useMemo(
    () => mx_fractal_noise_float(positionLocal.mul(0.1)).x.greaterThan(threshold as unknown as Node<'float'>),
    [threshold],
  )

  useFrame((_, delta) => {
    const mesh = meshRef.current
    if (!mesh) return
    mesh.rotation.x += 0.25 * spinSpeed * delta
    mesh.rotation.y += 0.5 * spinSpeed * delta
    mesh.rotation.z += 1 * spinSpeed * delta
  })

  return (
    <mesh ref={meshRef} scale={1 / 18} position={[0, 3, 0]} castShadow receiveShadow>
      <torusKnotGeometry args={[25, 8, 75, 80]} />
      <meshPhongNodeMaterial color={BASE_COLOR} shininess={0} specular="#222222" transparent maskNode={maskNode} />
    </mesh>
  )
}

export function Pillars() {
  return (
    <>
      {PILLAR_POSITIONS.map((position, i) => (
        <mesh key={i} position={position} castShadow>
          <cylinderGeometry args={[0.75, 0.75, 7, 32]} />
          <meshPhongNodeMaterial color={BASE_COLOR} shininess={0} specular="#222222" />
        </mesh>
      ))}
    </>
  )
}

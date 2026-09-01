// The animated subjects the mirrors reflect: a slowly spinning capped half-sphere
// sculpture and a small flat-shaded icosahedron orbiting the room. Transforms are
// declarative; the original's imperative `rotateX(a); rotateZ(b)` chain maps to
// `rotation={[a, 0, b]}` (Euler XYZ = intrinsic X-then-Z when Y is 0).
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber/webgpu'
import type { Group, Mesh } from 'three/webgpu'

const DEG = Math.PI / 180

// Cap disk closing the open rim of the 120-degree half-sphere.
const CAP_RADIUS = 15 * Math.cos(30 * DEG)
const CAP_Y = -15 * Math.sin(30 * DEG) - 0.05
const HALF_SPHERE_Y = 7.5 + 15 * Math.sin(30 * DEG)

interface SpheresProps {
  /** Animation speed multiplier (1 = original's 60 fps motion). */
  speed: number
}

export function Spheres({ speed }: SpheresProps) {
  const sphereGroupRef = useRef<Group>(null)
  const smallSphereRef = useRef<Mesh>(null)
  // Delta-accumulated clock so the leva speed control scales (and can pause) the
  // motion without snapping positions — see header DIVERGENCE (original uses
  // Date.now() and a per-frame rotation increment).
  const clockRef = useRef(0)

  useFrame((_, delta) => {
    clockRef.current += delta * speed
    const t = clockRef.current

    const sphereGroup = sphereGroupRef.current
    const smallSphere = smallSphereRef.current
    if (!sphereGroup || !smallSphere) return

    // Original: -0.002 rad/frame at 60 fps.
    sphereGroup.rotation.y -= 0.12 * delta * speed

    smallSphere.position.set(Math.cos(t) * 30, Math.abs(Math.cos(t * 2)) * 20 + 5, Math.sin(t) * 30)
    smallSphere.rotation.y = Math.PI / 2 - t
    smallSphere.rotation.z = t * 8
  })

  return (
    <>
      <group ref={sphereGroupRef}>
        <mesh position-y={HALF_SPHERE_Y} rotation={[-135 * DEG, 0, -20 * DEG]}>
          <sphereGeometry args={[15, 24, 24, Math.PI / 2, Math.PI * 2, 0, 120 * DEG]} />
          <meshPhongMaterial color="#ffffff" emissive="#8d8d8d" />
          <mesh position-y={CAP_Y} rotation-x={-Math.PI}>
            <cylinderGeometry args={[0.1, CAP_RADIUS, 0.1, 24, 1]} />
            <meshPhongMaterial color="#ffffff" emissive="#8d8d8d" />
          </mesh>
        </mesh>
      </group>
      <mesh ref={smallSphereRef}>
        <icosahedronGeometry args={[5, 0]} />
        <meshPhongMaterial color="#ffffff" emissive="#7b7b7b" flatShading />
      </mesh>
    </>
  )
}

// The animated centerpiece: a central torus + 6 orbiting inner shapes, a ring of 12
// outer shapes, and a shell of 200 floating points — built once from a shared pool of
// 8 geometries/materials, matching the original's `createShapes()`.
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber/webgpu'
import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  MeshStandardMaterial,
  OctahedronGeometry,
  SphereGeometry,
  TorusGeometry,
  TorusKnotGeometry,
} from 'three/webgpu'

const COLORS = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff, 0xffffff, 0xff8800]
const INNER_COUNT = 6
const INNER_RADIUS = 3
const OUTER_COUNT = 12
const OUTER_RADIUS = 15
const PARTICLE_COUNT = 200

interface ShapeInstance {
  position: [number, number, number]
  geometryIndex: number
}

export function Shapes({ animated }: { animated: boolean }) {
  const mainGroupRef = useRef<Group>(null)

  const { geometries, materials } = useMemo(() => {
    const geometries = [
      new BoxGeometry(3, 3, 3),
      new SphereGeometry(2, 32, 16),
      new ConeGeometry(2, 4, 8),
      new CylinderGeometry(1.5, 1.5, 4, 8),
      new TorusGeometry(2, 0.8, 8, 16),
      new OctahedronGeometry(2.5),
      new IcosahedronGeometry(2.5),
      new TorusKnotGeometry(1.5, 0.5, 64, 8),
    ]
    const materials = COLORS.map(
      (color) => new MeshStandardMaterial({ color, roughness: 0.2, metalness: 0.8 }),
    )
    return { geometries, materials }
  }, [])

  const centralGeometry = useMemo(() => new TorusGeometry(5, 1.5, 16, 32), [])
  const centralMaterial = useMemo(
    () =>
      new MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, metalness: 1, emissive: 0x222222 }),
    [],
  )

  const innerShapes = useMemo<ShapeInstance[]>(
    () =>
      Array.from({ length: INNER_COUNT }, (_, i) => {
        const angle = (i / INNER_COUNT) * Math.PI * 2
        return {
          position: [Math.cos(angle) * INNER_RADIUS, 0, Math.sin(angle) * INNER_RADIUS],
          geometryIndex: i % geometries.length,
        }
      }),
    [geometries.length],
  )

  const outerShapes = useMemo<ShapeInstance[]>(
    () =>
      Array.from({ length: OUTER_COUNT }, (_, i) => {
        const angle = (i / OUTER_COUNT) * Math.PI * 2
        return {
          position: [
            Math.cos(angle) * OUTER_RADIUS,
            Math.sin(i * 0.5) * 2,
            Math.sin(angle) * OUTER_RADIUS,
          ],
          geometryIndex: i % geometries.length,
        }
      }),
    [geometries.length],
  )

  const particlesGeometry = useMemo(() => {
    const positions = new Float32Array(PARTICLE_COUNT * 3)
    for (let i = 0; i < PARTICLE_COUNT * 3; i += 3) {
      const radius = 25 + Math.random() * 10
      const theta = Math.random() * Math.PI * 2
      const phi = Math.random() * Math.PI
      positions[i] = radius * Math.sin(phi) * Math.cos(theta)
      positions[i + 1] = radius * Math.cos(phi)
      positions[i + 2] = radius * Math.sin(phi) * Math.sin(theta)
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    return geometry
  }, [])

  // Mirrors the original's `mainGroup.children.forEach(...)`: every top-level group
  // (the central group AND each single-mesh outer group) rotates its own Y at the
  // same rate, while its mesh children spin individually on X/Z. The original's
  // `else if (child.type === 'Group')` branch for outer-group bobbing is unreachable
  // dead code there (every child already has >0 children) — this port keeps the
  // same effective behavior rather than the unreachable branch.
  useFrame((state) => {
    if (!animated) return
    const group = mainGroupRef.current
    if (!group) return
    const t = state.elapsed
    for (const child of group.children) {
      child.rotation.y = t * 0.5
      child.children.forEach((sub, subIndex) => {
        sub.rotation.x = t * (1 + subIndex * 0.1)
        sub.rotation.z = t * (1 - subIndex * 0.1)
      })
    }
  })

  return (
    <group ref={mainGroupRef}>
      <group>
        <mesh geometry={centralGeometry} material={centralMaterial} />
        {innerShapes.map((shape, i) => (
          <mesh
            key={i}
            geometry={geometries[shape.geometryIndex]}
            material={materials[shape.geometryIndex]}
            position={shape.position}
            scale={0.5}
          />
        ))}
      </group>
      {outerShapes.map((shape, i) => (
        <group key={i} position={shape.position}>
          <mesh
            geometry={geometries[shape.geometryIndex]}
            material={materials[shape.geometryIndex]}
            castShadow
            receiveShadow
          />
        </group>
      ))}
      <points geometry={particlesGeometry}>
        <pointsMaterial color="#ffffff" size={0.5} sizeAttenuation />
      </points>
    </group>
  )
}

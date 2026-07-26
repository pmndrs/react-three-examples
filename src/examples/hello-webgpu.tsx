/**
 * hello-webgpu
 * M0 placeholder, not a port — no three.js original (see docs/ROADMAP.md M1).
 *
 * DEMONSTRATES
 * - R3F v10's WebGPU entry point (`@react-three/fiber/webgpu`) and the
 *   `<Canvas renderer>` shorthand: WebGPURenderer creation/init is owned by fiber —
 *   no manual `gl={async (props) => ...}` factory (see research/r3f-v10-status.md §4)
 *
 * DIVERGENCE from original
 * - n/a (placeholder, will be retired once real ports cover the basics)
 */
import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber/webgpu'
import type { Mesh } from 'three'
import { DemoHelpers } from '../utils/DemoHelpers'

function TorusKnot() {
  const meshRef = useRef<Mesh>(null)

  useFrame((_, delta) => {
    if (!meshRef.current) return
    meshRef.current.rotation.x += delta * 0.3
    meshRef.current.rotation.y += delta * 0.4
  })

  return (
    <mesh ref={meshRef}>
      <torusKnotGeometry args={[1, 0.3, 128, 32]} />
      <meshStandardMaterial color="#7dd3fc" roughness={0.3} metalness={0.1} />
    </mesh>
  )
}

export default function HelloWebGPU() {
  return (
    <Canvas renderer camera={{ position: [0, 0, 5] }}>
      <ambientLight intensity={0.4} />
      <directionalLight position={[3, 3, 5]} intensity={1.5} />
      <TorusKnot />
      {/* Grid off: the knot floats at origin, an infinite ground plane reads wrong. */}
      <DemoHelpers grid={false} />
    </Canvas>
  )
}

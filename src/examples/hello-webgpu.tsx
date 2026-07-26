// hello-webgpu — M0 placeholder example, not the golden path (see docs/ROADMAP.md M1).
// Demonstrates: R3F v10's WebGPU entry point (`@react-three/fiber/webgpu`) and the
// `<Canvas renderer>` shorthand, which owns WebGPURenderer creation/init internally —
// no manual `gl={async (props) => ...}` factory needed (see research/r3f-v10-status.md §4).
import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber/webgpu'
import type { Mesh } from 'three'

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
    </Canvas>
  )
}

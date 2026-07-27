/**
 * instance-mesh
 * R3F port of three.js `webgpu_instance_mesh`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_instance_mesh (~110 lines of JS)
 *
 * DEMONSTRATES
 * - `THREE.InstancedMesh` driven declaratively via `<instancedMesh args={[geometry,
 *   material, count]}>`, with per-instance transforms written imperatively each frame
 *   via `setMatrixAt` — three.js's own instancing pattern, still the right escape hatch
 *   inside R3F (no fiber/drei JSX replaces the per-instance matrix loop)
 * - Per-instance TSL color variation: a `range()` node samples one random color per GPU
 *   instance, blended against `normalWorld` (matcap-like shading) via an
 *   `oscSine(time)` oscillator — same node-composition pattern as `skinning-instancing`
 * - Shrinking the drawn instance count at runtime via the mutable `mesh.count` property,
 *   independent of the fixed-size `instanceMatrix` buffer allocated at construction
 *
 * DIVERGENCE from original
 * - Original's grid side length came from a `?<n>` URL query param (default 10) and its
 *   instance-count slider (1..count) was wired through the three.js Inspector's
 *   `createParameters` GUI. Both replaced with leva `useControls` (`amount`, `visible`)
 *   per this repo's convention.
 * - `amount` (grid side length, `amount ** 3` total instances) changes the fixed buffer
 *   size, so the mesh is remounted (`key={amount}`) on change — the original only ever
 *   read `amount` once, at page load.
 * - The loaded geometry is cloned before `computeVertexNormals()`/`scale()` are applied,
 *   instead of mutating it in place like the original — `useLoader`'s Suspense cache
 *   returns the same geometry instance across remounts (triggered by the `amount`
 *   control above), and re-scaling an already-scaled shared instance would compound.
 * - DemoHelpers baseline (grid + camera controls) added; original had a fixed camera
 *   with no user interaction.
 */
import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useLoader } from '@react-three/fiber/webgpu'
import { useControls } from 'leva'
import { mix, normalWorld, oscSine, range, time } from 'three/tsl'
import {
  BufferGeometryLoader,
  Color,
  DynamicDrawUsage,
  MeshBasicNodeMaterial,
  Object3D,
} from 'three/webgpu'
import type { InstancedMesh } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const SUZANNE_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/json/suzanne_buffergeometry.json'

// Scratch object reused across the per-frame matrix loop (no per-frame allocation).
const dummy = new Object3D()

interface InstancedSuzanneProps {
  amount: number
  visible: number
}

function InstancedSuzanne({ amount, visible }: InstancedSuzanneProps) {
  const count = amount ** 3
  const raw = useLoader(BufferGeometryLoader, SUZANNE_URL)

  // Clone before mutating — see header DIVERGENCE (the loader's Suspense cache shares
  // this instance across remounts).
  const geometry = useMemo(() => {
    const geo = raw.clone()
    geo.computeVertexNormals()
    geo.scale(0.5, 0.5, 0.5)
    return geo
  }, [raw])

  const material = useMemo(() => {
    const mat = new MeshBasicNodeMaterial()
    // Random per-instance color between 0x000000 and 0xffffff, blended over time.
    const randomColors = range(new Color(0x000000), new Color(0xffffff))
    mat.colorNode = mix(normalWorld, randomColors, oscSine(time.mul(0.1)))
    return mat
  }, [])

  const meshRef = useRef<InstancedMesh>(null)

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    mesh.instanceMatrix.setUsage(DynamicDrawUsage)
  }, [geometry, material])

  // Shrink/grow the drawn instance count without touching the instanceMatrix buffer.
  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    mesh.count = Math.min(visible, count)
  }, [visible, count])

  useFrame((state) => {
    const mesh = meshRef.current
    if (!mesh) return

    const t = state.elapsed

    mesh.rotation.x = Math.sin(t / 4)
    mesh.rotation.y = Math.sin(t / 2)

    let i = 0
    const offset = (amount - 1) / 2

    for (let x = 0; x < amount; x++) {
      for (let y = 0; y < amount; y++) {
        for (let z = 0; z < amount; z++) {
          dummy.position.set(offset - x, offset - y, offset - z)
          dummy.rotation.y = Math.sin(x / 4 + t) + Math.sin(y / 4 + t) + Math.sin(z / 4 + t)
          dummy.rotation.z = dummy.rotation.y * 2
          dummy.updateMatrix()
          mesh.setMatrixAt(i++, dummy.matrix)
        }
      }
    }

    mesh.instanceMatrix.needsUpdate = true
  })

  return <instancedMesh ref={meshRef} args={[geometry, material, count]} />
}

export default function InstanceMesh() {
  const { amount, visible } = useControls('instance-mesh', {
    amount: { value: 10, min: 3, max: 16, step: 1 },
    visible: { value: 1000, min: 1, max: 4096, step: 1 },
  })

  const count = amount ** 3

  return (
    <Canvas
      renderer
      background="#000000"
      camera={{ position: [amount * 0.9, amount * 0.9, amount * 0.9], fov: 60, near: 0.1, far: 100 }}
    >
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes the displayed scene (AGENTS.md; corpus-wide repair, wave 8). */}
      <Suspense fallback={null}>
        <InstancedSuzanne key={amount} amount={amount} visible={Math.min(visible, count)} />
      </Suspense>
      <DemoHelpers grid={false} />
    </Canvas>
  )
}

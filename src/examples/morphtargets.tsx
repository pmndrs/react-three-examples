/**
 * morphtargets
 * R3F port of three.js `webgpu_morphtargets`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_morphtargets (~90 lines of JS)
 *
 * DEMONSTRATES
 * - `BufferGeometry.morphAttributes.position`: two custom morph targets (spherify,
 *   twist) built by hand from a subdivided `BoxGeometry`'s own position attribute, then
 *   blended live via `Mesh.morphTargetInfluences[i]` — the core three.js morph-target
 *   API, unchanged by the WebGPU backend
 * - `Mesh.updateMorphTargets()`: the escape hatch this needs in R3F specifically —
 *   attaching a `geometry` prop to `<mesh>` does not run three's own constructor-time
 *   morph-target setup, so `morphTargetInfluences` stays `undefined` until this is
 *   called explicitly, once, imperatively, after mount
 * - A point light attached to the camera as a "headlight" (`camera.add()` in an effect;
 *   no declarative "light as camera child" pattern in R3F — same escape hatch as
 *   `skinning-instancing.tsx`)
 *
 * DIVERGENCE from original
 * - Direct `Spherify`/`Twist` leva sliders (0-1, same range/step) replace the original's
 *   dat.GUI-via-Inspector panel (`renderer.inspector.createParameters`)
 * - DemoHelpers added for camera controls; grid disabled (`grid={false}`) — the original
 *   is a single object floating in a flat background color with no ground plane, and the
 *   grid plane (y = 0.002) would cut straight through the cube's vertical middle
 * - `OrbitControls.enableZoom = false` ported as `minDistance`/`maxDistance` both pinned
 *   to the starting camera distance — CameraControls (this repo's wrapper) has no direct
 *   "disable zoom" flag, only distance clamps, so clamping both to the same value
 *   reproduces the locked-zoom behavior
 * - Twist-target vertex rotation computed with plain trig (`Math.sin`/`cos`) instead of
 *   the original's `Vector3.applyAxisAngle` — avoids allocating a `Vector3` per loop
 *   iteration (`@react-three/no-new-in-loop`); same rotation-around-the-X-axis math
 */
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber/webgpu'
import { useControls } from 'leva'
import { BoxGeometry, Float32BufferAttribute, PointLight } from 'three/webgpu'
import type { Mesh } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const CAMERA_DISTANCE = 10

// Subdivided box with two morph targets baked onto `morphAttributes.position`:
// index 0 bends the cube onto a sphere, index 1 twists it around the X axis. Ported
// directly from the original's `createGeometry()`, minus the per-vertex `Vector3` reuse
// (see header DIVERGENCE).
function createMorphGeometry() {
  const geometry = new BoxGeometry(2, 2, 2, 32, 32, 32)
  const position = geometry.attributes.position
  const count = position.count

  const spherePositions: number[] = []
  const twistPositions: number[] = []

  for (let i = 0; i < count; i++) {
    const x = position.getX(i)
    const y = position.getY(i)
    const z = position.getZ(i)

    spherePositions.push(
      x * Math.sqrt(1 - (y * y) / 2 - (z * z) / 2 + (y * y * z * z) / 3),
      y * Math.sqrt(1 - (z * z) / 2 - (x * x) / 2 + (z * z * x * x) / 3),
      z * Math.sqrt(1 - (x * x) / 2 - (y * y) / 2 + (x * x * y * y) / 3),
    )

    // Stretch along x so the twist reads clearly, then rotate (y, z) around the X axis
    // by an angle proportional to x — same math as the original's
    // `vertex.applyAxisAngle(new Vector3(1, 0, 0), angle)`, done with plain trig instead
    // of a per-vertex Vector3 allocation.
    const stretchedX = x * 2
    const angle = (Math.PI * x) / 2
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    twistPositions.push(stretchedX, y * cos - z * sin, y * sin + z * cos)
  }

  geometry.morphAttributes.position = [
    new Float32BufferAttribute(spherePositions, 3),
    new Float32BufferAttribute(twistPositions, 3),
  ]

  return geometry
}

interface MorphBoxProps {
  spherify: number
  twist: number
}

function MorphBox({ spherify, twist }: MorphBoxProps) {
  const geometry = useMemo(() => createMorphGeometry(), [])
  const meshRef = useRef<Mesh>(null)

  // `updateMorphTargets()` — see header DEMONSTRATES: fiber's `geometry` prop attach
  // doesn't run three's constructor-time morph-target setup, so this has to run once,
  // imperatively, before `morphTargetInfluences` exists. MUST be a layout effect, not a
  // plain effect: three's node-material graph reads `mesh.morphTargetInfluences` once,
  // at shader-build time, on the WebGPU renderer's first `render()` call inside R3F's
  // rAF-driven frame loop — a passive `useEffect` (deferred until after paint) can lose
  // that race and run after the first frame already built the graph with `influences:
  // null` baked in permanently (three caches it per-mesh in a WeakMap). A layout effect
  // runs synchronously in the commit phase, before any paint/rAF tick, so it always wins.
  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    if (!mesh.morphTargetInfluences) mesh.updateMorphTargets()
  }, [])

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh?.morphTargetInfluences) return
    mesh.morphTargetInfluences[0] = spherify
    mesh.morphTargetInfluences[1] = twist
  }, [spherify, twist])

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <meshPhongMaterial color="#ff0000" flatShading />
    </mesh>
  )
}

// Point light rigidly attached to the camera (a "headlight"). No declarative
// "light as camera child" pattern exists in R3F — same escape hatch as
// skinning-instancing.tsx.
function CameraLight() {
  const camera = useThree((s) => s.camera)
  const light = useMemo(() => new PointLight('#ffffff', 200), [])

  useEffect(() => {
    camera.add(light)
    return () => {
      camera.remove(light)
    }
  }, [camera, light])

  return null
}

export default function MorphTargets() {
  const { spherify, twist } = useControls('morphtargets', {
    spherify: { value: 0, min: 0, max: 1, step: 0.01 },
    twist: { value: 0, min: 0, max: 1, step: 0.01 },
  })

  return (
    <Canvas
      renderer
      background="#8fbcd4"
      camera={{ position: [0, 0, CAMERA_DISTANCE], fov: 45, near: 1, far: 20 }}
    >
      <ambientLight color="#8fbcd4" intensity={1.5} />
      <CameraLight />
      <MorphBox spherify={spherify} twist={twist} />
      <DemoHelpers grid={false} minDistance={CAMERA_DISTANCE} maxDistance={CAMERA_DISTANCE} />
    </Canvas>
  )
}

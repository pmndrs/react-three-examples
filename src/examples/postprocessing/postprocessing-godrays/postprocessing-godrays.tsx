/**
 * postprocessing-godrays
 * Concrete pillars in a pitch-black box, lit by one shadow-casting point light —
 * the light shafts are entirely a post-processing effect, not real geometry.
 * Original: https://threejs.org/examples/#webgpu_postprocessing_godrays
 *
 * DEMONSTRATES
 * - `godrays()` (three/addons GodraysNode): screen-space raymarched volumetric
 *   light shafts driven by the scene depth texture and a point light's cube shadow
 *   map, chained through `bilateralBlur()` into a `depthAwareBlend()` composite
 * - Both pipeline dynamism patterns side by side: (b) godrays' own uniform-backed
 *   knobs mutated directly, (c) user-created `uniform()` nodes for
 *   depthAwareBlend's const-wrapped options
 * - A structural on/off toggle — the blur checkbox swaps the pipeline's
 *   `outputNode` between two fully-built composites, not a single uniform
 * - An identity-stable `PointLight` in lazy `useState`, shared between the JSX
 *   scene graph and the create-once pipeline closure that `godrays()` captures
 */
import { Suspense, useLayoutEffect, useMemo, useState } from 'react'
import {
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NoToneMapping,
  PlaneGeometry,
  PointLight,
} from 'three/webgpu'
import { Canvas } from '@react-three/fiber/webgpu'
import { useGLTF } from '@react-three/drei/webgpu'

import { DemoHelpers } from '../../../utils/DemoHelpers'
import { GodraysPipeline } from './GodraysPipeline'

const MODEL_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/godrays_demo.glb'

const LIGHT_COLOR = 0xf6287d
const LIGHT_POS: [number, number, number] = [0, 50, 0]

//* Scene =========================================================

// Concrete pillar field the rays streak through.
function PillarsModel() {
  const { scene: model } = useGLTF(MODEL_URL)

  const materials = useMemo(
    () => ({
      concrete: new MeshStandardMaterial({ color: 0x333333 }),
      base: new MeshStandardMaterial({ color: 0x333333, side: DoubleSide }),
    }),
    [],
  )

  // Material overrides + shadow flags must precede the first render (the shadow
  // setup is read by the first shader-graph build) — useLayoutEffect, idempotent.
  useLayoutEffect(() => {
    const concrete = model.getObjectByName('concrete')
    if (concrete instanceof Mesh) concrete.material = materials.concrete
    const base = model.getObjectByName('base')
    if (base instanceof Mesh) base.material = materials.base
    model.traverse((obj) => {
      if (obj instanceof Mesh) {
        obj.castShadow = true
        obj.receiveShadow = true
      }
    })
  }, [model, materials])

  return <primitive object={model} />
}

// Five black walls boxing the scene 200 units out — they bound the raymarch so the
// shafts read against pure darkness instead of open sky.
const BACKDROP_WALLS: {
  position: [number, number, number]
  rotation?: [number, number, number]
  scale?: [number, number, number]
}[] = [
  { position: [-200, 100, 0], rotation: [0, Math.PI / 2, 0] },
  { position: [200, 100, 0], rotation: [0, Math.PI / 2, 0] },
  { position: [0, 100, -200] },
  { position: [0, 100, 200] },
  { position: [0, 200, 0], rotation: [Math.PI / 2, 0, 0], scale: [3, 6, 1] },
]

function Backdrop() {
  const geometry = useMemo(() => new PlaneGeometry(400, 200), [])
  const material = useMemo(() => new MeshBasicMaterial({ color: 0x000000, side: DoubleSide }), [])

  return (
    <>
      {BACKDROP_WALLS.map((wall, i) => (
        <mesh key={i} geometry={geometry} material={material} castShadow receiveShadow {...wall} />
      ))}
    </>
  )
}

//* Main ===========================================================

export default function PostprocessingGodrays() {
  // Identity-stable across StrictMode re-renders: the create-once pipeline closure
  // captures this exact instance (godrays() reads its shadow camera), so hold it in
  // lazy useState — never useMemo. Shadow config precedes the first render.
  const [pointLight] = useState(() => {
    const light = new PointLight(LIGHT_COLOR, 10000)
    light.castShadow = true
    light.shadow.bias = -0.00001
    light.shadow.mapSize.set(2048, 2048)
    return light
  })

  return (
    <Canvas
      // Original sets no tone mapping (WebGPURenderer default); fiber would default ACES.
      renderer={{ toneMapping: NoToneMapping }}
      // Original enables shadowMap with the three.js default type (PCF).
      shadows="percentage"
      background="#000000"
      camera={{ position: [-175, 50, 0], fov: 60, near: 0.1, far: 1000 }}
    >
      {/* Pipeline (creator hook) rendered BEFORE the suspending sibling — B18. */}
      <GodraysPipeline light={pointLight} />
      <ambientLight color="#cccccc" intensity={0.4} />
      <primitive object={pointLight} position={LIGHT_POS} />
      {/* Visible marker for the light source — no shadow participation. */}
      <mesh position={LIGHT_POS}>
        <sphereGeometry args={[0.5, 16, 16]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <Suspense fallback={null}>
        <PillarsModel />
      </Suspense>
      <Backdrop />
      <DemoHelpers grid={false} target={[0, 0.5, 0]} maxDistance={200} />
    </Canvas>
  )
}

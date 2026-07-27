/**
 * postprocessing-godrays
 * R3F port of three.js `webgpu_postprocessing_godrays`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_postprocessing_godrays (~190 lines of JS)
 *
 * DEMONSTRATES
 * - `godrays()` (three/addons GodraysNode, from three-good-godrays): screen-space
 *   raymarched volumetric light shafts driven by the scene pass DEPTH texture and a
 *   point light's cube shadow map, chained in `useRenderPipeline`
 * - The full recommended chain: scene depth → godrays → `bilateralBlur()` →
 *   `depthAwareBlend()` composite (edge-aware UV push against depth discontinuities)
 * - Both pipeline dynamism patterns side by side: (b) godrays' own uniform()-backed
 *   knobs mutated via return-to-register, (c) user-created three/tsl `uniform()`
 *   nodes for depthAwareBlend's const-wrapped options
 * - Output-node swap for the blur on/off toggle (`renderPipeline.needsUpdate = true`)
 * - An identity-stable PointLight held in lazy `useState`, shared between the JSX
 *   scene graph (`<primitive>`) and the create-once pipeline closure that
 *   `godrays()` captures
 * - The effect's full-shadow-setup requirement: Canvas `shadows`, a shadow-casting
 *   light, cast/receive flags traversed onto the loaded glTF in `useLayoutEffect`
 *
 * DIVERGENCE from original
 * - `renderer.inspector.createParameters` GUI replaced with leva — same knobs and
 *   ranges (raymarch steps / density / max density / distance attenuation, edge
 *   radius / strength, blur toggle), sliders initialized to the node defaults the
 *   original leaves implicit
 * - `passes.scenePass.options.samples = 0`: the post chain samples the scene depth
 *   texture at arbitrary UVs; fiber's Canvas MSAA-4x default would make that target
 *   multisampled, which WebGPU rejects — the corpus samples:0 rule for
 *   depth-consuming passes (the original never opts into MSAA pass targets)
 * - `renderer={{ toneMapping: NoToneMapping }}` pinned explicitly: the original
 *   renders with the WebGPURenderer default (none); fiber would default ACESFilmic
 *   and mute the magenta shafts
 * - OrbitControls replaced by the DemoHelpers camera-controls baseline (same target
 *   and 200-unit dolly cap); grid disabled — the scene is a pitch-black box with its
 *   own base plate
 * - `renderer.inspector = new Inspector()` dropped — this repo doesn't wire the
 *   three.js Inspector
 */
import { Suspense, useLayoutEffect, useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber/webgpu'
import { useGLTF } from '@react-three/drei/webgpu'
import { useControls } from 'leva'
import {
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NoToneMapping,
  PlaneGeometry,
  PointLight,
} from 'three/webgpu'
import { DemoHelpers } from '../../utils/DemoHelpers'
import { GodraysPipeline } from './GodraysPipeline'

const MODEL_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/godrays_demo.glb'

const LIGHT_COLOR = 0xf6287d
const LIGHT_POS: [number, number, number] = [0, 50, 0]

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

export default function PostprocessingGodrays() {
  const { raymarchSteps, density, maxDensity, distanceAttenuation, edgeRadius, edgeStrength, blur } =
    useControls('postprocessing-godrays', {
      raymarchSteps: { value: 60, min: 24, max: 120, step: 1 },
      density: { value: 0.7, min: 0, max: 1, step: 0.01 },
      maxDensity: { value: 0.5, min: 0, max: 1, step: 0.01 },
      distanceAttenuation: { value: 2, min: 0, max: 5, step: 0.05 },
      edgeRadius: { value: 2, min: 0, max: 5, step: 1 },
      edgeStrength: { value: 2, min: 0, max: 5, step: 0.05 },
      blur: true,
    })

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
      // Original sets no tone mapping (WebGPURenderer default NoToneMapping) — see header.
      renderer={{ toneMapping: NoToneMapping }}
      // Original enables shadowMap with the three.js default type (PCF).
      shadows="percentage"
      background="#000000"
      camera={{ position: [-175, 50, 0], fov: 60, near: 0.1, far: 1000 }}
    >
      {/* Pipeline (creator hook) rendered BEFORE the suspending sibling — B18. */}
      <GodraysPipeline
        light={pointLight}
        raymarchSteps={raymarchSteps}
        density={density}
        maxDensity={maxDensity}
        distanceAttenuation={distanceAttenuation}
        edgeRadius={edgeRadius}
        edgeStrength={edgeStrength}
        blur={blur}
      />
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

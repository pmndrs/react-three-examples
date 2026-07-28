/**
 * postprocessing-bloom
 * R3F port of three.js `webgpu_postprocessing_bloom`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_postprocessing_bloom (~150 lines of JS)
 *
 * DEMONSTRATES
 * - The simplest bloom shape: `bloom(scenePassColor)` added straight back onto the
 *   scene color (`scenePassColor.add(bloomPass)`) — no MRT, no selectivity, the whole
 *   frame blooms above its own bright pixels. Point of comparison for the MRT-gated
 *   selective variant (`postprocessing-bloom-selective`)
 * - `bloom()`'s returned node carries its OWN `uniform()`-backed `.threshold`/
 *   `.strength`/`.radius` fields — the return-to-register pattern registers the pass
 *   on `passes` so a leva effect can mutate `.value` directly, no pipeline rebuild
 * - A point light attached to the camera via drei's `<PerspectiveCamera>` — the
 *   declarative equivalent of the original's `camera.add(pointLight)`
 * - `useGLTF` + `useAnimations`, playing the model's own single clip BY NAME (read
 *   off `animations[0].name` rather than hard-coded — the clip name isn't documented
 *   upstream, and blind `Object.values(actions)` is the anti-pattern this repo avoids)
 * - `renderer.toneMappingExposure` driven from leva via `useThree`, matching the
 *   original's `Math.pow(value, 4.0)` response curve
 *
 * DIVERGENCE from original
 * - `renderer.inspector.createParameters` dat.gui panel replaced by leva controls
 *   (bloom threshold/strength/radius, tone-mapping exposure) — same parameters, same
 *   ranges
 * - `scenePassColor.toInspector(...)`/`bloomPass.toInspector(...)` tags dropped — this
 *   repo doesn't wire the three.js Inspector RootState slot yet
 * - DemoHelpers baseline (grid + camera-controls) added; original had a fixed
 *   `OrbitControls` with no ground plane. Grid disabled — the ship floats in black
 *   space, a ground grid would look out of place
 * - `renderer={{ toneMapping: ReinhardToneMapping }}` set explicitly, matching the
 *   original's deliberate choice (not the tone-mapping parity trap — the original DOES
 *   set a tone mapping, just not fiber's ACESFilmic default)
 */
import { Suspense, useEffect } from 'react'
import { Canvas, useRenderPipeline, useThree } from '@react-three/fiber/webgpu'
import { PerspectiveCamera, useAnimations, useGLTF } from '@react-three/drei/webgpu'
import { useControls } from 'leva'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { ReinhardToneMapping } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const SHIP_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/PrimaryIonDrive.glb'

function PrimaryIonDrive() {
  const { scene, animations } = useGLTF(SHIP_URL)
  const { actions } = useAnimations(animations, scene)

  useEffect(() => {
    // Play the model's own clip by name — this GLTF ships exactly one, so there's no
    // rest-pose pollution risk, but the name is read off the clip rather than
    // hard-coded (AGENTS.md: never assume clip names blind).
    const name = animations[0]?.name
    if (name) actions[name]?.play()
  }, [actions, animations])

  return <primitive object={scene} />
}

// renderer.toneMappingExposure imperatively — a WebGPURenderer property, not a TSL
// uniform, so it has no place in the render pipeline graph. Matches the original's
// pow(value, 4) response curve for a perceptually even slider.
function ToneMappingExposure({ exposure }: { exposure: number }) {
  const renderer = useThree((s) => s.renderer)

  useEffect(() => {
    renderer.toneMappingExposure = Math.pow(exposure, 4.0)
  }, [renderer, exposure])

  return null
}

interface PostFXProps {
  threshold: number
  strength: number
  radius: number
}

function PostFX({ threshold, strength, radius }: PostFXProps) {
  const { passes } = useRenderPipeline(({ renderPipeline, passes }) => {
    if (!renderPipeline) return

    const scenePassColor = passes.scenePass.getTextureNode()
    const bloomPass = bloom(scenePassColor)
    renderPipeline.outputNode = scenePassColor.add(bloomPass)

    // Return to register — makes `bloomPass` available on `passes` for the effect
    // below to mutate its uniforms without a pipeline rebuild.
    return { bloomPass }
  })

  useEffect(() => {
    const bloomPass = passes.bloomPass as ReturnType<typeof bloom> | undefined
    if (!bloomPass) return
    bloomPass.threshold.value = threshold
    bloomPass.strength.value = strength
    bloomPass.radius.value = radius
  }, [passes, threshold, strength, radius])

  return null
}

export default function PostprocessingBloom() {
  const { threshold, strength, radius, exposure } = useControls('postprocessing-bloom', {
    threshold: { value: 0, min: 0, max: 1, step: 0.01 },
    strength: { value: 1, min: 0, max: 3, step: 0.01 },
    radius: { value: 0, min: 0, max: 1, step: 0.01 },
    exposure: { value: 1, min: 0.1, max: 2, step: 0.01 },
  })

  return (
    <Canvas
      // Original sets Reinhard explicitly (not fiber's ACESFilmic default).
      renderer={{ toneMapping: ReinhardToneMapping }}
    >
      {/* makeDefault replaces Canvas's implicit camera entirely — the point light
          child is the declarative equivalent of the original's `camera.add(light)`. */}
      <PerspectiveCamera makeDefault position={[-5, 2.5, -3.5]} fov={40} near={1} far={100}>
        <pointLight color="#ffffff" intensity={100} />
      </PerspectiveCamera>
      <ambientLight color="#cccccc" />
      <Suspense fallback={null}>
        <PrimaryIonDrive />
      </Suspense>
      <PostFX threshold={threshold} strength={strength} radius={radius} />
      <ToneMappingExposure exposure={exposure} />
      <DemoHelpers grid={false} minDistance={3} maxDistance={8} maxPolarAngle={Math.PI * 0.5} />
    </Canvas>
  )
}

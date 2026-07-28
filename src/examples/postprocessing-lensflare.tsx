/**
 * postprocessing-lensflare
 * R3F port of three.js `webgpu_postprocessing_lensflare`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_postprocessing_lensflare (~150 lines of JS)
 *
 * DEMONSTRATES
 * - The full bloom → lensflare → blur chain: MRT isolates `emissive` into its own
 *   render target, `bloom()` blows it out, three.js's `lensflare()` TSL node scatters
 *   it into ghosts/streaks from that bloom texture, and a final `gaussianBlur()` softens
 *   the result — each stage is a plain node taking the previous stage's output, no
 *   custom compositing math
 * - Two dynamism patterns side by side in one pipeline: `bloomPass.strength`/`.radius`
 *   are PASS-OWNED uniforms (registered via return-to-register, mutated post-hoc,
 *   `postprocessing-bloom`'s pattern) while `lensflare()`'s `threshold`/
 *   `ghostAttenuationFactor`/`ghostSpacing` are OUR OWN uniform nodes handed directly
 *   into its params object (`postprocessing-anamorphic`'s pattern) — the addon API
 *   shape decides which pattern applies, not a fixed rule
 * - `useLoader(UltraHDRLoader, …)` for a gainmap-JPEG equirect background/environment
 *   (UPSTREAM B13 — drei's `Environment` can't reach this loader, but `useLoader`
 *   always could) — set as `scene.background`/`scene.environment` directly, both
 *   plain typed `Scene` fields, no cast needed
 * - Idempotent Box3-based re-centering of a loaded glTF (`scene.position.sub(center)`)
 *   — safe to run every mount even though `useGLTF`'s cache is a SHARED, un-cloned
 *   object: measuring from the object's current (possibly already-centered) position
 *   converges to a zero offset on repeat calls, unlike the original's `2×pos - center`
 *   arithmetic which assumes a fresh, always-zero starting position
 *
 * DIVERGENCE from original
 * - `renderer.inspector.createParameters` dat.gui panel replaced by leva controls
 *   (bloom strength/radius, lensflare threshold/attenuation/spacing, tone-mapping
 *   exposure)
 * - The original's `OrbitControls` (damping on, pan/zoom OFF, target pinned ~0.01
 *   units in front of the camera — a look-around-only panorama viewer) maps to
 *   DemoHelpers' `pan={false}` plus `minDistance`/`maxDistance` pinned to the same
 *   ~0 dolly range, rather than a dedicated "zoom lock" prop DemoHelpers doesn't have
 * - Grid disabled (`grid={false}`): the HDR interior fills the frame; DemoHelpers'
 *   camera-controls target sits inside the modeled hallway, matching the original
 * - Static-by-design (`"static": true` in the manifest), matching the original: no
 *   time-driven content, motion only comes from user orbit input
 */
import { Suspense, useEffect, useLayoutEffect } from 'react'
import { Canvas, useLoader, useRenderPipeline, useThree } from '@react-three/fiber/webgpu'
import { useGLTF } from '@react-three/drei/webgpu'
import { useControls } from 'leva'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { lensflare } from 'three/addons/tsl/display/LensflareNode.js'
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js'
import { UltraHDRLoader } from 'three/addons/loaders/UltraHDRLoader.js'
import { emissive, mrt, output, uniform } from 'three/tsl'
import { ACESFilmicToneMapping, Box3, EquirectangularReflectionMapping, Vector3 } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const HDR_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/equirectangular/ice_planet_close.jpg'
const HALLWAY_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/space_ship_hallway.glb'

function Environment() {
  const scene = useThree((s) => s.scene)
  const texture = useLoader(UltraHDRLoader, HDR_URL)

  // `.mapping` is read at first-render shader-graph build time by everything that
  // samples this texture (AGENTS.md imperative-setup rule) — must land before that.
  useLayoutEffect(() => {
    texture.mapping = EquirectangularReflectionMapping
    scene.background = texture
    scene.environment = texture
    scene.backgroundIntensity = 2
    scene.environmentIntensity = 15
    return () => {
      scene.background = null
      scene.environment = null
    }
  }, [scene, texture])

  return null
}

function SpaceShipHallway() {
  const { scene } = useGLTF(HALLWAY_URL)

  // Idempotent re-centering — see header DEMONSTRATES (safe against useGLTF's shared,
  // un-cloned cache). Also a build-time-adjacent concern: do it before first paint.
  useLayoutEffect(() => {
    const box = new Box3().setFromObject(scene)
    const center = box.getCenter(new Vector3())
    scene.position.sub(center)
  }, [scene])

  return <primitive object={scene} />
}

interface PostFXProps {
  bloomStrength: number
  bloomRadius: number
  flareThreshold: number
  flareAttenuation: number
  flareSpacing: number
  exposure: number
}

function PostFX({
  bloomStrength,
  bloomRadius,
  flareThreshold,
  flareAttenuation,
  flareSpacing,
  exposure,
}: PostFXProps) {
  const renderer = useThree((s) => s.renderer)

  const { passes } = useRenderPipeline(
    ({ renderPipeline, passes }) => {
      if (!renderPipeline) return

      const outputPass = passes.scenePass.getTextureNode()
      const emissivePass = passes.scenePass.getTextureNode('emissive')

      const bloomPass = bloom(emissivePass, 1, 1)

      const threshold = uniform(0.5)
      const ghostAttenuationFactor = uniform(25)
      const ghostSpacing = uniform(0.25)

      const flarePass = lensflare(bloomPass, { threshold, ghostAttenuationFactor, ghostSpacing })
      const blurPass = gaussianBlur(flarePass, 8)

      renderPipeline.outputNode = outputPass.add(bloomPass).add(blurPass)

      // Return to register — pass-owned bloom uniforms AND our own lensflare uniforms
      // both live on `passes` so the effect below can mutate every knob without a
      // pipeline rebuild.
      return { bloomPass, threshold, ghostAttenuationFactor, ghostSpacing }
    },
    ({ passes }) => {
      passes.scenePass.setMRT(mrt({ output, emissive }))
    },
  )

  useEffect(() => {
    renderer.toneMappingExposure = exposure
  }, [renderer, exposure])

  useEffect(() => {
    const bloomPass = passes.bloomPass as ReturnType<typeof bloom> | undefined
    if (!bloomPass) return
    bloomPass.strength.value = bloomStrength
    bloomPass.radius.value = bloomRadius
  }, [passes, bloomStrength, bloomRadius])

  useEffect(() => {
    const threshold = passes.threshold as ReturnType<typeof uniform> | undefined
    const ghostAttenuationFactor = passes.ghostAttenuationFactor as
      | ReturnType<typeof uniform>
      | undefined
    const ghostSpacing = passes.ghostSpacing as ReturnType<typeof uniform> | undefined
    if (!threshold || !ghostAttenuationFactor || !ghostSpacing) return
    threshold.value = flareThreshold
    ghostAttenuationFactor.value = flareAttenuation
    ghostSpacing.value = flareSpacing
  }, [passes, flareThreshold, flareAttenuation, flareSpacing])

  return null
}

export default function PostprocessingLensflare() {
  const { bloomStrength, bloomRadius, flareThreshold, flareAttenuation, flareSpacing, exposure } =
    useControls('postprocessing-lensflare', {
      bloomStrength: { value: 1, min: 0, max: 2, step: 0.01 },
      bloomRadius: { value: 1, min: 0, max: 1, step: 0.01 },
      flareThreshold: { value: 0.5, min: 0, max: 1, step: 0.01 },
      flareAttenuation: { value: 25, min: 10, max: 50, step: 0.5 },
      flareSpacing: { value: 0.25, min: 0, max: 0.3, step: 0.01 },
      exposure: { value: 1, min: 0.1, max: 2, step: 0.01 },
    })

  return (
    <Canvas
      // Original sets ACESFilmic explicitly — tone-mapping parity rule.
      renderer={{ toneMapping: ACESFilmicToneMapping }}
      camera={{ position: [0, 0.5, -0.5], fov: 45, near: 0.1, far: 100 }}
    >
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes the displayed scene (AGENTS.md; corpus-wide repair, wave 8). */}
      <Suspense fallback={null}>
        <Environment />
        <SpaceShipHallway />
      </Suspense>
      <PostFX
        bloomStrength={bloomStrength}
        bloomRadius={bloomRadius}
        flareThreshold={flareThreshold}
        flareAttenuation={flareAttenuation}
        flareSpacing={flareSpacing}
        exposure={exposure}
      />
      {/* Original: damping on, pan/zoom OFF, target ~0 units in front of camera — a
          look-around-only panorama viewer. */}
      <DemoHelpers
        grid={false}
        pan={false}
        minDistance={0.01}
        maxDistance={0.01}
        target={[0, 0.5, -0.51]}
      />
    </Canvas>
  )
}

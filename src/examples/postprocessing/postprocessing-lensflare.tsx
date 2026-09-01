/**
 * postprocessing-lensflare
 * A hallway lit from an HDR sky, with its bloom scattered into ghosts and streaks
 * by a lens-flare pass before a final blur softens everything.
 * Original: https://threejs.org/examples/#webgpu_postprocessing_lensflare
 *
 * DEMONSTRATES
 * - The full chain: MRT isolates `emissive` into its own render target, `bloom()`
 *   blows it out, `lensflare()` scatters it into ghosts/streaks, `gaussianBlur()`
 *   softens the result — each stage a plain node taking the previous stage's output
 * - One dynamism pattern reused across two passes: `bloom()`'s `.strength`/`.radius`
 *   and `lensflare()`'s `.thresholdNode`/`.ghostAttenuationFactorNode`/
 *   `.ghostSpacingNode` are all assigned `useUniforms` nodes before the shader
 *   compiles — the pipeline callback runs ONCE, so closed-over props would freeze
 * - `useLoader(UltraHDRLoader, …)` for a gainmap-JPEG equirect background/environment
 *   (UPSTREAM B13 — drei's `Environment` can't reach this loader)
 * - Idempotent Box3-based re-centering of a loaded glTF, safe against `useGLTF`'s
 *   shared, un-cloned cache
 */
import { Suspense, useEffect, useLayoutEffect } from 'react'
import { emissive, mrt, output } from 'three/tsl'
import { ACESFilmicToneMapping, Box3, EquirectangularReflectionMapping, Vector3 } from 'three/webgpu'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { lensflare } from 'three/addons/tsl/display/LensflareNode.js'
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js'
import { UltraHDRLoader } from 'three/addons/loaders/UltraHDRLoader.js'
import { Canvas, useLoader, useRenderPipeline, useThree, useUniforms } from '@react-three/fiber/webgpu'
import { useGLTF } from '@react-three/drei/webgpu'
import { useControls } from 'leva'

import { DemoHelpers } from '../../utils/DemoHelpers'

const HDR_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/equirectangular/ice_planet_close.jpg'
const HALLWAY_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/space_ship_hallway.glb'

//* Scene =========================================================

function Environment() {
  const scene = useThree((s) => s.scene)
  const texture = useLoader(UltraHDRLoader, HDR_URL)

  // `.mapping` is read at first-render shader-graph build time by everything that
  // samples this texture — must land before that.
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

  // Re-centering measures from the object's CURRENT position, so it's safe to run
  // every mount even though useGLTF's cache is shared and un-cloned — it converges
  // to a zero offset on repeat calls.
  useLayoutEffect(() => {
    const box = new Box3().setFromObject(scene)
    const center = box.getCenter(new Vector3())
    scene.position.sub(center)
  }, [scene])

  return <primitive object={scene} />
}

//* Post-processing ===============================================

function PostFX() {
  const { bloomStrength, bloomRadius, flareThreshold, flareAttenuation, flareSpacing, exposure } = useControls(
    'Lensflare',
    {
      bloomStrength: { value: 1, min: 0, max: 2, step: 0.01 },
      bloomRadius: { value: 1, min: 0, max: 1, step: 0.01 },
      flareThreshold: { value: 0.5, min: 0, max: 1, step: 0.01 },
      flareAttenuation: { value: 25, min: 10, max: 50, step: 0.5 },
      flareSpacing: { value: 0.25, min: 0, max: 0.3, step: 0.01 },
      exposure: { value: 1, min: 0.1, max: 2, step: 0.01 },
    },
  )
  const bloomUniforms = useUniforms({ strength: bloomStrength, radius: bloomRadius })
  const flareUniforms = useUniforms({
    threshold: flareThreshold,
    ghostAttenuationFactor: flareAttenuation,
    ghostSpacing: flareSpacing,
  })
  const renderer = useThree((s) => s.renderer)

  useRenderPipeline(
    ({ renderPipeline, passes }) => {
      const outputPass = passes.scenePass.getTextureNode()
      const emissivePass = passes.scenePass.getTextureNode('emissive')

      // bloom() and lensflare() both build their own uniforms; swap ours in before
      // the shader compiles (bloom's pattern — see postprocessing-bloom).
      const bloomPass = bloom(emissivePass)
      bloomPass.strength = bloomUniforms.strength
      bloomPass.radius = bloomUniforms.radius

      const flarePass = lensflare(bloomPass)
      flarePass.thresholdNode = flareUniforms.threshold
      flarePass.ghostAttenuationFactorNode = flareUniforms.ghostAttenuationFactor
      flarePass.ghostSpacingNode = flareUniforms.ghostSpacing
      const blurPass = gaussianBlur(flarePass, 8)

      renderPipeline.outputNode = outputPass.add(bloomPass).add(blurPass)
    },
    ({ passes }) => {
      passes.scenePass.setMRT(mrt({ output, emissive }))
    },
  )

  // Exposure is a renderer property, not a node — no place in the graph.
  useEffect(() => {
    renderer.toneMappingExposure = exposure
  }, [renderer, exposure])

  return null
}

export default function PostprocessingLensflare() {
  return (
    <Canvas
      // Original sets ACESFilmic explicitly — tone-mapping parity rule.
      renderer={{ toneMapping: ACESFilmicToneMapping }}
      camera={{ position: [0, 0.5, -0.5], fov: 45, near: 0.1, far: 100 }}
    >
      <Suspense fallback={null}>
        <Environment />
        <SpaceShipHallway />
      </Suspense>
      <PostFX />
      {/* Original: damping on, pan/zoom OFF, target ~0 units in front of camera — a
          look-around-only panorama viewer. */}
      <DemoHelpers grid={false} pan={false} minDistance={0.01} maxDistance={0.01} target={[0, 0.5, -0.51]} />
    </Canvas>
  )
}

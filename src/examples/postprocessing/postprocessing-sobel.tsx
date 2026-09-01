/**
 * postprocessing-sobel
 * A dragon lit by RoomEnvironment PMREM lighting, edge-detected with a Sobel filter.
 * Original: https://threejs.org/examples/#webgpu_postprocessing_sobel
 *
 * DEMONSTRATES
 * - The smallest `useRenderPipeline` shape: one addon node
 *   (`sobel(renderOutput(scenePass))`) assigned straight to
 *   `renderPipeline.outputNode` — no MRT, no pass-owned uniforms
 * - `renderOutput()` applied manually before the effect node, per the addon's own
 *   contract ("apply after tone mapping and output color space conversion") — paired
 *   with `LinearToneMapping` (identity at exposure 1) so the pipeline's automatic
 *   post-transform downstream is a no-op
 * - Toggling the whole pass graph at runtime: `enabled` swaps
 *   `renderPipeline.outputNode` between the sobel node and the plain output
 * - RoomEnvironment PMREM lighting via `PMREMGenerator.fromScene` on a plain
 *   `MeshStandardNodeMaterial` — the showcased imperative escape hatch, same pattern
 *   as `postprocessing-ao`'s `RoomEnv`
 */
import { Suspense, useEffect, useLayoutEffect } from 'react'
import { LinearToneMapping, MeshStandardNodeMaterial, PMREMGenerator } from 'three/webgpu'
import type { Mesh } from 'three/webgpu'
import { renderOutput } from 'three/tsl'
import { sobel } from 'three/addons/tsl/display/SobelOperatorNode.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { Canvas, useRenderPipeline, useThree } from '@react-three/fiber/webgpu'
import { useGLTF } from '@react-three/drei/webgpu'
import { useControls } from 'leva'

import { DemoHelpers } from '../../utils/DemoHelpers'

const MODEL_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/DragonAttenuation.glb'

//* Scene =========================================================

// RoomEnvironment PMREM lighting only (the original never sets scene.background) —
// same imperative escape-hatch pattern as postprocessing-ao's RoomEnv.
function RoomEnv() {
  const renderer = useThree((state) => state.renderer)
  const scene = useThree((state) => state.scene)

  useEffect(() => {
    const environment = new RoomEnvironment()
    const pmremGenerator = new PMREMGenerator(renderer)
    const envRT = pmremGenerator.fromScene(environment, 0.04)
    scene.environment = envRT.texture
    environment.dispose()
    pmremGenerator.dispose()
    return () => {
      scene.environment = null
      envRT.dispose()
    }
  }, [renderer, scene])

  return null
}

// Only the dragon (children[1] of the glTF) — the floor plane is dropped, and the
// original swaps in a plain MeshStandardNodeMaterial so the sobel pass reads a clean,
// evenly-lit surface instead of the source asset's transmissive glass material.
function Dragon() {
  const { scene } = useGLTF(MODEL_URL)
  const dragon = scene.children[1] as Mesh

  // Imperative mesh setup that must precede the first render (the shader graph reads
  // material state once) — useLayoutEffect, not useEffect.
  useLayoutEffect(() => {
    dragon.material = new MeshStandardNodeMaterial()
  }, [dragon])

  return <primitive object={dragon} />
}

//* Post-processing ===============================================

function SobelPipeline() {
  const { enabled } = useControls('Sobel', { enabled: true })
  const { renderPipeline, passes } = useRenderPipeline(({ renderPipeline, passes }) => {
    const scenePassColor = passes.scenePass.getTextureNode()
    const outputPass = renderOutput(scenePassColor)
    const sobelPass = sobel(outputPass)
    renderPipeline.outputNode = sobelPass

    return { outputPass, sobelPass }
  })

  useEffect(() => {
    const outputPass = passes.outputPass as ReturnType<typeof renderOutput> | undefined
    const sobelPass = passes.sobelPass as ReturnType<typeof sobel> | undefined
    if (!renderPipeline || !outputPass || !sobelPass) return
    renderPipeline.outputNode = enabled ? sobelPass : outputPass
    renderPipeline.needsUpdate = true
  }, [renderPipeline, passes, enabled])

  return null
}

export default function PostprocessingSobel() {
  return (
    <Canvas
      // Original sets LinearToneMapping explicitly (identity at exposure 1) — fiber's
      // Canvas would otherwise default to ACESFilmic.
      renderer={{ toneMapping: LinearToneMapping }}
      background="#000000"
      camera={{ position: [0, 1, 3], fov: 70, near: 0.1, far: 100 }}
    >
      {/* SobelPipeline (a creator-hook component) renders BEFORE the suspending
          Dragon sibling — a creator hook after a suspending sibling can trigger the
          B18 setState-in-render escalation into a full B17 pixel freeze (AGENTS.md). */}
      <SobelPipeline />
      <Suspense fallback={null}>
        <RoomEnv />
        <Dragon />
      </Suspense>
      {/* Original disables OrbitControls zoom entirely; DemoHelpers has no
          zoom-disable flag, so dolly is clamped to a single distance instead. */}
      <DemoHelpers grid={false} target={[0, 0.5, 0]} minDistance={3.041} maxDistance={3.041} />
    </Canvas>
  )
}

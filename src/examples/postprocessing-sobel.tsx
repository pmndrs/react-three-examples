/**
 * postprocessing-sobel
 * R3F port of three.js `webgpu_postprocessing_sobel`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_postprocessing_sobel (~140 lines of JS)
 *
 * DEMONSTRATES
 * - The smallest possible `useRenderPipeline` shape: one addon node
 *   (`sobel(renderOutput(scenePass))`) assigned straight to
 *   `renderPipeline.outputNode` — no MRT, no pass-owned uniforms
 * - `renderOutput()` applied manually BEFORE the effect node, per the addon's own
 *   contract ("a sobel filter should be applied after tone mapping and output color
 *   space conversion") — paired with `renderer={{ toneMapping: LinearToneMapping }}`
 *   (identity at exposure 1, matching the original's explicit choice) so
 *   `outputColorTransform`'s automatic re-application downstream is a no-op
 * - Runtime pipeline toggle: leva `enabled` swaps `renderPipeline.outputNode`
 *   between the sobel node and the plain (tone-mapped) scene output,
 *   `renderPipeline.needsUpdate = true` commits it — same return-to-register +
 *   effect-swap shape as the fxaa/smaa/ca siblings in this batch
 * - RoomEnvironment PMREM lighting on a plain `MeshStandardNodeMaterial` via
 *   `PMREMGenerator.fromScene` — the showcased imperative escape hatch, same
 *   pattern as `postprocessing-ao`'s `RoomEnv`
 *
 * DIVERGENCE from original
 * - Loads the full `DragonAttenuation.glb` via drei `useGLTF` and keeps only
 *   `scene.children[1]` (the dragon mesh) — the floor plane (`children[0]`) is
 *   dropped, matching the original's `model = gltf.scene.children[1]`
 * - The original disables OrbitControls zoom entirely (`enableZoom = false`);
 *   DemoHelpers has no zoom-disable flag, so dolly is clamped to a single distance
 *   (`minDistance = maxDistance`) instead
 * - `renderer.inspector.createParameters` panel replaced by a leva `enabled` toggle
 *   (same single knob)
 */
import { Suspense, useEffect, useLayoutEffect } from 'react'
import { Canvas, useRenderPipeline, useThree } from '@react-three/fiber/webgpu'
import { useGLTF } from '@react-three/drei/webgpu'
import { useControls } from 'leva'
import { renderOutput } from 'three/tsl'
import { sobel } from 'three/addons/tsl/display/SobelOperatorNode.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { LinearToneMapping, MeshStandardNodeMaterial, PMREMGenerator } from 'three/webgpu'
import type { Mesh, WebGPURenderer } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const MODEL_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/DragonAttenuation.glb'

// RoomEnvironment PMREM lighting only (the original never sets scene.background) —
// same imperative escape-hatch pattern as postprocessing-ao's RoomEnv.
function RoomEnv() {
  const rawRenderer = useThree((s) => s.renderer)
  const scene = useThree((s) => s.scene)

  useEffect(() => {
    // PMREMGenerator wants the WebGPU renderer; useThree types the union even on
    // the /webgpu entry (upstream fiber gap, UPSTREAM.md B9).
    const renderer = rawRenderer as WebGPURenderer
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
  }, [rawRenderer, scene])

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

function SobelPipeline({ enabled }: { enabled: boolean }) {
  const { renderPipeline, passes } = useRenderPipeline(({ renderPipeline, passes }) => {
    if (!renderPipeline) return

    const scenePassColor = passes.scenePass.getTextureNode()
    const outputPass = renderOutput(scenePassColor)
    const sobelPass = sobel(outputPass)
    renderPipeline.outputNode = sobelPass

    return { outputPass, sobelPass }
  })

  useEffect(() => {
    if (!renderPipeline) return
    const outputPass = passes.outputPass as ReturnType<typeof renderOutput> | undefined
    const sobelPass = passes.sobelPass as ReturnType<typeof sobel> | undefined
    if (!outputPass || !sobelPass) return
    renderPipeline.outputNode = enabled ? sobelPass : outputPass
    renderPipeline.needsUpdate = true
  }, [renderPipeline, passes, enabled])

  return null
}

export default function PostprocessingSobel() {
  const { enabled } = useControls('postprocessing-sobel', { enabled: true })

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
      <SobelPipeline enabled={enabled} />
      <Suspense fallback={null}>
        <RoomEnv />
        <Dragon />
      </Suspense>
      <DemoHelpers grid={false} target={[0, 0.5, 0]} minDistance={3.041} maxDistance={3.041} />
    </Canvas>
  )
}

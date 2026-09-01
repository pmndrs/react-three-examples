/**
 * postprocessing-bloom-emissive
 * R3F port of three.js `webgpu_postprocessing_bloom_emissive`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_postprocessing_bloom_emissive (~169 lines of JS)
 *
 * DEMONSTRATES
 * - Selective bloom via MRT: `setupCB` configures a second "emissive" render target
 *   (`mrt({ output, emissive: vec4(emissive, output.a) })`) so bloom samples ONLY the
 *   material's emissive channel — the visor glows, the rest of the helmet does not —
 *   instead of thresholding the whole scene color the way a naive bloom would
 * - A per-MRT-output blend mode (`mrtNode.setBlendMode('emissive', new BlendMode(...))`)
 *   configured before `scenePass.setMRT()` runs
 * - `useUniforms` feeding live Leva values directly into `bloom()`'s writable
 *   `.strength`/`.radius` fields before shader compilation — no synchronization
 *   effect or pipeline rebuild
 * - `renderer.toneMappingExposure` driven live from leva via `useThree` — a renderer
 *   property mutated imperatively in an effect, not a TSL uniform or Canvas prop
 * - drei's `Environment` (`/webgpu`) supplying a shared HDR background + IBL texture
 *   in one component, replacing the original's manual `HDRLoader`
 *
 * DIVERGENCE from original
 * - DemoHelpers grid disabled (`grid={false}`): the HDR sky background fills the frame
 *   edge-to-edge; a ground grid would cut through open space where the original has none
 * - The original's `renderer.inspector.createParameters` dat.gui-style panel is replaced
 *   with leva controls (bloom strength/radius, tone-mapping exposure) — same parameters,
 *   same ranges
 * - `scenePass.getTextureNode(...).toInspector(...)` tags (built-in three.js Inspector
 *   panel labels) dropped — this repo doesn't wire the Inspector RootState slot yet
 * - OrbitControls' `minDistance`/`maxDistance` dropped: `src/utils/CameraControls.tsx`
 *   (the camera-controls v3 wrapper) doesn't expose distance-limit props yet — a real
 *   gap, not routed around here; `target` is supported and used
 */
import { Suspense, useEffect } from 'react'
import { Canvas, useRenderPipeline, useThree, useUniforms } from '@react-three/fiber/webgpu'
import { Environment, useGLTF } from '@react-three/drei/webgpu'
import { useControls } from 'leva'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { emissive, mrt, output, vec4 } from 'three/tsl'
import { ACESFilmicToneMapping, BlendMode, NormalBlending, UnsignedByteType } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const HELMET_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/DamagedHelmet/glTF/DamagedHelmet.gltf'
const HDR_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/equirectangular/moonless_golf_1k.hdr'

function DamagedHelmet() {
  const { scene } = useGLTF(HELMET_URL)
  return <primitive object={scene} />
}

// Sets renderer.toneMappingExposure imperatively — a WebGPURenderer property, not a
// TSL uniform, so it has no place in the render pipeline graph.
function ToneMappingExposure() {
  const { exposure } = useControls('postprocessing-bloom-emissive', {
    exposure: { value: 1, min: 0.1, max: 2, step: 0.01 },
  })
  const renderer = useThree((s) => s.renderer)

  useEffect(() => {
    renderer.toneMappingExposure = exposure
  }, [renderer, exposure])

  return null
}

// Selective bloom: MRT isolates the emissive channel into its own render target so
// `bloom()` only sees emissive-tagged surfaces, then the bloom result is added back
// onto the regular color output.
function PostFX() {
  //* Controls =====================================================
  const values = useControls('postprocessing-bloom-emissive', {
    bloomStrength: { value: 2.5, min: 0, max: 5, step: 0.05 },
    bloomRadius: { value: 0.5, min: 0, max: 1, step: 0.01 },
  })
  const uniforms = useUniforms(values, 'postprocessingBloomEmissive')

  //* Render Pipeline ==============================================
  useRenderPipeline(
    ({ renderPipeline, passes }) => {
      if (!renderPipeline) return

      const colorTexture = passes.scenePass.getTextureNode()
      const emissiveTexture = passes.scenePass.getTextureNode('emissive')

      // Optimize bandwidth: the emissive target only needs 8 bits/channel (matches
      // the original). `getTexture` (raw RT texture), not `getTextureNode` (TSL node).
      passes.scenePass.getTexture('emissive').type = UnsignedByteType

      const bloomPass = bloom(emissiveTexture)
      bloomPass.strength = uniforms.bloomStrength
      bloomPass.radius = uniforms.bloomRadius
      renderPipeline.outputNode = colorTexture.add(bloomPass)
    },
    ({ passes }) => {
      const mrtNode = mrt({ output, emissive: vec4(emissive, output.a) })
      mrtNode.setBlendMode('emissive', new BlendMode(NormalBlending))
      passes.scenePass.setMRT(mrtNode)
    },
  )

  return null
}

export default function PostprocessingBloomEmissive() {
  return (
    <Canvas
      renderer={{ toneMapping: ACESFilmicToneMapping }}
      camera={{ position: [-1.8, 0.6, 2.7], fov: 45, near: 0.25, far: 20 }}
    >
      <PostFX />
      <ToneMappingExposure />
      <Suspense fallback={null}>
        <Environment files={HDR_URL} background />
        <DamagedHelmet />
      </Suspense>
      <DemoHelpers grid={false} target={[0, 0, -0.2]} />
    </Canvas>
  )
}

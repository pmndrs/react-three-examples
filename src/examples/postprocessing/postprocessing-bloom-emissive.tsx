/**
 * postprocessing-bloom-emissive
 * A damaged helmet whose visor glows — bloom sampled from an emissive MRT channel
 * instead of the whole scene, so only tagged surfaces bloom.
 * Original: https://threejs.org/examples/#webgpu_postprocessing_bloom_emissive
 *
 * DEMONSTRATES
 * - Selective bloom via MRT: `setupCB` configures a second "emissive" render target
 *   (`mrt({ output, emissive: vec4(emissive, output.a) })`) so `bloom()` samples ONLY
 *   the material's emissive channel, not the whole scene color
 * - A per-MRT-output blend mode (`mrtNode.setBlendMode('emissive', …)`) configured
 *   before `scenePass.setMRT()` runs
 * - `useUniforms` feeding leva values directly into `bloom()`'s writable `.strength`/
 *   `.radius` fields before the shader compiles — no sync effect, no rebuild
 * - drei's `Environment` supplying a shared HDR background + IBL texture in one
 *   component
 */
import { Suspense, useEffect } from 'react'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { emissive, mrt, output, vec4 } from 'three/tsl'
import { ACESFilmicToneMapping, BlendMode, NormalBlending, UnsignedByteType } from 'three/webgpu'
import { Canvas, useRenderPipeline, useThree, useUniforms } from '@react-three/fiber/webgpu'
import { Environment, useGLTF } from '@react-three/drei/webgpu'
import { useControls } from 'leva'

import { DemoHelpers } from '../../utils/DemoHelpers'

const HELMET_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/DamagedHelmet/glTF/DamagedHelmet.gltf'
const HDR_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/equirectangular/moonless_golf_1k.hdr'

//* Scene =========================================================

function DamagedHelmet() {
  const { scene } = useGLTF(HELMET_URL)
  return <primitive object={scene} />
}

//* Post-processing ===============================================

// Selective bloom: MRT isolates the emissive channel into its own render target so
// `bloom()` only sees emissive-tagged surfaces, then the bloom result is added back
// onto the regular color output.
function PostFX() {
  const { exposure, ...bloomValues } = useControls('Bloom', {
    bloomStrength: { value: 2.5, min: 0, max: 5, step: 0.05 },
    bloomRadius: { value: 0.5, min: 0, max: 1, step: 0.01 },
    exposure: { value: 1, min: 0.1, max: 2, step: 0.01 },
  })
  const uniforms = useUniforms(bloomValues)
  const renderer = useThree((state) => state.renderer)

  useRenderPipeline(
    ({ renderPipeline, passes }) => {
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

  // Exposure is a renderer property, not a node — no place in the graph.
  useEffect(() => {
    renderer.toneMappingExposure = exposure
  }, [renderer, exposure])

  return null
}

export default function PostprocessingBloomEmissive() {
  return (
    <Canvas
      renderer={{ toneMapping: ACESFilmicToneMapping }}
      camera={{ position: [-1.8, 0.6, 2.7], fov: 45, near: 0.25, far: 20 }}>
      <PostFX />
      <Suspense fallback={null}>
        <Environment files={HDR_URL} background />
        <DamagedHelmet />
      </Suspense>
      <DemoHelpers grid={false} target={[0, 0, -0.2]} />
    </Canvas>
  )
}

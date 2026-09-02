/**
 * postprocessing-pixel
 * A retro-pixelated scene: a glowing crystal, two checker crates, and a floor,
 * rendered at a fraction of the screen resolution with crisp per-pixel edges.
 * Original: https://threejs.org/examples/#webgpu_postprocessing_pixel
 *
 * DEMONSTRATES
 * - `pixelationPass()` (three/addons PixelationPassNode) as the ENTIRE pipeline:
 *   unlike display nodes fed from `passes.scenePass`, it's a PassNode subclass that
 *   renders the scene itself — at (screen / pixelSize) resolution with nearest
 *   filtering and a built-in normal MRT — then draws single-pixel depth/normal
 *   edge outlines. Assigned straight to `renderPipeline.outputNode`
 * - Pipeline dynamism pattern (c): the factory stores whatever node it's given
 *   directly, so three/tsl `uniform()` nodes are created in the mainCB, fed in,
 *   registered via return-to-register, and mutated in an effect
 * - A `manual` orthographic camera: a per-frame `pixelAlignFrustum` snaps it to the
 *   big-pixel grid so panning never shimmers, toggleable to see the difference
 * - `shadows="basic"` (BasicShadowMap — hard edges that pixelate cleanly) and
 *   nearest-filtered/no-mipmap textures as part of the retro look
 */
import { Suspense, useEffect } from 'react'
import { pixelationPass } from 'three/addons/tsl/display/PixelationPassNode.js'
import { uniform } from 'three/tsl'
import { NoToneMapping } from 'three/webgpu'
import type { OrthographicCamera, UniformNode } from 'three/webgpu'
import { Canvas, useFrame, useRenderPipeline, useThree } from '@react-three/fiber/webgpu'
import { useControls } from 'leva'

import { DemoHelpers } from '../../../utils/DemoHelpers'
import { PixelScene } from './PixelScene'
import { pixelAlignFrustum } from './pixelAlignFrustum'

//* Post-processing ===============================================

interface PostFXProps {
  pixelSize: number
  normalEdgeStrength: number
  depthEdgeStrength: number
}

// The pixelation pass renders the scene itself (scene + camera go into the factory),
// so the pipeline's default scenePass is simply left out of the output graph. The
// factory stores whatever node it's given directly, so — like the original —
// uniforms are created here, fed in, registered by returning them, and mutated in
// the effect. PassNode calls setSize() every frame, so a pixelSize change also
// retargets the low-res render target automatically.
function PostFX({ pixelSize, normalEdgeStrength, depthEdgeStrength }: PostFXProps) {
  const { passes } = useRenderPipeline(({ renderPipeline, scene, camera }) => {
    if (!renderPipeline) return

    // Initial values come from the closure ONCE (pipeline callbacks never re-run on
    // re-render); every later change flows through the registered uniforms below.
    const uPixelSize = uniform(pixelSize)
    const uNormalEdgeStrength = uniform(normalEdgeStrength)
    const uDepthEdgeStrength = uniform(depthEdgeStrength)

    const pixelPass = pixelationPass(scene, camera, uPixelSize, uNormalEdgeStrength, uDepthEdgeStrength)
    renderPipeline.outputNode = pixelPass

    return { pixelPass, uPixelSize, uNormalEdgeStrength, uDepthEdgeStrength }
  })

  useEffect(() => {
    // Only `.value` is touched, so the node-type param can stay unknown.
    const uPixelSize = passes.uPixelSize as UniformNode<unknown, number> | undefined
    const uNormalEdgeStrength = passes.uNormalEdgeStrength as UniformNode<unknown, number> | undefined
    const uDepthEdgeStrength = passes.uDepthEdgeStrength as UniformNode<unknown, number> | undefined
    if (!uPixelSize || !uNormalEdgeStrength || !uDepthEdgeStrength) return
    uPixelSize.value = pixelSize
    uNormalEdgeStrength.value = normalEdgeStrength
    uDepthEdgeStrength.value = depthEdgeStrength
  }, [passes, pixelSize, normalEdgeStrength, depthEdgeStrength])

  return null
}

// Owns the `manual` camera frustum. When pixel-aligned panning is on, the frustum is
// snapped to the big-pixel grid every frame (after camera-controls has moved the
// camera); when off, it resets to the plain ±aspect / ±1 frustum — pan around with the
// right mouse button to compare the edge shimmer.
function PixelAlignedFrustum({ enabled, pixelSize }: { enabled: boolean; pixelSize: number }) {
  // useThree's camera types as the base Camera even under `orthographic` — same cast
  // as materials-displacementmap.
  const camera = useThree((s) => s.camera) as OrthographicCamera
  const size = useThree((s) => s.size)

  useFrame(() => {
    const aspectRatio = size.width / size.height
    if (enabled) {
      pixelAlignFrustum(camera, aspectRatio, Math.floor(size.width / pixelSize), Math.floor(size.height / pixelSize))
    } else if (camera.left !== -aspectRatio || camera.top !== 1) {
      // Reset the frustum if pixel alignment (or a resize) has modified it
      camera.left = -aspectRatio
      camera.right = aspectRatio
      camera.top = 1
      camera.bottom = -1
      camera.updateProjectionMatrix()
    }
  })

  return null
}

//* Main ===========================================================

export default function PostprocessingPixel() {
  // Shared by PostFX and PixelAlignedFrustum below — kept at this level rather than
  // split into two useControls calls that would register `pixelSize` twice.
  const { pixelSize, normalEdgeStrength, depthEdgeStrength, pixelAlignedPanning } = useControls('Pixelation', {
    pixelSize: { value: 6, min: 1, max: 16, step: 1 },
    normalEdgeStrength: { value: 0.3, min: 0, max: 2, step: 0.05 },
    depthEdgeStrength: { value: 0.4, min: 0, max: 1, step: 0.05 },
    pixelAlignedPanning: true,
  })

  return (
    <Canvas
      // Original renders with the WebGPURenderer default tone mapping (none) — see header.
      renderer={{ toneMapping: NoToneMapping }}
      shadows="basic"
      background="#151729"
      orthographic
      camera={{
        // `manual` hands the frustum to PixelAlignedFrustum — fiber's resize handling
        // would otherwise overwrite it with pixel-unit bounds.
        manual: true,
        left: -1,
        right: 1,
        top: 1,
        bottom: -1,
        near: 0.1,
        far: 10,
        position: [0, 2 * Math.tan(Math.PI / 6), 2],
      }}>
      <Suspense fallback={null}>
        <PixelScene />
      </Suspense>
      <PostFX pixelSize={pixelSize} normalEdgeStrength={normalEdgeStrength} depthEdgeStrength={depthEdgeStrength} />
      {/* maxZoom: OrbitControls parity — the original caps ortho zoom-in at 2x
          (prop added to the wrapper after this port flagged the gap). */}
      <DemoHelpers grid={false} maxZoom={2} />
      <PixelAlignedFrustum enabled={pixelAlignedPanning} pixelSize={pixelSize} />
    </Canvas>
  )
}

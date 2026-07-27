/**
 * postprocessing-pixel
 * R3F port of three.js `webgpu_postprocessing_pixel`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_postprocessing_pixel (~220 lines of JS)
 *
 * DEMONSTRATES
 * - `pixelationPass()` (three/addons PixelationPassNode) as the ENTIRE pipeline: unlike
 *   display nodes fed from `passes.scenePass`, it is a PassNode subclass that renders
 *   the scene itself — at (screen / pixelSize) resolution with nearest filtering and a
 *   built-in normal MRT — then draws single-pixel outlines from depth/normal edges.
 *   Assigned straight to `renderPipeline.outputNode`; the default scene pass goes unused
 * - Pipeline dynamism pattern (c): the factory const-wraps plain numbers
 *   (`nodeObject()`), so three/tsl `uniform()` nodes are created in the mainCB, fed to
 *   the factory, registered via return-to-register, and mutated (`.value`) in an effect
 * - A `manual` orthographic camera owned by the example: fiber never touches the
 *   frustum, and a per-frame `pixelAlignFrustum` snaps it to the big-pixel grid so
 *   panning never shimmers ("pixel-aligned panning", toggleable to see the difference)
 * - `shadows="basic"` Canvas variant string (BasicShadowMap — hard edges that pixelate
 *   cleanly) and nearest-filtered/no-mipmap textures as part of the retro look
 *
 * DIVERGENCE from original
 * - OrbitControls (maxZoom 2) replaced by the DemoHelpers camera-controls baseline;
 *   the zoom cap uses the wrapper's `maxZoom` prop (camera-controls maps wheel dolly
 *   to `camera.zoom` for orthographic cameras; prop added after this port)
 * - The original's `renderer.inspector.createParameters` panel is replaced with leva
 *   controls — same four parameters, same ranges
 * - `checker.png` is fetched once and cloned twice (the original issues two loads of
 *   the same URL to get independent repeat settings)
 * - The original's `THREE.Timer` is replaced by fiber's `state.elapsed`
 * - Each crate declares its own JSX `<meshPhongMaterial>` (same texture) where the
 *   original shares one material instance between the two boxes
 * - `renderer={{ toneMapping: NoToneMapping }}` set explicitly: the original renders
 *   with the WebGPURenderer default; fiber's Canvas would otherwise default to
 *   ACESFilmic and mute the emissive crystal / amber spotlight palette
 * - DemoHelpers grid disabled — the original has its own 2x2 checker floor
 */
import { Suspense, useEffect } from 'react'
import { Canvas, useFrame, useRenderPipeline, useThree } from '@react-three/fiber/webgpu'
import { useControls } from 'leva'
import { pixelationPass } from 'three/addons/tsl/display/PixelationPassNode.js'
import { uniform } from 'three/tsl'
import { NoToneMapping } from 'three/webgpu'
import type { OrthographicCamera, UniformNode } from 'three/webgpu'
import { DemoHelpers } from '../../utils/DemoHelpers'
import { PixelScene } from './PixelScene'
import { pixelAlignFrustum } from './pixelAlignFrustum'

interface PostFXProps {
  pixelSize: number
  normalEdgeStrength: number
  depthEdgeStrength: number
}

// The pixelation pass renders the scene itself (scene + camera go into the factory),
// so the pipeline's default scenePass is simply left out of the output graph. The
// factory wraps plain numbers in constant nodes, so — like the original — uniforms are
// created here, fed in, registered by returning them, and mutated in the effect.
// PassNode calls setSize() every frame, so a pixelSize change also retargets the
// low-res render target automatically.
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
      pixelAlignFrustum(
        camera,
        aspectRatio,
        Math.floor(size.width / pixelSize),
        Math.floor(size.height / pixelSize),
      )
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

export default function PostprocessingPixel() {
  const { pixelSize, normalEdgeStrength, depthEdgeStrength, pixelAlignedPanning } = useControls(
    'postprocessing-pixel',
    {
      pixelSize: { value: 6, min: 1, max: 16, step: 1 },
      normalEdgeStrength: { value: 0.3, min: 0, max: 2, step: 0.05 },
      depthEdgeStrength: { value: 0.4, min: 0, max: 1, step: 0.05 },
      pixelAlignedPanning: true,
    },
  )

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
      }}
    >
      <Suspense fallback={null}>
        <PixelScene />
      </Suspense>
      <PostFX
        pixelSize={pixelSize}
        normalEdgeStrength={normalEdgeStrength}
        depthEdgeStrength={depthEdgeStrength}
      />
      {/* maxZoom: OrbitControls parity — the original caps ortho zoom-in at 2x
          (prop added to the wrapper after this port flagged the gap). */}
      <DemoHelpers grid={false} maxZoom={2} />
      <PixelAlignedFrustum enabled={pixelAlignedPanning} pixelSize={pixelSize} />
    </Canvas>
  )
}

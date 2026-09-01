// Post-process: a depth-driven `gaussianBlur` (blur radius grows with scene depth,
// same technique as `skinning-instancing`/`shadow-contact`) composited with a
// `screenUV` vignette via `blendOverlay` — three TSL nodes combined into one
// `outputNode`, no manual RenderTarget/QuadMesh plumbing (`useRenderPipeline` owns it).
import { useEffect } from 'react'
import { useRenderPipeline, useUniforms } from '@react-three/fiber/webgpu'
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js'
import { blendOverlay, screenUV } from 'three/tsl'
import type { Node } from 'three/webgpu'

export interface PostFXProps {
  /** Vignette darkening offset (leva `vignetteStrength`; 0.2 matches the original). */
  vignetteStrength: number
}

export function PostFX({ vignetteStrength }: PostFXProps) {
  const { uVignette } = useUniforms(() => ({ uVignette: vignetteStrength }))

  useEffect(() => {
    uVignette.value = vignetteStrength
  }, [uVignette, vignetteStrength])

  useRenderPipeline(({ renderPipeline, passes }) => {
    if (!renderPipeline) return

    const sceneColor = passes.scenePass.getTextureNode()
    const sceneDepth = passes.scenePass.getLinearDepthNode().remapClamp(0.3, 0.7)

    const blurredColor = gaussianBlur(sceneColor)
    blurredColor.directionNode = sceneDepth

    // Cast: fiber's `UniformNode<T>` pins the TSL node-type param to `unknown` (documented
    // fiber typing gap, see skinning-instancing/rtt/shadow-contact/Tree.tsx).
    const vignette = screenUV
      .distance(0.5)
      .mul(1.25)
      .clamp()
      .oneMinus()
      .sub(uVignette as unknown as Node<'float'>)

    renderPipeline.outputNode = blendOverlay(blurredColor, vignette)
  })

  return null
}

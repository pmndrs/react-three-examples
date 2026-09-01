// Post-process: a depth-driven `gaussianBlur` (blur radius grows with scene depth,
// same technique as `skinning-instancing`/`shadow-contact`) composited with a
// `screenUV` vignette via `blendOverlay` — three TSL nodes combined into one
// `outputNode`, no manual RenderTarget/QuadMesh plumbing (`useRenderPipeline` owns it).
import { useEffect } from 'react'
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js'
import { blendOverlay, screenUV } from 'three/tsl'
import { useRenderPipeline, useUniforms } from '@react-three/fiber/webgpu'
import { folder, useControls } from 'leva'

export function PostFX() {
  const { vignetteStrength } = useControls('reflection', {
    Post: folder({
      vignetteStrength: { value: 0.2, min: 0, max: 0.6, step: 0.01 },
    }),
  })

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

    const vignette = screenUV.distance(0.5).mul(1.25).clamp().oneMinus().sub(uVignette)

    renderPipeline.outputNode = blendOverlay(blurredColor, vignette)
  })

  return null
}

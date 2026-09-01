// Post-processing: a depth-driven `gaussianBlur` whose blur direction/strength swaps
// between "blur what's above the waterline" and "blur the whole scene by a flat
// depth-derived amount" based on a `waterMask` test (is the camera above or below the
// water plane, read from `objectPosition(camera).y` vs. a `screenUV`-derived horizon).
// Below the waterline the blurred result is additionally tinted and vignetted. See
// backdrop-water.tsx header DEMONSTRATES.
import { useRenderPipeline } from '@react-three/fiber/webgpu'
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js'
import { color, objectPosition, screenUV } from 'three/tsl'
import type { PerspectiveCamera } from 'three/webgpu'

export function RenderPipelineFX() {
  useRenderPipeline(({ renderPipeline, passes, camera }) => {
    if (!renderPipeline) return

    // Cast: RootState's `camera` is typed as the base `Camera` (no `.near`) even though
    // this example's `<Canvas camera>` is a PerspectiveCamera — same union-typing shape
    // as UPSTREAM.md B9's `renderer` gap, applied to `camera` instead.
    const near = (camera as PerspectiveCamera).near

    const scenePassColor = passes.scenePass.getTextureNode()
    const scenePassDepth = passes.scenePass.getLinearDepthNode().remapClamp(0.3, 0.5)

    const waterMask = objectPosition(camera).y.greaterThan(screenUV.y.sub(0.5).mul(near))

    const scenePassColorBlurred = gaussianBlur(scenePassColor)
    scenePassColorBlurred.directionNode = waterMask.select(
      scenePassDepth,
      passes.scenePass.getLinearDepthNode().mul(5),
    )

    const vignette = screenUV.distance(0.5).mul(1.35).clamp().oneMinus()

    renderPipeline.outputNode = waterMask.select(
      scenePassColorBlurred,
      scenePassColorBlurred.mul(color(0x74ccf4)).mul(vignette),
    )
  })

  return null
}

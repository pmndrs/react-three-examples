// Post pipeline for compute-particles-snow: the scene pass plus an additive half-res
// gaussian soft-focus, a vignette, and a separate object pass of the teapot
// tree-topper blurred and boosted into a glow — the original's RenderPipeline
// composition, rebuilt in fiber's useRenderPipeline.
import { useRenderPipeline } from '@react-three/fiber/webgpu'
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js'
import { pass, screenUV, vec2 } from 'three/tsl'
import type { Mesh } from 'three/webgpu'

export interface SnowPostFXProps {
  /** The glowing teapot mesh — rendered a second time as its own pass. */
  teapot: Mesh
}

export function SnowPostFX({ teapot }: SnowPostFXProps) {
  useRenderPipeline(({ renderPipeline, passes, camera }) => {
    if (!renderPipeline) return

    const scenePassColor = passes.scenePass.getTextureNode()
    const vignette = screenUV.distance(0.5).mul(1.35).clamp().oneMinus()

    // The teapot rendered alone with the main camera: boosted hard for the glow
    // core, plus a fifth-res gaussian halo around it.
    const teapotPass = pass(teapot, camera)
    const teapotPassColor = teapotPass.getTextureNode()
    const teapotPassBlurred = gaussianBlur(teapotPassColor, vec2(1), 6)
    teapotPassBlurred.resolutionScale = 0.2

    // Full-scene soft focus: a half-res blur added faintly on top of the sharp pass
    // (the original creates it bare and assigns `.directionNode = vec2(1)` after —
    // passing vec2(1) as the constructor arg is the same thing).
    const scenePassColorBlurred = gaussianBlur(scenePassColor, vec2(1))
    scenePassColorBlurred.resolutionScale = 0.5

    renderPipeline.outputNode = scenePassColor
      .add(scenePassColorBlurred.mul(0.1))
      .mul(vignette)
      .add(teapotPassColor.mul(10).add(teapotPassBlurred))

    // Return to register — exposes the pass on `state.passes` for inspection.
    return { teapotPass }
  })

  return null
}

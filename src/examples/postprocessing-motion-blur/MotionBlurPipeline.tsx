// Velocity-based motion blur pipeline: the scene pass renders color + per-pixel
// motion vectors via MRT (setupCB — MRT must be configured before mainCB runs),
// `motionBlur()` smears the beauty texture along the velocity texture, and a TSL
// screen-space vignette wraps the result.
import { useEffect } from 'react'
import { useRenderPipeline } from '@react-three/fiber/webgpu'
import { motionBlur } from 'three/addons/tsl/display/MotionBlur.js'
import { mrt, output, screenUV, uniform, vec4, velocity } from 'three/tsl'
import type { UniformNode } from 'three/webgpu'

export interface MotionBlurPipelineProps {
  blurAmount: number
}

export function MotionBlurPipeline({ blurAmount }: MotionBlurPipelineProps) {
  const { passes } = useRenderPipeline(
    ({ renderPipeline, passes }) => {
      if (!renderPipeline) return

      // Pattern (c): `motionBlur()` is a plain TSL Fn with no uniform()-backed knob
      // fields — the blur strength scales the velocity TEXTURE node instead. So the
      // uniform is created here (initial value from the closure, read ONCE — pipeline
      // callbacks never re-run on re-render), registered via return-to-register, and
      // mutated in the effect below. Exactly what the original does.
      const uBlurAmount = uniform(blurAmount)

      const beauty = passes.scenePass.getTextureNode()
      const vel = passes.scenePass.getTextureNode('velocity').mul(uBlurAmount)

      const blurred = motionBlur(beauty, vel)

      // Screen-space vignette over the blurred beauty, as in the original.
      const vignette = screenUV.distance(0.5).remap(0.6, 1).mul(2).clamp().oneMinus()

      renderPipeline.outputNode = vec4(vignette.mul(blurred.rgb), blurred.a)

      return { uBlurAmount }
    },
    ({ passes }) => {
      // MRT config goes in setupCB: beauty (`output`) + motion vectors (`velocity`).
      passes.scenePass.setMRT(mrt({ output, velocity }))
    },
  )

  useEffect(() => {
    // Only `.value` is touched, so the node-type param can stay unknown.
    const uBlurAmount = passes.uBlurAmount as UniformNode<unknown, number> | undefined
    if (!uBlurAmount) return
    uBlurAmount.value = blurAmount
  }, [passes, blurAmount])

  return null
}

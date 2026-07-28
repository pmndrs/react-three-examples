// chromaticAberration() over the tone-mapped scene, same outputColorTransform=false +
// manual renderOutput() shape as postprocessing-fxaa. Unlike fxaa()/smaa()/sobel(),
// the addon wraps plain numbers in CONST nodes (nodeObject()) rather than exposing its
// own uniform()-backed fields — pattern (c): the caller creates three/tsl uniform()
// nodes and passes THEM in, exactly what the original does with its `staticStrength` /
// `staticCenter` / `staticScale` uniforms.
import { useEffect } from 'react'
import { useRenderPipeline } from '@react-three/fiber/webgpu'
import { renderOutput, uniform } from 'three/tsl'
import { chromaticAberration } from 'three/addons/tsl/display/ChromaticAberrationNode.js'
import { Vector2 } from 'three/webgpu'
import type { UniformNode } from 'three/webgpu'

export interface CAPipelineProps {
  enabled: boolean
  strength: number
  centerX: number
  centerY: number
  scale: number
}

export function CAPipeline({ enabled, strength, centerX, centerY, scale }: CAPipelineProps) {
  const { renderPipeline, passes } = useRenderPipeline(({ renderPipeline, passes }) => {
    if (!renderPipeline) return

    renderPipeline.outputColorTransform = false

    const scenePassColor = passes.scenePass.getTextureNode()
    const outputPass = renderOutput(scenePassColor)

    // Initial values come from the closure ONCE (pipeline callbacks never re-run on
    // re-render); every later change flows through the registered uniforms below.
    const uStrength = uniform(strength)
    const uCenter = uniform(new Vector2(centerX, centerY))
    const uScale = uniform(scale)

    const caPass = chromaticAberration(outputPass, uStrength, uCenter, uScale)

    return { outputPass, caPass, uStrength, uCenter, uScale }
  })

  useEffect(() => {
    if (!renderPipeline) return
    const outputPass = passes.outputPass as ReturnType<typeof renderOutput> | undefined
    const caPass = passes.caPass as ReturnType<typeof chromaticAberration> | undefined
    if (!outputPass || !caPass) return
    renderPipeline.outputNode = enabled ? caPass : outputPass
    renderPipeline.needsUpdate = true
  }, [renderPipeline, passes, enabled])

  useEffect(() => {
    // Only `.value` is touched, so the node-type params can stay unknown.
    const uStrength = passes.uStrength as UniformNode<unknown, number> | undefined
    const uCenter = passes.uCenter as UniformNode<unknown, Vector2> | undefined
    const uScale = passes.uScale as UniformNode<unknown, number> | undefined
    if (!uStrength || !uCenter || !uScale) return
    uStrength.value = strength
    uCenter.value.set(centerX, centerY)
    uScale.value = scale
  }, [passes, strength, centerX, centerY, scale])

  return null
}

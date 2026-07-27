// Godrays render pipeline: the scene pass depth feeds a screen-space raymarched
// godrays pass (occlusion-tested against the point light's cube shadow map), the
// result is bilateral-blurred, then depth-aware-blended over the beauty pass.
import { useEffect } from 'react'
import { useRenderPipeline } from '@react-three/fiber/webgpu'
import { godrays } from 'three/addons/tsl/display/GodraysNode.js'
import { bilateralBlur } from 'three/addons/tsl/display/BilateralBlurNode.js'
import { depthAwareBlend } from 'three/addons/tsl/display/depthAwareBlend.js'
import { color, float, int, uniform } from 'three/tsl'
import type { Node, PointLight, UniformNode } from 'three/webgpu'

export interface GodraysPipelineProps {
  /** The shadow-casting point light the rays are marched for. */
  light: PointLight
  raymarchSteps: number
  density: number
  maxDensity: number
  distanceAttenuation: number
  edgeRadius: number
  edgeStrength: number
  blur: boolean
}

export function GodraysPipeline({
  light,
  raymarchSteps,
  density,
  maxDensity,
  distanceAttenuation,
  edgeRadius,
  edgeStrength,
  blur,
}: GodraysPipelineProps) {
  const { renderPipeline, passes } = useRenderPipeline(({ renderPipeline, passes, camera }) => {
    if (!renderPipeline) return

    // godrays + depthAwareBlend sample the scene pass's DEPTH texture at arbitrary
    // UVs — fiber's Canvas MSAA-4x default would make that target multisampled,
    // which WebGPU rejects (samples:0 rule for depth-consuming passes; same fix as
    // postprocessing-ao / materials-alphahash).
    passes.scenePass.options.samples = 0

    const scenePassColor = passes.scenePass.getTextureNode('output')
    const scenePassDepth = passes.scenePass.getTextureNode('depth')

    // Screen-space raymarched godrays. The effect REQUIRES a full shadow setup:
    // Canvas `shadows`, a shadow-casting light, cast/receive flags on the meshes.
    const godraysPass = godrays(scenePassDepth, camera, light)
    const godraysPassColor = godraysPass.getTextureNode()

    // Bilateral blur mitigates raymarching/noise artifacts without bleeding edges.
    const blurPass = bilateralBlur(godraysPassColor)
    const blurPassColor = blurPass.getTextureNode()

    // Composite knobs — depthAwareBlend wraps plain numbers in CONSTANT nodes
    // (dynamism pattern (c), like dof()): create three/tsl uniform() nodes here,
    // register them via return-to-register, mutate `.value` in the effects below.
    const uEdgeRadius = uniform(int(2))
    const uEdgeStrength = uniform(float(2))
    const blendOptions = {
      blendColor: uniform(color(0xf6287d)),
      edgeRadius: uEdgeRadius,
      edgeStrength: uEdgeStrength,
    }

    // Depth-aware blend pushes sample UVs away from depth discontinuities to
    // avoid light leaking/haloing at silhouettes. Two composites are built once;
    // the blur toggle swaps between them (exactly what the original's GUI does).
    const outputBlurred = depthAwareBlend(scenePassColor, blurPassColor, scenePassDepth, camera, blendOptions)
    const outputRaw = depthAwareBlend(scenePassColor, godraysPassColor, scenePassDepth, camera, blendOptions)

    renderPipeline.outputNode = outputBlurred

    return { godraysPass, uEdgeRadius, uEdgeStrength, outputBlurred, outputRaw }
  })

  // Dynamism pattern (b): godrays' knobs are uniform()-backed fields on the node —
  // mutate `.value` directly, no rebuild.
  useEffect(() => {
    const godraysPass = passes.godraysPass as ReturnType<typeof godrays> | undefined
    if (!godraysPass) return
    godraysPass.raymarchSteps.value = raymarchSteps
    godraysPass.density.value = density
    godraysPass.maxDensity.value = maxDensity
    godraysPass.distanceAttenuation.value = distanceAttenuation
  }, [passes, raymarchSteps, density, maxDensity, distanceAttenuation])

  useEffect(() => {
    const uEdgeRadius = passes.uEdgeRadius as UniformNode<'int', number> | undefined
    const uEdgeStrength = passes.uEdgeStrength as UniformNode<'float', number> | undefined
    if (!uEdgeRadius || !uEdgeStrength) return
    uEdgeRadius.value = edgeRadius
    uEdgeStrength.value = edgeStrength
  }, [passes, edgeRadius, edgeStrength])

  // Blur toggle: swap the pipeline output between the blurred and raw composites —
  // a graph swap, so the pipeline must be flagged for update.
  useEffect(() => {
    const outputBlurred = passes.outputBlurred as Node<'vec4'> | undefined
    const outputRaw = passes.outputRaw as Node<'vec4'> | undefined
    if (!renderPipeline || !outputBlurred || !outputRaw) return
    renderPipeline.outputNode = blur ? outputBlurred : outputRaw
    renderPipeline.needsUpdate = true
  }, [renderPipeline, passes, blur])

  return null
}

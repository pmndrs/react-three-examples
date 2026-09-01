// PostFX — whole-frame bloom (threshold 0) added onto the scene color, plus the
// renderer-level tone-mapping exposure knob.
import { useEffect } from 'react'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'

import { useRenderPipeline, useThree, useUniforms } from '@react-three/fiber/webgpu'
import { folder, useControls } from 'leva'

// bloom()'s own uniform()-backed .strength/.radius fields get swapped for ours before
// the shader compiles — the pipeline callback runs once, so a closed-over leva prop
// would freeze at its first value (AGENTS.md § Post-processing pattern (b)).
export function PostFX() {
  const { bloomStrength, bloomRadius } = useControls('ocean', {
    bloom: folder({
      bloomStrength: { value: 0.1, min: 0, max: 3, step: 0.01 },
      bloomRadius: { value: 0, min: 0, max: 1, step: 0.01 },
    }),
  })
  const uniforms = useUniforms({ bloomStrength, bloomRadius })

  useRenderPipeline(({ renderPipeline, passes }) => {
    const scenePassColor = passes.scenePass.getTextureNode('output')
    const bloomPass = bloom(scenePassColor)
    bloomPass.strength = uniforms.bloomStrength
    bloomPass.radius = uniforms.bloomRadius
    renderPipeline.outputNode = scenePassColor.add(bloomPass)
  })

  return null
}

// renderer.toneMappingExposure is a WebGPURenderer property, not a TSL uniform —
// mutated imperatively (same pattern as sky/postprocessing-bloom-emissive).
export function ToneMappingExposure() {
  const renderer = useThree((s) => s.renderer)
  const { exposure } = useControls('ocean', {
    sky: folder({
      exposure: { value: 0.1, min: 0, max: 1, step: 0.0001 },
    }),
  })

  useEffect(() => {
    renderer.toneMappingExposure = exposure
  }, [renderer, exposure])

  return null
}

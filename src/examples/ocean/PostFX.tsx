// PostFX — whole-frame bloom (threshold 0) added onto the scene color, plus the
// renderer-level tone-mapping exposure knob.
import { useEffect } from 'react'
import { useRenderPipeline, useThree } from '@react-three/fiber/webgpu'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'

export interface PostFXProps {
  strength: number
  radius: number
}

// Return-to-register exposes the bloom pass so leva mutates its own `uniform()`-backed
// `.strength`/`.radius` fields — no pipeline rebuild, no fiber uniform cast needed.
export function PostFX({ strength, radius }: PostFXProps) {
  const { passes } = useRenderPipeline(({ renderPipeline, passes }) => {
    if (!renderPipeline) return

    const scenePassColor = passes.scenePass.getTextureNode('output')
    const bloomPass = bloom(scenePassColor, strength, radius, 0)
    renderPipeline.outputNode = scenePassColor.add(bloomPass)

    return { bloomPass }
  })

  useEffect(() => {
    const bloomPass = passes.bloomPass as ReturnType<typeof bloom> | undefined
    if (!bloomPass) return
    bloomPass.strength.value = strength
    bloomPass.radius.value = radius
  }, [passes, strength, radius])

  return null
}

// renderer.toneMappingExposure is a WebGPURenderer property, not a TSL uniform —
// mutated imperatively (same pattern as sky/postprocessing-bloom-emissive).
export function ToneMappingExposure({ exposure }: { exposure: number }) {
  const renderer = useThree((s) => s.renderer)

  useEffect(() => {
    renderer.toneMappingExposure = exposure
  }, [renderer, exposure])

  return null
}

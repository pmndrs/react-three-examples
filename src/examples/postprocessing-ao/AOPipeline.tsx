// GTAO + TRAA render pipeline: a dedicated pre-pass (packed normals + velocity via
// MRT) feeds the AO node, whose output modulates the scene's AMBIENT lighting term
// through `builtinAOContext` — not a naive multiply over the final color. TRAA then
// resolves GTAO's per-frame sampling noise using the same pre-pass depth + velocity.
import { useEffect } from 'react'
import { useRenderPipeline, useThree } from '@react-three/fiber/webgpu'
import { ao } from 'three/addons/tsl/display/GTAONode.js'
import { traa } from 'three/addons/tsl/display/TRAANode.js'
import {
  builtinAOContext,
  mrt,
  normalView,
  packNormalToRGB,
  pass,
  sample,
  screenUV,
  unpackRGBToNormal,
  vec3,
  vec4,
  velocity,
} from 'three/tsl'
import { NeutralToneMapping, NoToneMapping, UnsignedByteType } from 'three/webgpu'

export interface AOPipelineProps {
  samples: number
  distanceExponent: number
  distanceFallOff: number
  radius: number
  scale: number
  thickness: number
  temporalFiltering: boolean
  aoOnly: boolean
}

export function AOPipeline({
  samples,
  distanceExponent,
  distanceFallOff,
  radius,
  scale,
  thickness,
  temporalFiltering,
  aoOnly,
}: AOPipelineProps) {
  const renderer = useThree((s) => s.renderer)

  const { renderPipeline, passes } = useRenderPipeline(({ renderPipeline, passes, scene, camera }) => {
    if (!renderPipeline) return

    // TRAA supersedes MSAA, and pass targets inherit the renderer's sample count
    // (fiber Canvas defaults to MSAA 4x) — multisampled depth breaks TRAA's
    // depth-history copyTextureToTexture. Force both passes to 0 samples, as the
    // original does on its TRAA path (`scenePass.options.samples = useTRAA ? 0 : 4`).
    passes.scenePass.options.samples = 0

    // Pre-pass: RGB-packed view-space normals + velocity, opaque objects only
    // (the transparent test plane must not occlude). Built here in the mainCB —
    // the callback's RootState carries scene and camera for extra passes.
    const prePass = pass(scene, camera, { samples: 0 })
    prePass.name = 'Pre-Pass'
    prePass.transparent = false
    prePass.setMRT(mrt({ output: packNormalToRGB(normalView), velocity }))

    // Bandwidth optimization: packed normals fit in 8 bits per channel.
    prePass.getTexture('output').type = UnsignedByteType

    const prePassNormal = sample((uv) => unpackRGBToNormal(prePass.getTextureNode().sample(uv)))
    const prePassDepth = prePass.getTextureNode('depth')
    const prePassVelocity = prePass.getTextureNode('velocity')

    // GTAO — half resolution is sufficient since TRAA smooths the result.
    const aoPass = ao(prePassDepth, prePassNormal, camera)
    aoPass.resolutionScale = 0.5
    aoPass.useTemporalFiltering = true

    // Feed the AO term into the scene pass's built-in ambient occlusion context:
    // occlusion darkens ambient/indirect light where geometry creases, instead of
    // flat-multiplying the beauty pass.
    passes.scenePass.contextNode = builtinAOContext(aoPass.getTextureNode().sample(screenUV).r)

    // TRAA resolves the temporal noise of GTAO.
    const traaPass = traa(passes.scenePass, prePassDepth, prePassVelocity, camera)
    traaPass.useSubpixelCorrection = false

    // Debug view: raw AO term as grayscale (swapped in by the effect below).
    const aoOnlyNode = vec4(vec3(aoPass.r), 1)

    renderPipeline.outputNode = traaPass

    // Return to register — the effects below mutate the pass-owned uniforms and
    // swap outputNode without a pipeline rebuild.
    return { prePass, aoPass, traaPass, aoOnlyNode }
  })

  // Pattern (b): GTAO's knobs are three.js `uniform()`-backed fields on the node —
  // mutate `.value` directly, no fiber uniforms and no rebuild needed.
  useEffect(() => {
    const aoPass = passes.aoPass as ReturnType<typeof ao> | undefined
    if (!aoPass) return
    aoPass.samples.value = samples
    aoPass.distanceExponent.value = distanceExponent
    aoPass.distanceFallOff.value = distanceFallOff
    aoPass.radius.value = radius
    aoPass.scale.value = scale
    aoPass.thickness.value = thickness
    aoPass.useTemporalFiltering = temporalFiltering
  }, [passes, samples, distanceExponent, distanceFallOff, radius, scale, thickness, temporalFiltering])

  // AO-only debug view: swap the pipeline output between the TRAA beauty chain and
  // the raw AO node, drop tone mapping for the grayscale view (as the original does),
  // and flag the pipeline for an update.
  useEffect(() => {
    const traaPass = passes.traaPass as ReturnType<typeof traa> | undefined
    const aoOnlyNode = passes.aoOnlyNode as ReturnType<typeof vec4> | undefined
    if (!renderPipeline || !traaPass || !aoOnlyNode) return
    renderPipeline.outputNode = aoOnly ? aoOnlyNode : traaPass
    renderer.toneMapping = aoOnly ? NoToneMapping : NeutralToneMapping
    renderPipeline.needsUpdate = true
  }, [renderPipeline, passes, renderer, aoOnly])

  return null
}

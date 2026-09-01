// The duck's caustic node graph, ported verbatim from the original's TSL block:
// refract the view ray through the duck's transmissive shell, project it onto a
// caustic photo texture with per-channel chromatic aberration, and reuse that same
// projection both as the shadow-cast color (glowing caustic patterns on the floor)
// and — scaled by a light-facing scattering term — as the duck's own emissive (a
// cheap subsurface-scattering stand-in that brightens the side facing the spot light).
import { div, float, lightViewPosition, normalView, positionView, positionViewDirection, refract, texture, uniform, vec2, vec3, Fn } from 'three/tsl'
import type { MeshPhysicalNodeMaterial, Node, SpotLight, Texture } from 'three/webgpu'

export interface DuckShadingDeps {
  material: MeshPhysicalNodeMaterial
  causticMap: Texture
  spotLight: SpotLight
  /** GUI-driven uniform: how tightly the caustic projection follows the normal (pow exponent). */
  causticOcclusion: Node<'float'>
}

export function createDuckShading({ material, causticMap, spotLight, causticOcclusion }: DuckShadingDeps) {
  // Fn()().toVar() ported verbatim — the Fn wrapper gives the body an active TSL
  // stack (not strictly required here since there's no .toVar()/.assign() inside,
  // but kept for fidelity with the original's exact structure).
  const causticEffect = Fn(() => {
    const refractionVector = refract(positionViewDirection.negate(), normalView, div(1.0, material.ior)).normalize()
    const viewZ = normalView.z.pow(causticOcclusion)

    const textureUV = refractionVector.xy.mul(0.6)

    // Wraps the material's LIVE Color object — mutating `material.color` (leva ->
    // effect) is picked up with zero extra sync code (AGENTS.md uniform-wraps-live-object
    // pattern).
    const causticColor = uniform(material.color)
    const chromaticAberrationOffset = normalView.z.pow(-0.9).mul(0.004)

    const causticProjection = vec3(
      texture(causticMap, textureUV.add(vec2(chromaticAberrationOffset.negate(), 0))).r,
      texture(causticMap, textureUV.add(vec2(0, chromaticAberrationOffset.negate()))).g,
      texture(causticMap, textureUV.add(vec2(chromaticAberrationOffset, chromaticAberrationOffset))).b,
    )

    return causticProjection.mul(viewZ.mul(60)).add(viewZ).mul(causticColor)
  })().toVar()

  const emissiveNode = Fn(() => {
    // Custom emissive for illuminating the backside of the mesh based on the caustic
    // effect and light direction.
    const thicknessPowerNode = float(3.0)

    const scatteringHalf = lightViewPosition(spotLight).sub(positionView).normalize()
    const scatteringDot = float(positionViewDirection.dot(scatteringHalf.negate()).saturate().pow(thicknessPowerNode))

    return causticEffect.mul(scatteringDot.add(0.1)).mul(0.02)
  })()

  return { causticEffect, emissiveNode }
}

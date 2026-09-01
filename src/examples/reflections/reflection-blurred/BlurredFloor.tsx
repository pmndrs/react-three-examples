// The blurred-reflection floor: a TSL `reflector()` with depth output, masked and
// hash-blurred inside the floor material's `colorNode`, plus the animated ripple-ring
// graph that both colors the floor and drives a `PointLight.colorNode` so the rings
// cast real light. See reflection-blurred.tsx header DEMONSTRATES / DIVERGENCE.
import { useEffect, useMemo } from 'react'
import {
  Fn,
  abs,
  color,
  float,
  fract,
  hue,
  length,
  mix,
  positionWorld,
  pow,
  rangeFogFactor,
  reflector,
  sample,
  time,
  uniform,
  vec2,
  vec4,
} from 'three/tsl'
import { hashBlur } from 'three/addons/tsl/display/hashBlur.js'
import { BoxGeometry, Mesh, MeshStandardNodeMaterial, PointLight } from 'three/webgpu'
import type { Node } from 'three/webgpu'

// Traveling ripple rings (https://www.shadertoy.com/view/3tdSRn), ported from the
// original's `drawCircle` TSL `Fn`. Written as a plain node-builder function: every
// call site passes build-time constants (Layer 1 build-time-vs-run-time rule), so
// runtime `Fn` parameters would only add B10 param casts. The original's
// `dist1.assign(fract(...))` is inlined into the fract chain.
function drawCircle(pos: Node<'vec2'>, radius: number, width: number, power: number, ringColor: Node<'vec3'>) {
  const timer = time.mul(0.5)
  const dist1 = fract(length(pos).mul(5.0).sub(fract(timer)))
  const dist2 = dist1.sub(radius)
  const intensity = pow(float(radius).div(abs(dist2)), width)

  return ringColor.mul(intensity).mul(power).mul(float(0.8).sub(abs(dist2)).max(0.0))
}

export interface BlurredFloorProps {
  /** Reflection roughness: raises blur weight and shortens the sharp contact band. */
  roughness: number
  /** Hash-blur radius. */
  radius: number
  /** Reflector render-target scale (live: the reflector resizes per frame). */
  resolutionScale: number
}

export function BlurredFloor({ roughness, radius, resolutionScale }: BlurredFloorProps) {
  const { floorMesh, reflectionTarget, floorLight, reflection, uRoughness, uRadius } = useMemo(() => {
    const uRoughness = uniform(0.9)
    const uRadius = uniform(0.2)

    // circle effect — fades with height so the rings hug the floor, shifts from cyan
    // to violet with distance from the origin, and hue-cycles with time
    const circleFadeY = positionWorld.y.mul(0.7).oneMinus().max(0)
    const animatedColor = mix(color(0x74ccf4), color(0x7f00c5), positionWorld.xz.distance(vec2(0)).div(10).clamp())
    const animatedCircle = hue(drawCircle(positionWorld.xz.mul(0.1), 0.5, 0.8, 0.01, animatedColor).mul(circleFadeY), time)

    // The rings also emit light. Cast: `colorNode` is read off the live light by
    // `AnalyticLightNode`'s constructor (`(light && light.colorNode) || uniform(color)`,
    // verified in three/src/nodes/lighting/AnalyticLightNode.js), but @types/three
    // doesn't declare it on `Light` — B11-family duck-typed-property gap.
    const floorLight = new PointLight(0xffffff)
    ;(floorLight as unknown as { colorNode: Node }).colorNode = animatedCircle.mul(50)

    // reflection — half-resolution mirror render with a depth attachment; bounces off
    // since nothing else reflects
    const reflection = reflector({ resolutionScale: 0.5, depth: true, bounces: false })
    const reflectionDepth = reflection.getDepthNode()
    reflection.target.rotateX(-Math.PI / 2)

    const floorMaterial = new MeshStandardNodeMaterial()
    floorMaterial.transparent = true
    floorMaterial.colorNode = Fn(() => {
      // ranges adjustment
      const radiusRange = mix(0.01, 0.1, uRadius) // range [ 0.01, 0.1 ]
      const roughnessRange = mix(0.3, 0.03, uRoughness) // range [ 0.03, 0.3 ]

      // mask the reflection color by its own depth before blurring, so the blur can't
      // bleed the sky/background into on-floor contact areas
      const maskReflection = sample((uvNode) => {
        const reflectionSample = reflection.sample(uvNode)
        const mask = reflectionDepth.sample(uvNode)

        return vec4(reflectionSample.rgb, reflectionSample.a.mul(mask.r))
        // Narrowing cast: `reflector()` always constructs with a vec2 default `uvNode`
        // (`screenUV.flipX()`), but @types/three declares the general TextureNode field
        // as `Node<'vec2'> | Node<'vec3'> | null` — same non-null/narrow note as the
        // `reflection` cousin's `uvNode` use.
      }, reflection.uvNode as Node<'vec2'> | null)

      // blur the reflection. Cast on the options object: npm three 0.185.1's hashBlur
      // reads `{ repeats, premultipliedAlpha }` (verified in
      // node_modules/three/examples/jsm/tsl/display/hashBlur.js), but the installed
      // @types/three tracks a newer revision typed `{ size, mask, premultipliedAlpha }`
      // — B11-family @types-ahead-of-runtime drift.
      const reflectionBlurred = hashBlur(maskReflection, radiusRange, {
        repeats: 40,
        premultipliedAlpha: true,
      } as Parameters<typeof hashBlur>[2])

      // reflection composite: depth remap keeps contact reflections sharp and lets
      // distance dissolve into the blurred read
      // `.r` keeps the mask chain scalar: the original multiplies by the whole depth
      // sample (float × vec4), relying on TSL codegen truncation when the vec4 lands in
      // `mix()`'s factor slot — only the depth in `.r` carries information either way,
      // and the scalar form is what @types' `mix` overloads accept.
      const reflectionMask = reflectionBlurred.a.mul(reflectionDepth.r).remapClamp(0, roughnessRange)
      const reflectionIntensity = 0.1
      const reflectionMixFactor = reflectionMask.mul(uRoughness.mul(2).min(1))
      const reflectionFinal = mix(reflection.rgb, reflectionBlurred.rgb, reflectionMixFactor).mul(reflectionIntensity)

      // mix reflection with the animated rings, and fall off opacity by distance like
      // an opacity-fog
      const output = animatedCircle.add(reflectionFinal)
      const opacity = rangeFogFactor(7, 25).oneMinus()

      return vec4(output, opacity)
    })()

    const floorMesh = new Mesh(new BoxGeometry(50, 0.001, 50), floorMaterial)

    return { floorMesh, reflectionTarget: reflection.target, floorLight, reflection, uRoughness, uRadius }
  }, [])

  useEffect(() => {
    uRoughness.value = roughness
  }, [uRoughness, roughness])

  useEffect(() => {
    uRadius.value = radius
  }, [uRadius, radius])

  useEffect(() => {
    reflection.reflector.resolutionScale = resolutionScale
  }, [reflection, resolutionScale])

  return (
    <>
      <primitive object={floorMesh} />
      <primitive object={reflectionTarget} />
      <primitive object={floorLight} />
    </>
  )
}

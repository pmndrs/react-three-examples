// Tornado scene role: the three stacked VFX meshes — a radial-noise floor plate and
// two parabola-twisted cylinders (emissive core + dark smoke shell), each authored as
// a MeshBasicNodeMaterial `outputNode`/`positionNode` graph over one scrolling RGB
// perlin texture. Needs fiber hooks (`useUniforms`), so it lives inside <Canvas>.
import { useLayoutEffect, useMemo } from 'react'
import { useUniforms } from '@react-three/fiber/webgpu'
import { useTexture } from '@react-three/drei/webgpu'
import {
  Fn,
  PI,
  TWO_PI,
  atan,
  cos,
  float,
  luminance,
  min,
  positionLocal,
  sin,
  texture,
  time,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl'
import {
  CylinderGeometry,
  DoubleSide,
  MeshBasicNodeMaterial,
  PlaneGeometry,
  RepeatWrapping,
} from 'three/webgpu'
import type { Node } from 'three/webgpu'

const PERLIN_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/noises/perlin/rgb-256x256.png'

export interface TornadoProps {
  emissiveColor: string
  timeScale: number
  parabolStrength: number
  parabolOffset: number
  parabolAmplitude: number
}

export function Tornado({
  emissiveColor,
  timeScale,
  parabolStrength,
  parabolOffset,
  parabolAmplitude,
}: TornadoProps) {
  // Run-time knobs: create-or-update semantics sync the leva values into the live GPU
  // uniforms on every re-render — the node graphs below never rebuild.
  // ORDER MATTERS: `useUniforms` must run BEFORE the suspending `useTexture` below.
  // Creating a uniform writes to the fiber store; if that first write happens on the
  // post-suspense re-render, the sibling PostFX (whose `useRenderPipeline` subscribes
  // to the whole store via bare `useThree()`) gets a setState scheduled mid-render —
  // React's "cannot update PostFX while rendering Tornado" console error. Creating
  // them on the first (pre-commit, pre-subscription) render attempt avoids it.
  const { uEmissiveColor, uTimeScale, uParabolStrength, uParabolOffset, uParabolAmplitude } =
    useUniforms(
      {
        uEmissiveColor: emissiveColor,
        uTimeScale: timeScale,
        uParabolStrength: parabolStrength,
        uParabolOffset: parabolOffset,
        uParabolAmplitude: parabolAmplitude,
      },
      'vfxTornado',
    )

  // Casts: fiber's `UniformNode<T>` pins the TSL node-type param to `unknown`, so the
  // uniforms won't feed typed TSL math under strict tsc (upstream fiber gap — same
  // cast family as tsl-galaxy / tsl-raging-sea).
  const uEmissiveColorNode = uEmissiveColor as unknown as Node<'vec3'>
  const uTimeScaleNode = uTimeScale as unknown as Node<'float'>
  const uParabolStrengthNode = uParabolStrength as unknown as Node<'float'>
  const uParabolOffsetNode = uParabolOffset as unknown as Node<'float'>
  const uParabolAmplitudeNode = uParabolAmplitude as unknown as Node<'float'>

  const perlinTexture = useTexture(PERLIN_URL)

  // The radial/skewed UVs scroll far outside [0, 1] — wrap must be repeating before
  // the first shader build samples the texture (layout effect, not passive effect:
  // the WebGPU graph build reads mesh/texture state once on the first RAF render).
  useLayoutEffect(() => {
    perlinTexture.wrapS = perlinTexture.wrapT = RepeatWrapping
  }, [perlinTexture])

  // Built once — `useUniforms` returns stable node instances (leva edits mutate
  // `.value` in place), so the graphs never rebuild after the first pass, matching
  // the original's single `init()`.
  const rig = useMemo(() => {
    // -- shared TSL helpers ------------------------------------------------------

    // Plane UV → (angle, distance-to-center) polar UV, with scroll/rotation offsets:
    // this is what makes a flat texture swirl around the tornado's base.
    const toRadialUv = Fn(([uvIn, multiplierIn, rotationIn, offsetIn]) => {
      // Fn's destructured params come back as bare `ShaderNodeObject<Node>` — too
      // loose for the swizzles/typed math below (three-side gap, UPSTREAM.md B10).
      const uvInput = uvIn as unknown as Node<'vec2'>
      const multiplier = multiplierIn as unknown as Node<'vec2'>
      const rotation = rotationIn as unknown as Node<'float'>
      const offset = offsetIn as unknown as Node<'float'>

      const centeredUv = vec2(uvInput).sub(0.5).toVar()
      const distanceToCenter = centeredUv.length()
      const angle = atan(centeredUv.y, centeredUv.x)
      const radialUv = vec2(angle.add(PI).div(TWO_PI), distanceToCenter).toVar()
      radialUv.mulAssign(multiplier)
      radialUv.x.addAssign(rotation)
      radialUv.y.addAssign(offset)

      return radialUv
    })

    // Shear the UV space — turns straight scrolling noise into diagonal streaks
    // (the "wind-dragged" look on the cylinders).
    const toSkewedUv = Fn(([uvIn, skewIn]) => {
      const uvInput = uvIn as unknown as Node<'vec2'> // B10 cast, as above
      const skew = skewIn as unknown as Node<'vec2'>

      return vec2(
        uvInput.x.add(uvInput.y.mul(skew.x)),
        uvInput.y.add(uvInput.x.mul(skew.y)),
      )
    })

    // The funnel: re-radius every cylinder vertex along a parabola of its height,
    // plus a sine turbulence wobble that climbs over time.
    const twistedCylinder = Fn(([positionIn, strengthIn, offsetIn, amplitudeIn, timeIn]) => {
      const position = positionIn as unknown as Node<'vec3'> // B10 casts, as above
      const strength = strengthIn as unknown as Node<'float'>
      const offset = offsetIn as unknown as Node<'float'>
      const amplitude = amplitudeIn as unknown as Node<'float'>
      const t = timeIn as unknown as Node<'float'>

      const angle = atan(position.z, position.x).toVar()
      const elevation = position.y

      // parabol
      const radius = float(strength).mul(position.y.sub(offset)).pow(2).add(amplitude).toVar()

      // turbulences
      radius.addAssign(sin(elevation.sub(t).mul(20).add(angle.mul(2))).mul(0.05))

      return vec3(cos(angle).mul(radius), elevation, sin(angle).mul(radius))
    })

    // -- tornado floor: two counter-scrolling radial noises, masked to a ring ------

    const floorMaterial = new MeshBasicNodeMaterial({ transparent: true })

    floorMaterial.outputNode = Fn(() => {
      const scaledTime = time.mul(uTimeScaleNode)

      // noise 1
      const noise1Uv = toRadialUv(uv(), vec2(0.5, 0.5), scaledTime, scaledTime)
      noise1Uv.assign(toSkewedUv(noise1Uv, vec2(-1, 0)))
      noise1Uv.mulAssign(vec2(4, 1))
      const noise1 = texture(perlinTexture, noise1Uv, 1).r.remap(0.45, 0.7)

      // noise 2
      const noise2Uv = toRadialUv(uv(), vec2(2, 8), scaledTime.mul(2), scaledTime.mul(8))
      noise2Uv.assign(toSkewedUv(noise2Uv, vec2(-0.25, 0)))
      noise2Uv.mulAssign(vec2(2, 0.25))
      const noise2 = texture(perlinTexture, noise2Uv, 1).b.remap(0.45, 0.7)

      // outer fade — ring mask: fade at the plate's rim AND at the very center
      const distanceToCenter = uv().sub(0.5).toVar()
      const outerFade = min(
        distanceToCenter.length().oneMinus().smoothstep(0.5, 0.9),
        distanceToCenter.length().smoothstep(0, 0.2),
      )

      // effect
      const effect = noise1.mul(noise2).mul(outerFade).toVar()

      // output: hard-thresholded emissive cells (×3 so bloom picks them up)
      return vec4(
        vec3(uEmissiveColorNode).mul(effect.step(0.2)).mul(3),
        effect.smoothstep(0, 0.01),
      )
    })()

    // -- tornado emissive cylinder: the glowing core of the funnel -----------------

    const emissiveMaterial = new MeshBasicNodeMaterial({ transparent: true, side: DoubleSide })

    emissiveMaterial.positionNode = twistedCylinder(
      positionLocal,
      uParabolStrengthNode,
      uParabolOffsetNode,
      float(uParabolAmplitudeNode).sub(0.05), // slightly inside the dark shell
      time.mul(uTimeScaleNode),
    )

    emissiveMaterial.outputNode = Fn(() => {
      const scaledTime = time.mul(uTimeScaleNode)

      // noise 1
      const noise1Uv = uv().add(vec2(scaledTime, scaledTime.negate())).toVar()
      noise1Uv.assign(toSkewedUv(noise1Uv, vec2(-1, 0)))
      noise1Uv.mulAssign(vec2(2, 0.25))
      const noise1 = texture(perlinTexture, noise1Uv, 1).r.remap(0.45, 0.7)

      // noise 2
      const noise2Uv = uv().add(vec2(scaledTime.mul(0.5), scaledTime.negate())).toVar()
      noise2Uv.assign(toSkewedUv(noise2Uv, vec2(-1, 0)))
      noise2Uv.mulAssign(vec2(5, 1))
      const noise2 = texture(perlinTexture, noise2Uv, 1).g.remap(0.45, 0.7)

      // outer fade — soften both cylinder rims
      const outerFade = min(uv().y.smoothstep(0, 0.1), uv().y.oneMinus().smoothstep(0, 0.4))

      // effect
      const effect = noise1.mul(noise2).mul(outerFade)

      // emissive normalized by its own luminance so any picked color glows equally
      const emissiveColorLuminance = luminance(vec3(uEmissiveColorNode))

      return vec4(
        vec3(uEmissiveColorNode).mul(1.2).div(emissiveColorLuminance),
        effect.smoothstep(0, 0.1),
      )
    })()

    // -- tornado dark cylinder: the smoke shell wrapped around the core ------------

    const darkMaterial = new MeshBasicNodeMaterial({ transparent: true, side: DoubleSide })

    darkMaterial.positionNode = twistedCylinder(
      positionLocal,
      uParabolStrengthNode,
      uParabolOffsetNode,
      uParabolAmplitudeNode,
      time.mul(uTimeScaleNode),
    )

    darkMaterial.outputNode = Fn(() => {
      const scaledTime = time.mul(uTimeScaleNode).add(123.4) // decorrelate from the core

      // noise 1
      const noise1Uv = uv().add(vec2(scaledTime, scaledTime.negate())).toVar()
      noise1Uv.assign(toSkewedUv(noise1Uv, vec2(-1, 0)))
      noise1Uv.mulAssign(vec2(2, 0.25))
      const noise1 = texture(perlinTexture, noise1Uv, 1).g.remap(0.45, 0.7)

      // noise 2
      const noise2Uv = uv().add(vec2(scaledTime.mul(0.5), scaledTime.negate())).toVar()
      noise2Uv.assign(toSkewedUv(noise2Uv, vec2(-1, 0)))
      noise2Uv.mulAssign(vec2(5, 1))
      const noise2 = texture(perlinTexture, noise2Uv, 1).b.remap(0.45, 0.7)

      // outer fade
      const outerFade = min(uv().y.smoothstep(0, 0.2), uv().y.oneMinus().smoothstep(0, 0.4))

      // effect
      const effect = noise1.mul(noise2).mul(outerFade)

      return vec4(vec3(0), effect.smoothstep(0, 0.01))
    })()

    // -- geometries ----------------------------------------------------------------

    const floorGeometry = new PlaneGeometry(2, 2)

    // Open-ended, foot at y=0 (translated up half a unit) — shared by both shells.
    const cylinderGeometry = new CylinderGeometry(1, 1, 1, 20, 20, true)
    cylinderGeometry.translate(0, 0.5, 0)

    return { floorGeometry, cylinderGeometry, floorMaterial, emissiveMaterial, darkMaterial }
  }, [
    perlinTexture,
    uEmissiveColorNode,
    uTimeScaleNode,
    uParabolStrengthNode,
    uParabolOffsetNode,
    uParabolAmplitudeNode,
  ])

  return (
    <>
      <mesh geometry={rig.floorGeometry} material={rig.floorMaterial} rotation-x={-Math.PI * 0.5} />
      {/* frustumCulled={false}: `positionNode` re-radiuses every vertex on the GPU —
          with the leva parabola knobs maxed the funnel grows well past the CPU
          geometry's unit-radius culling sphere and would pop out of view (see header
          DIVERGENCE; same latent-bug class as tsl-galaxy). */}
      <mesh geometry={rig.cylinderGeometry} material={rig.emissiveMaterial} frustumCulled={false} />
      <mesh geometry={rig.cylinderGeometry} material={rig.darkMaterial} frustumCulled={false} />
    </>
  )
}

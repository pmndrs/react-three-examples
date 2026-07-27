// Shading graphs for the fire: the raymarched VolumeNodeMaterial pair (scattering +
// emissive fire ramp, and the shadow-casting proxy), the fire point light's custom
// colorNode (capsule falloff + projected flicker pattern), and the teapot's lava
// emissive. Pure builder called once from a useMemo — every node closes over the
// store-stable uniform bag, so leva/frame updates flow through `.value` mutation.
import {
  Fn,
  Loop,
  atan,
  cameraPosition,
  cos,
  float,
  fract,
  frameId,
  hue,
  interleavedGradientNoise,
  min,
  mix,
  mx_noise_float,
  positionLocal,
  positionWorld,
  saturation,
  screenCoordinate,
  sin,
  smoothstep,
  texture3D,
  vec3,
  vec4,
} from 'three/tsl'
import {
  AddEquation,
  AdditiveBlending,
  CustomBlending,
  FrontSide,
  OneFactor,
  OneMinusSrcAlphaFactor,
  VolumeNodeMaterial,
  ZeroFactor,
  type Node,
  type NodeBuilder,
  type StorageTexture,
} from 'three/webgpu'
import { snoise } from 'three/addons/tsl/math/curlNoise.js'
import {
  FIRE_INTENSITY,
  LIGHT_FAR_DISTANCE,
  LIGHT_FAR_INTENSITY,
  LIGHT_NEAR_INTENSITY,
  MULTI_SCATTERING,
  PHASE_ASYMMETRY,
  PL_PROJECTION_CENTER_FADE,
  PL_PROJECTION_FREQUENCY,
  PL_PROJECTION_NOISE_FADE,
  PL_PROJECTION_RADIUS,
  PL_SURFACE_INTENSITY,
  PL_VOLUME_INTENSITY,
  POWDER_STRENGTH,
  SHADOW_ABSORPTION,
  SHADOW_AMBIENT,
  VOLUME_WORLD_SIZE_DIAGONAL,
  VOLUME_WORLD_SIZE_Y,
} from './constants'
import type { FireUniforms } from './fireUniforms'

export interface FireShadingDeps {
  u: FireUniforms
  /** Final per-substep velocity field (domain-warps the smoke lookup). */
  velTexA: StorageTexture
  /** The dye texture the shadow march samples directly (original quirk kept). */
  dyeTexA: StorageTexture
  /** Ping-ponged dye READ node shared with the sim kernels. */
  dyeTexNode: ReturnType<typeof texture3D>
}

export function createFireShading({ u, velTexA, dyeTexA, dyeTexNode }: FireShadingDeps) {
  // Blackbody-style ramp: end (deep red) -> mid (orange) -> start (near-white).
  // Plain builder functions instead of the original's destructured-param `Fn`s —
  // destructured Fn params lose their TSL types under strict tsc (UPSTREAM.md B10).
  const fireRamp = (t: Node<'float'>) => {
    const color = vec3(0).toVar()
    color.assign(mix(vec3(0.0, 0.0, 0.0), u.uFireEndColor, smoothstep(0.05, 0.35, t)))
    color.assign(mix(color, u.uFireMidColor, smoothstep(0.35, 0.65, t)))
    color.assign(mix(color, u.uFireStartColor, smoothstep(0.65, 1.0, t)))
    return color
  }

  const henyeyGreenstein = (cosTheta: Node<'float'>, g: number) => {
    const gNode = float(g)
    const g2 = gNode.mul(gNode)
    const denom = float(1.0).add(g2).sub(float(2.0).mul(gNode).mul(cosTheta))
    const oneMinusG2 = float(1.0).sub(g2)
    // Normalization constant 1 / (4 * PI) ~= 0.079577
    return oneMinusG2.div(denom.pow(1.5)).mul(0.079577)
  }

  // Sample the simulated dye field at a world-space ray position: velocity-field
  // domain warping (wispy smoke), simplex detail noise, softened box edges.
  const getVolumeSample = (positionRay: Node<'vec3'>) => {
    // volume box is shifted up -> map ray position to uvw [0..1]
    const uvw = positionRay
      .sub(vec3(0, VOLUME_WORLD_SIZE_Y / 2, 0))
      .div(u.uVolumeWorldSize)
      .add(0.5)
      .toVar()

    const noiseDistortion = texture3D(velTexA, uvw, 0).xyz.div(u.uVolumeWorldSize).mul(0.15)
    const distortedUVW = uvw.add(noiseDistortion).clamp(0.0, 1.0).toVar()

    const dye = dyeTexNode.sample(distortedUVW).level(float(0))

    const density = dye.r.toVar()
    const age = dye.b
    const temperature = dye.g

    // High-frequency detail noise modulation
    const detailNoise = snoise(positionRay.mul(5.5).add(vec3(0, age.mul(0.8).negate(), 0)))
    density.mulAssign(detailNoise.mul(0.35).add(0.85))

    // soften the box edges
    const edge = min(distortedUVW, vec3(1).sub(distortedUVW))
    density.mulAssign(smoothstep(0.0, 0.06, min(edge.x, min(edge.y, edge.z))))

    return { density, temperature, age, distortedUVW }
  }

  // --- Volumetric material: additive raymarch of the smoke + fire emission ---

  const volumetricMaterial = new VolumeNodeMaterial()
  volumetricMaterial.steps = 16
  volumetricMaterial.transparent = true
  volumetricMaterial.blending = AdditiveBlending
  volumetricMaterial.depthWrite = false

  // Dithered ray offset (interleaved gradient noise + golden-ratio frame jitter)
  // to trade the 16-step banding for animated grain the denoise blur removes.
  volumetricMaterial.offsetNode = fract(
    interleavedGradientNoise(screenCoordinate).add(float(frameId).mul(0.618033988749895)),
  )

  volumetricMaterial.scatteringNode = ({ positionRay }) => {
    const { density } = getVolumeSample(positionRay)

    // Key-light self-shadowing: short march towards the key light
    const lightDir = u.uKeyLightPos.sub(positionRay).normalize()
    const shadowDensitySum = float(0.0).toVar()
    const shadowStepSize = 0.35

    for (let i = 0; i < 2; i++) {
      // JS loop on purpose: fixed-count build-time unroll, matching the original
      const stepDist = (i + 0.5) * shadowStepSize
      const shadowPos = positionRay.add(lightDir.mul(stepDist))
      const shadowUVW = shadowPos
        .sub(vec3(0, VOLUME_WORLD_SIZE_Y / 2, 0))
        .div(u.uVolumeWorldSize)
        .add(0.5)

      // Fade near the volume borders to avoid edge artifacts
      const shadowEdge = min(shadowUVW, vec3(1).sub(shadowUVW))
      const shadowFade = smoothstep(0.0, 0.06, min(shadowEdge.x, min(shadowEdge.y, shadowEdge.z)))

      const shadowSample = texture3D(dyeTexA, shadowUVW, 0).r.mul(shadowFade)
      shadowDensitySum.addAssign(shadowSample)
    }

    // Optical thickness (tau) and Beer's law
    const tau = shadowDensitySum.mul(shadowStepSize).mul(SHADOW_ABSORPTION)
    const beer = tau.negate().exp()

    // Multiple-scattering approximation (octave 2): lower absorption, halved weight
    const multiScatter = tau.mul(0.25).negate().exp().mul(0.5)
    const baseTransmittance = mix(beer, beer.add(multiScatter), MULTI_SCATTERING)

    // Beer's-law powder effect for edge self-shadowing detail
    const powder = float(1.0).sub(tau.mul(2.0).negate().exp())
    const finalTransmittance = mix(baseTransmittance, baseTransmittance.mul(powder), POWDER_STRENGTH)

    // Ambient lift in shadowed regions
    const lightTransmittance = finalTransmittance.add(SHADOW_AMBIENT).clamp(0.0, 1.0)

    // Henyey-Greenstein phase function for directional scattering
    const viewDir = cameraPosition.sub(positionRay).normalize()
    const cosTheta = viewDir.dot(lightDir).clamp(-1.0, 1.0)
    const phase = henyeyGreenstein(cosTheta, PHASE_ASYMMETRY)

    // Phase multiplied by 4 * PI (~12.56637) to stay on the standard lighting scale
    return vec3(density).mul(lightTransmittance).mul(phase.mul(12.56637))
  }

  const scatteringEmissive = ({ positionRay }: { positionRay: Node<'vec3'> }) => {
    const { density, temperature } = getVolumeSample(positionRay)

    // fire "emission": ramp tinted by temperature, spread inverts into ramp power
    const firePower = float(6.0).sub(u.uFireGlowSpread)
    const fire = fireRamp(temperature.clamp(0, 1)).mul(temperature.pow(firePower)).mul(FIRE_INTENSITY)
    const fireColor = hue(fire, u.uFireHue)

    // Cancel the key light's distance attenuation (constant intensity 400)
    const distance = positionRay.sub(u.uKeyLightPos).length()
    const attenuation = float(400.0).div(distance.pow(2.0))

    return fireColor.mul(density.add(0.15)).mul(attenuation)
  }
  // three's VolumetricLightingModel reads `scatteringEmissiveNode` generically, but
  // @types/three doesn't declare it on VolumeNodeMaterial (UPSTREAM.md B11 pattern —
  // verified against the 0.185.1 runtime, which calls it like scatteringNode).
  ;(
    volumetricMaterial as VolumeNodeMaterial & {
      scatteringEmissiveNode: typeof scatteringEmissive
    }
  ).scatteringEmissiveNode = scatteringEmissive

  // --- Shadow proxy material: same volume marched from the light's POV ---

  const volumeCastShadow = Fn(() => {
    const startPos = positionWorld
    // During the shadow pass the "camera" is the shadow camera, so this marches
    // along the light ray through the volume.
    const lightDir = positionWorld.sub(cameraPosition).normalize()

    const maxDistance = float(VOLUME_WORLD_SIZE_DIAGONAL)
    const stepSize = maxDistance.div(u.uShadowSteps).toVar()
    const rayDir = lightDir.toVar()

    const distTravelled = float(0.0).toVar()
    const transmittance = float(1.0).toVar()

    // Uniform-driven loop bound (mirrors the leva raymarch-steps knob).
    Loop({ type: 'float', start: float(0), end: u.uShadowSteps, condition: '<' }, () => {
      const positionRay = startPos.add(rayDir.mul(distTravelled))

      const { density } = getVolumeSample(positionRay)

      const absorption = density.mul(SHADOW_ABSORPTION).mul(0.01)
      const falloff = absorption.negate().mul(stepSize).exp()

      transmittance.mulAssign(falloff)
      distTravelled.addAssign(stepSize)
    })

    // Fully transparent rays contribute no shadow at all
    transmittance.greaterThanEqual(0.99).discard()

    const shadowOpacity = transmittance.oneMinus()

    return vec4(vec3(0), shadowOpacity.mul(5))
  })

  const shadowMaterial = new VolumeNodeMaterial()
  shadowMaterial.steps = volumetricMaterial.steps
  shadowMaterial.offsetNode = volumetricMaterial.offsetNode
  shadowMaterial.castShadowNode = volumeCastShadow()
  shadowMaterial.shadowSide = FrontSide
  shadowMaterial.colorWrite = false
  shadowMaterial.depthWrite = false
  shadowMaterial.blending = CustomBlending
  shadowMaterial.blendEquation = AddEquation
  shadowMaterial.blendSrc = ZeroFactor
  shadowMaterial.blendDst = OneMinusSrcAlphaFactor
  shadowMaterial.blendEquationAlpha = AddEquation
  shadowMaterial.blendSrcAlpha = OneFactor
  shadowMaterial.blendDstAlpha = OneMinusSrcAlphaFactor

  // --- Fire point light colorNode ---

  // Build-time branch: this Fn body runs once per shader build, and `builder.material`
  // tells us whether the light is being folded into the volume or a solid surface.
  const isVolume = Fn((inputs: Record<string, unknown>) => {
    // A zero-layout Fn callback actually receives the NodeBuilder, but @types/three
    // types it as a loose inputs record — cast to reach `.material` (B10 family).
    const { material } = inputs as unknown as NodeBuilder & {
      material?: { isVolumeNodeMaterial?: boolean }
    }
    return float(material && material.isVolumeNodeMaterial ? 1.0 : 0.0)
  })()

  const pointLightColorNode = Fn(() => {
    // Shading point position in world space
    const P = positionWorld
    // Light source bottom position (the teapot)
    const A = u.uTeapotPosition

    // 1) Flame column: closest point on a vertical segment displaced by sway
    const H = vec3(0.0, u.uFlameHeight, 0.0)
    const V = P.sub(A)
    const t = V.dot(H).div(H.dot(H)).clamp(0.0, 1.0)
    const C = A.add(u.uSway).add(H.mul(t))
    const distToSegment = P.sub(C).length()

    // Soft cylindrical attenuation (flame thickness radius r = 1.2)
    const r = float(1.2)
    const softAttenuation = float(1.0).div(distToSegment.pow(2.0).add(r.pow(2.0)))

    // Cancel the standard PointLight 1/d^2 decay — but only inside the volume, so
    // solid surfaces keep their physical falloff.
    const distToLight = P.sub(A).length()
    const defaultAttenuation = distToLight.pow(2.0).max(0.01).reciprocal()
    const attenuationCorrection = isVolume
      .equal(1.0)
      .select(softAttenuation.div(defaultAttenuation), float(1.0))

    const currentIntensity = isVolume
      .equal(1.0)
      .select(float(PL_VOLUME_INTENSITY), float(PL_SURFACE_INTENSITY))

    // Color temperature with a slight CPU-noise oscillation (uniform for the volume)
    const colorT = u.uEmitTemperature.div(8.34).mul(0.5).add(0.2).add(u.uColorNoise).clamp(0.0, 1.0)
    const fireColor = fireRamp(colorT)
    const coloredFire = hue(saturation(fireColor, u.uSaturation), u.uFireHue)

    // Projected fire light on surfaces: radial spoke noise + convective noise
    const relP = P.xz.sub(A.xz)
    const angle = atan(relP.y, relP.x)
    const distXZ = relP.length()

    const freqScale = float(PL_PROJECTION_FREQUENCY)
    const angleNoise = mx_noise_float(
      vec3(
        cos(angle).mul(float(1.5).mul(freqScale)),
        sin(angle).mul(float(1.5).mul(freqScale)),
        u.uTime.mul(0.6),
      ),
    )
      .mul(0.5)
      .add(0.5)

    // Fade the spoke noise near the center (atan(0,0) seam singularity)
    const centerFadeFactor = smoothstep(0.0, PL_PROJECTION_CENTER_FADE, distXZ)
    const cleanAngleNoise = mix(float(1.0), angleNoise, centerFadeFactor)

    // Spatial noise moving outwards/upwards (convective fire behavior)
    const noiseCoord1 = vec3(P.x.mul(float(0.6).mul(freqScale)), u.uTime.mul(1.2), P.z.mul(float(0.6).mul(freqScale)))
    const projN1 = mx_noise_float(noiseCoord1).mul(0.5).add(0.5)

    const noiseCoord2 = vec3(P.x.mul(float(1.5).mul(freqScale)), u.uTime.mul(2.5), P.z.mul(float(1.5).mul(freqScale)))
    const projN2 = mx_noise_float(noiseCoord2).mul(0.5).add(0.5)

    const projNoise = projN1.mul(0.65).add(projN2.mul(0.35))
    const projectionIntensity = projNoise.mul(cleanAngleNoise.mul(0.5).add(0.5))

    // Blend the noise to uniform 1.0 with distance from the flame
    const noiseFadeFactor = distToSegment.div(PL_PROJECTION_NOISE_FADE).clamp(0.0, 1.0)
    const finalIntensity = mix(projectionIntensity, float(1.0), noiseFadeFactor)

    // Radial temperature gradient from the fire center
    const radialTemp = float(1.0).sub(distToSegment.div(PL_PROJECTION_RADIUS)).clamp(0.0, 1.0)
    const colorTProj = radialTemp.mul(finalIntensity).clamp(0.0, 1.0)
    const fireColorProj = fireRamp(colorTProj)
    const coloredFireProj = hue(saturation(fireColorProj, u.uSaturation), u.uFireHue)

    const finalFireColor = isVolume.equal(1.0).select(coloredFire, coloredFireProj)

    // Stefan-Boltzmann: radiant energy ~ T^4 (relative to the default 8.34)
    const tempScale = u.uEmitTemperature.div(8.34).max(0.0)
    const tempFactor = tempScale.pow(4.0)
    // Fire/smoke size scale (relative to the default 11.02)
    const densityScale = u.uEmitDensity.div(11.02).max(0.0)

    // Smooth fade-in over the first 3 seconds of the simulation
    const fadeIn = smoothstep(0.0, 3.0, u.uTime)

    const baseColor = finalFireColor
      .mul(tempFactor)
      .mul(densityScale)
      .mul(FIRE_INTENSITY)
      .mul(currentIntensity)
      .mul(u.uFlicker)
      .mul(fadeIn)

    // Near/far intensity blend, applied only when shading the volume
    const distRatio = distToSegment.div(LIGHT_FAR_DISTANCE).clamp(0.0, 1.0)
    const distanceScale = mix(
      float(LIGHT_NEAR_INTENSITY),
      float(LIGHT_FAR_INTENSITY),
      smoothstep(0.0, 1.0, distRatio),
    )
    const finalScale = isVolume.equal(1.0).select(distanceScale, float(1.0))

    return baseColor.mul(attenuationCorrection).mul(finalScale)
  })()

  // --- Teapot lava emissive: 3-octave MaterialX noise flowing downwards ---

  const teapotEmissiveNode = Fn(() => {
    // Local position for stability while dragging
    const p = positionLocal.mul(0.5)
    const flow = vec3(0.0, u.uTime.negate(), 0.0)

    const n1 = mx_noise_float(p.add(flow)).mul(0.5).add(0.5)
    const p2 = p.mul(2.0).sub(flow.mul(1.5))
    const n2 = mx_noise_float(p2.add(vec3(n1.mul(0.4)))).mul(0.5).add(0.5)
    const p3 = p.mul(4.0).add(flow.mul(2.5))
    const n3 = mx_noise_float(p3).mul(0.5).add(0.5)

    const noiseVal = n1.mul(0.5).add(n2.mul(0.35)).add(n3.mul(0.15))

    // Sharp glowing veins, wide dark crust
    const lavaT = noiseVal.pow(2.5).clamp(0.0, 1.0)

    const fireColor = fireRamp(lavaT.add(0.1))
    const coloredFire = hue(saturation(fireColor, u.uSaturation), u.uFireHue)

    const tempScale = u.uEmitTemperature.div(8.34).max(0.0)
    const tempFactor = tempScale.pow(4.0)
    const densityScale = u.uEmitDensity.div(11.02).max(0.0)
    const fadeIn = smoothstep(0.0, 3.0, u.uTime)

    return coloredFire
      .mul(tempFactor)
      .mul(densityScale)
      .mul(FIRE_INTENSITY)
      .mul(u.uFlicker)
      .mul(fadeIn)
      .mul(u.uTeapotEmissiveIntensity)
  })()

  return { volumetricMaterial, shadowMaterial, pointLightColorNode, teapotEmissiveNode }
}

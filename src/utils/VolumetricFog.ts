// Drei has no volumetric-fog-box helper. This factors the "tiled 3D Perlin density
// field driving a VolumeNodeMaterial.scatteringNode" pattern shared by this corpus's
// volume-* ports (volume-caustics, volume-lighting, volume-lighting-rectarea) — each
// three.js original duplicates this ~50-line block verbatim, with only the noise
// texture's repeat/scale and the scattering density's octave/time constants differing.
// Candidate for an upstream `three/addons/tsl/utils/` or drei helper.
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js'
import { fract, texture3D, time, vec3 } from 'three/tsl'
import { Data3DTexture, LinearFilter, RedFormat, RepeatWrapping } from 'three/webgpu'
import type { Node, Texture } from 'three/webgpu'

/**
 * 128^3 `ImprovedNoise` perlin field, repeated `repeatFactor`x across the unit cube
 * and wrapped for tiling — the CPU-generated density source every volume-* port's
 * fog box raymarches.
 */
export function createFogTexture3D(repeatFactor = 5, scale = 10) {
  const size = 128
  const data = new Uint8Array(size * size * size)
  const perlin = new ImprovedNoise()

  let i = 0
  for (let z = 0; z < size; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const nx = (x / size) * repeatFactor
        const ny = (y / size) * repeatFactor
        const nz = (z / size) * repeatFactor
        const noiseValue = perlin.noise(nx * scale, ny * scale, nz * scale)
        data[i++] = 128 + 128 * noiseValue
      }
    }
  }

  const texture = new Data3DTexture(data, size, size, size)
  texture.format = RedFormat
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.unpackAlignment = 1
  texture.needsUpdate = true
  return texture
}

export interface FogScatteringOptions {
  fogTexture: Texture
  /** GUI-driven mix factor — `.mix` is mixElement, so this is the interpolation FACTOR
   * between a uniform density of 1 and the sampled multi-octave density (AGENTS.md
   * arg-order note), matching every original's `smokeAmount.mix(1, density)`. */
  smokeAmount: Node<'float'>
  /** [spatial scale, per-octave time-domain-warp multiplier] pairs, largest grain first. */
  octaves: [number, number?][]
  /** Multiplier applied to the raw `time` uniform on the (x, z) domain-warp axes. */
  timeSpeed: [number, number]
}

/**
 * `VolumeNodeMaterial.scatteringNode` builder: multi-octave tiled-noise density,
 * domain-warped by time and mixed by `smokeAmount`. Assign the return value directly
 * (no `Fn()` wrapper needed — the material invokes it within its own active TSL stack).
 */
export function createFogScatteringNode({ fogTexture, smokeAmount, octaves, timeSpeed }: FogScatteringOptions) {
  return (inputs: { positionRay: Node<'vec3'> }) => {
    const { positionRay } = inputs
    const timeScaled = vec3(time.mul(timeSpeed[0]), 0, time.mul(timeSpeed[1]))

    const sampleGrain = (scale: number, octaveTimeScale = 1) =>
      texture3D(fogTexture, fract(positionRay.add(timeScaled.mul(octaveTimeScale)).mul(scale)), 0).r.add(0.5)

    const [firstScale, firstTimeScale] = octaves[0]
    let density = sampleGrain(firstScale, firstTimeScale)
    for (let idx = 1; idx < octaves.length; idx++) {
      const [scale, octaveTimeScale] = octaves[idx]
      density = density.mul(sampleGrain(scale, octaveTimeScale))
    }

    return smokeAmount.mix(1, density)
  }
}

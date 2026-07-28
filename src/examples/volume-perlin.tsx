/**
 * volume-perlin
 * R3F port of three.js `webgpu_volume_perlin`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_volume_perlin (~150 lines of JS)
 *
 * DEMONSTRATES
 * - Opaque (surface-finding) volumetric raymarching in TSL: `RaymarchingBox` marches
 *   camera rays through a unit box, and `If(density > threshold) Break()` stops at the
 *   first voxel over the threshold instead of alpha-compositing through the volume
 *   (contrast `volume-cloud`'s translucent front-to-back blend)
 * - Sub-voxel surface refinement: once a ray crosses the threshold, `Loop` bisects the
 *   interval between the previous (below) and current (above) sample 4 times to
 *   localize the crossing — `select()` + the TSL `uniformFlow()` context modifier keep
 *   the bisection's divergent per-ray branching from being treated as spatially
 *   uniform by the compiler
 * - `texture3D().normal()`: a built-in TSL method that estimates a 3D texture's local
 *   gradient via central differences, used here as a cheap volumetric "shading" (the
 *   final color is gradient + position, not real lighting)
 * - CPU-generated `Data3DTexture` (128^3 `ImprovedNoise` perlin field, `RedFormat`,
 *   `unpackAlignment = 1`) driving live threshold/steps/refine uniforms
 *
 * DIVERGENCE from original
 * - The original's `renderer.inspector.createParameters` panel becomes leva controls
 *   (threshold/steps/refine — same ranges and defaults)
 * - `renderer={{ toneMapping: NoToneMapping }}` explicit — the original renders with
 *   the WebGPURenderer default (no tone mapping); the surface color here is a plain
 *   normal+position visualization, not HDR, but the corpus rule is to decide this
 *   deliberately rather than inherit fiber's ACESFilmic default
 * - OrbitControls -> DemoHelpers CameraControls; grid off (the original floats a bare
 *   cube in a black void)
 * - `"static": true` in the manifest: nothing in the scene animates over time, only
 *   camera orbit and leva-driven uniforms — matches the original's `animate()`, which
 *   just calls `renderer.render()` every frame with no per-frame mutation
 */
import { useMemo } from 'react'
import { Canvas, useUniforms } from '@react-three/fiber/webgpu'
import { useControls } from 'leva'
import { Break, Fn, If, Loop, bool, select, texture3D, vec3, vec4 } from 'three/tsl'
import {
  BackSide,
  Data3DTexture,
  LinearFilter,
  NodeMaterial,
  NoToneMapping,
  RedFormat,
  Vector3,
} from 'three/webgpu'
import type { Node } from 'three/webgpu'
import { RaymarchingBox } from 'three/addons/tsl/utils/Raymarching.js'
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js'
import { DemoHelpers } from '../utils/DemoHelpers'

const REFINEMENT_STEPS = 4

interface PerlinBoxProps {
  threshold: number
  steps: number
  refine: boolean
}

function PerlinBox({ threshold, steps, refine }: PerlinBoxProps) {
  const { uThreshold, uSteps, uRefine } = useUniforms(
    { uThreshold: threshold, uSteps: steps, uRefine: refine },
    'volumePerlin',
  )

  // 128^3 raw perlin field, ported verbatim from the original's init().
  const perlinTexture = useMemo(() => {
    const size = 128
    const data = new Uint8Array(size * size * size)

    let i = 0
    const perlin = new ImprovedNoise()
    const vector = new Vector3()

    for (let z = 0; z < size; z++) {
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          vector.set(x, y, z).divideScalar(size)
          const d = perlin.noise(vector.x * 6.5, vector.y * 6.5, vector.z * 6.5)
          data[i++] = d * 128 + 128
        }
      }
    }

    const texture = new Data3DTexture(data, size, size, size)
    texture.format = RedFormat
    texture.minFilter = LinearFilter
    texture.magFilter = LinearFilter
    texture.unpackAlignment = 1
    texture.needsUpdate = true
    return texture
  }, [])

  // useUniforms' UniformNode<T> pins its TSL type param to `unknown` (documented
  // fiber typing gap, see AGENTS.md) — cast to the concrete node types math needs.
  const uThresholdNode = uThreshold as unknown as Node<'float'>
  const uStepsNode = uSteps as unknown as Node<'float'>
  const uRefineNode = uRefine as unknown as Node<'bool'>

  const material = useMemo(() => {
    const map = texture3D(perlinTexture, null, 0)

    // Ported verbatim from the original's `opaqueRaymarchingTexture` — a zero-arg Fn
    // closing over the uniforms rather than object-destructured params (destructured
    // Fn params lose their types under strict tsc, UPSTREAM.md B10). The Fn wrapper
    // is load-bearing: RaymarchingBox's internal `.toVar()`/`.assign()` need the
    // active TSL stack it provides.
    const opaqueRaymarchingTexture = Fn(() => {
      const finalColor = vec4(0).toVar()

      const positionPrev = vec3(0).toVar()
      const hasPrev = bool(false).toVar()

      RaymarchingBox(uStepsNode, ({ positionRay }) => {
        const mapValue = map.sample(positionRay.add(0.5)).r.toVar()

        If(mapValue.greaterThan(uThresholdNode), () => {
          const surfacePos = positionRay.toVar()

          If(uRefineNode.and(hasPrev), () => {
            // The surface lies between the previous sample (below the threshold) and
            // the current one (above it) — bisect that interval to localize the
            // crossing precisely.
            const p0 = positionPrev.toVar()
            const p1 = positionRay.toVar()

            Loop(REFINEMENT_STEPS, () => {
              const pm = p0.add(p1).mul(0.5).toConst()
              const dm = map.sample(pm.add(0.5)).r.toConst()

              const isGreater = dm.greaterThan(uThresholdNode)

              p1.assign(select(isGreater, pm, p1).uniformFlow())
              p0.assign(select(isGreater, p0, pm).uniformFlow())
            })

            surfacePos.assign(p1)
          })

          const p = vec3(surfacePos).add(0.5)

          finalColor.rgb.assign(map.normal(p).mul(0.5).add(surfacePos.mul(1.5).add(0.25)))
          finalColor.a.assign(1)
          Break()
        })

        positionPrev.assign(positionRay)
        hasPrev.assign(bool(true))
      })

      return finalColor
    })

    const mat = new NodeMaterial()
    mat.colorNode = opaqueRaymarchingTexture()
    mat.side = BackSide // inside faces — the raymarch survives the camera entering the box
    mat.transparent = true
    return mat
  }, [perlinTexture, uThresholdNode, uStepsNode, uRefineNode])

  return (
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      <primitive object={material} attach="material" />
    </mesh>
  )
}

export default function VolumePerlin() {
  const { threshold, steps, refine } = useControls('volume-perlin', {
    threshold: { value: 0.6, min: 0, max: 1, step: 0.01 },
    steps: { value: 200, min: 0, max: 300, step: 1 },
    refine: true,
  })

  return (
    <Canvas
      // Original renders with the WebGPURenderer default (no tone mapping) — explicit
      // here because fiber's Canvas defaults to ACESFilmic (see header DIVERGENCE).
      renderer={{ toneMapping: NoToneMapping }}
      camera={{ position: [0, 0, 2], fov: 60, near: 0.1, far: 100 }}
    >
      <PerlinBox threshold={threshold} steps={steps} refine={refine} />
      <DemoHelpers grid={false} maxDistance={9} />
    </Canvas>
  )
}

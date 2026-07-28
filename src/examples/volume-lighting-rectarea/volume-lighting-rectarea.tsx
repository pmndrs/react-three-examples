/**
 * volume-lighting-rectarea
 * R3F port of three.js `webgpu_volume_lighting_rectarea`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_volume_lighting_rectarea (~250 lines of JS)
 *
 * DEMONSTRATES
 * - The same fog-box god-ray technique as `volume-lighting`, but proving it works with
 *   `RectAreaLight` — an area light with no native shadow support at all — instead of
 *   point/spot lights with real shadow maps: the volumetric raymarch alone is enough
 *   to carve visible colored light shafts through the haze
 * - `RectAreaLightNode.setLTC(RectAreaLightTexturesLib.init())`: the one-time global
 *   LTC BRDF texture registration RectAreaLight needs on the WebGPU backend, done at
 *   module scope (same pattern as this repo's `lights-rectarealight` port)
 * - `checker(uv().mul(400))` driving `meshStandardNodeMaterial`'s `roughnessNode` on
 *   a huge floor slab — a per-fragment roughness pattern with zero extra draw calls
 * - The same `src/utils/VolumetricFog.ts` fog-box helper as `volume-caustics` and
 *   `volume-lighting` — this original's `scatteringNode` is byte-for-byte identical
 *   to `volume-lighting`'s, so the two ports share the exact same octave/time
 *   constants through the one shared builder
 *
 * DIVERGENCE from original
 * - The original's `renderer.inspector` GUI (resolution, step count, denoise
 *   strength, a denoise on/off toggle, fog intensity, smoke amount) becomes leva,
 *   one-to-one, except the denoise toggle: like `volume-lighting`/`volume-fire`, an
 *   enable/disable checkbox that swaps the pipeline's output node becomes an
 *   always-in-graph strength slider
 * - The three lights' hard-coded spin rates (`-delta`, `delta*0.5`, `delta`) become
 *   one `rotationSpeed` leva multiplier scaling all three together, same ratios
 * - `renderer={{ toneMapping: NeutralToneMapping, toneMappingExposure: 2 }}` mirrors
 *   the original's explicit setting (both diverge from fiber's ACESFilmic default)
 * - OrbitControls -> DemoHelpers CameraControls, same min/maxDistance, targeting the
 *   knot's position like the original's `controls.target`; grid off (the scene has
 *   its own 2000-unit floor slab)
 * - `Inspector`/`.toInspector()` wiring dropped (not ported)
 */
import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber/webgpu'
import { useControls } from 'leva'
import { NeutralToneMapping } from 'three/webgpu'
import { DemoHelpers } from '../../utils/DemoHelpers'
import { VolumeLightingRectarea } from './VolumeLightingRectarea'

const KNOT_POSITION: [number, number, number] = [0, 5.5, 0]

export default function VolumeLightingRectareaExample() {
  const { fogIntensity, smokeAmount, rotationSpeed } = useControls('volume-lighting-rectarea scene', {
    fogIntensity: { value: 1, min: 0, max: 2, step: 0.01 },
    smokeAmount: { value: 2, min: 0, max: 3, step: 0.05 },
    rotationSpeed: { value: 1, min: 0, max: 3, step: 0.05 },
  })

  const { steps, resolution, denoiseStrength } = useControls('volume-lighting-rectarea quality', {
    steps: { value: 12, min: 2, max: 16, step: 1 },
    resolution: { value: 0.25, min: 0.1, max: 1, step: 0.05 },
    denoiseStrength: { value: 0.6, min: 0, max: 1, step: 0.01 },
  })

  return (
    <Canvas
      // Original sets these explicitly — mirrored here (fiber's Canvas would
      // otherwise default to ACESFilmic, see header DIVERGENCE).
      renderer={{ toneMapping: NeutralToneMapping, toneMappingExposure: 2 }}
      shadows
      background="#000000"
      camera={{ position: [0, 5, -15], fov: 60, near: 0.1, far: 250 }}
    >
      <Suspense fallback={null}>
        <VolumeLightingRectarea
          fogIntensity={fogIntensity}
          smokeAmount={smokeAmount}
          rotationSpeed={rotationSpeed}
          steps={steps}
          resolution={resolution}
          denoiseStrength={denoiseStrength}
        />
      </Suspense>
      <DemoHelpers grid={false} target={KNOT_POSITION} minDistance={5} maxDistance={200} />
    </Canvas>
  )
}

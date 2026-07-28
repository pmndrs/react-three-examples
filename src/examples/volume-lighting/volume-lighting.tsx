/**
 * volume-lighting
 * R3F port of three.js `webgpu_volume_lighting`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_volume_lighting (~215 lines of JS)
 *
 * DEMONSTRATES
 * - "God rays" from ordinary lights: a `VolumeNodeMaterial` fog box raymarches a
 *   tiled 3D Perlin density field, occluded by the main pass's depth
 *   (`scenePass.getTextureNode('depth')`), so a point light and a spot light with
 *   real shadow-casting geometry in front of them carve visible light shafts through
 *   the haze — no dedicated god-ray shader, just volumetric density + existing shadows
 * - A layered `useRenderPipeline`: main scene pass + a quarter-resolution
 *   volumetric-only `pass()` (`Layers`-restricted) -> `gaussianBlur` denoise ->
 *   additive compose over the main pass — a lighter two-stage version of
 *   `volume-caustics`'/`volume-fire`'s pipelines (no bloom stage here)
 * - `SpotLight.map`: a projected "light cookie" texture (`colors.png`) tinting the
 *   spot's cone and shadow, entirely through a plain fiber `map` prop
 * - The same `src/utils/VolumetricFog.ts` fog-box helper as `volume-caustics` (and
 *   `volume-lighting-rectarea`) — three near-identical ~50-line blocks in the
 *   originals collapse to one shared builder, only the octave/time constants differ
 *
 * DIVERGENCE from original
 * - The original's `renderer.inspector` GUI (resolution, step count, denoise
 *   strength, a denoise on/off toggle, point/spot intensity, fog intensity, smoke
 *   amount) becomes leva, one-to-one, EXCEPT the denoise toggle: like `volume-fire`,
 *   an enable/disable checkbox that swaps the pipeline's output node becomes an
 *   always-in-graph strength slider (denoiseStrength already IS that slider when on)
 * - The original's per-frame `spotLight.lookAt(0, 0, 0)` is dropped — a `SpotLight`'s
 *   beam direction is computed from `.target`'s world position (default: the
 *   unparented origin), not from the light's own quaternion, so the call is a no-op;
 *   confirmed against `LightShadow.updateMatrices()`, which derives the shadow
 *   camera's orientation the same way
 * - `renderer={{ toneMapping: NeutralToneMapping, toneMappingExposure: 2 }}` mirrors
 *   the original's explicit setting (both diverge from fiber's ACESFilmic default)
 * - OrbitControls -> DemoHelpers CameraControls, same min/maxDistance; grid off (the
 *   original's own 100x100 floor is the shadow/god-ray receiver)
 * - `Inspector`/`.toInspector()` wiring dropped (not ported)
 */
import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber/webgpu'
import { useControls } from 'leva'
import { NeutralToneMapping } from 'three/webgpu'
import { DemoHelpers } from '../../utils/DemoHelpers'
import { VolumeLighting } from './VolumeLighting'

export default function VolumeLightingExample() {
  const { pointLightIntensity, spotIntensity, fogIntensity, smokeAmount } = useControls(
    'volume-lighting scene',
    {
      pointLightIntensity: { value: 3, min: 0, max: 6, step: 0.1 },
      spotIntensity: { value: 100, min: 0, max: 200, step: 1 },
      fogIntensity: { value: 1, min: 0, max: 2, step: 0.01 },
      smokeAmount: { value: 2, min: 0, max: 3, step: 0.05 },
    },
  )

  const { steps, resolution, denoiseStrength } = useControls('volume-lighting quality', {
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
      camera={{ position: [-8, 1, -6], fov: 60, near: 0.1, far: 100 }}
    >
      <Suspense fallback={null}>
        <VolumeLighting
          pointLightIntensity={pointLightIntensity}
          spotIntensity={spotIntensity}
          fogIntensity={fogIntensity}
          smokeAmount={smokeAmount}
          steps={steps}
          resolution={resolution}
          denoiseStrength={denoiseStrength}
        />
      </Suspense>
      <DemoHelpers grid={false} minDistance={2} maxDistance={40} />
    </Canvas>
  )
}

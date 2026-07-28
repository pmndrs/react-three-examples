/**
 * volume-caustics
 * R3F port of three.js `webgpu_volume_caustics`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_volume_caustics (~260 lines of JS)
 *
 * DEMONSTRATES
 * - Refractive caustics as a duck-typed `MeshPhysicalNodeMaterial.castShadowNode`
 *   (typed on `NodeMaterial`, no cast needed): the transmissive duck refracts the view
 *   ray (`refract()` against its IOR), projects it onto a caustic photo texture with
 *   per-channel chromatic aberration, and casts that projection as its own shadow —
 *   plus reuses the same node, scaled by a light-facing term, as `emissiveNode` for a
 *   cheap subsurface-glow on the duck's shadow side
 * - `renderer.shadowMap.transmitted`: non-opaque shadow maps, required for a
 *   `castShadowNode` to paint colored light onto the receiving floor instead of a
 *   flat occlusion shape
 * - A second `VolumeNodeMaterial` fog box raymarching a tiled 3D Perlin field for
 *   ambient haze, occluded by the main pass's depth (`scenePass.getTextureNode
 *   ('depth')`) so the fog respects solid geometry
 * - Render-layer split (`Layers`, `LAYER_VOLUMETRIC_LIGHTING = 10`): the fog box and
 *   its light render ONLY in a half-resolution `pass()` restricted to that layer,
 *   composited back via `bloom()` + additive add — a lighter two-pass version of
 *   `volume-fire`'s layered pipeline, with no denoise stage
 * - `uniform(material.color)` wraps the duck material's LIVE `Color` — mutating it
 *   from leva needs no extra sync, the caustic shader reads it every frame
 *
 * DIVERGENCE from original
 * - The original's `renderer.inspector` GUI (2 controls: caustic occlusion, material
 *   color) becomes leva; `smokeAmount`, `volumetricLightingIntensity`, raymarch
 *   `steps`, and the volumetric pass `resolution` scale are added as knobs — these
 *   were already live `uniform()`s or pass fields in the original's JS, just not
 *   wired to its GUI (a restrained enhancement per this repo's convention)
 * - The original loads a hardwood floor texture but never assigns it to the floor's
 *   material (dead code in the upstream example) — dropped; the floor renders
 *   effectively black in both versions
 * - `renderer={{ toneMapping: NoToneMapping }}` explicit — the original renders with
 *   the WebGPURenderer default (no tone mapping); fiber's Canvas defaults to
 *   ACESFilmic (AGENTS.md tone-mapping parity trap)
 * - OrbitControls -> DemoHelpers CameraControls, same target and `maxDistance: 1`;
 *   grid off (the original's floor plane is the intended dark backdrop)
 * - `Inspector`/`.toInspector()` wiring dropped (not ported); DRACOLoader wiring
 *   becomes drei `useGLTF`'s second argument
 */
import { Suspense, useRef } from 'react'
import { Canvas } from '@react-three/fiber/webgpu'
import { useControls } from 'leva'
import { NoToneMapping } from 'three/webgpu'
import type CameraControlsImpl from 'camera-controls'
import { DemoHelpers } from '../../utils/DemoHelpers'
import { VolumeCaustics } from './VolumeCaustics'

export default function VolumeCausticsExample() {
  const cameraControlsRef = useRef<CameraControlsImpl | null>(null)

  const { causticOcclusion, materialColor } = useControls('volume-caustics duck', {
    causticOcclusion: { value: 1, min: 0, max: 20, step: 0.1 },
    materialColor: '#ffd700',
  })

  const { smokeAmount, volumetricLightingIntensity, steps, resolution } = useControls(
    'volume-caustics fog',
    {
      smokeAmount: { value: 3, min: 0, max: 10, step: 0.1 },
      volumetricLightingIntensity: { value: 0.7, min: 0, max: 3, step: 0.01 },
      steps: { value: 20, min: 4, max: 64, step: 1 },
      resolution: { value: 0.5, min: 0.1, max: 1, step: 0.05 },
    },
  )

  return (
    <Canvas
      // Original renders with the WebGPURenderer default (no tone mapping) — explicit
      // here because fiber's Canvas defaults to ACESFilmic (see header DIVERGENCE).
      renderer={{ toneMapping: NoToneMapping }}
      shadows
      background="#000000"
      camera={{ position: [-0.7, 0.2, 0.2], fov: 25, near: 0.025, far: 5 }}
    >
      <Suspense fallback={null}>
        <VolumeCaustics
          causticOcclusion={causticOcclusion}
          materialColor={materialColor}
          smokeAmount={smokeAmount}
          volumetricLightingIntensity={volumetricLightingIntensity}
          steps={steps}
          resolution={resolution}
        />
      </Suspense>
      <DemoHelpers
        grid={false}
        target={[0, 0.02, -0.05]}
        maxDistance={1}
        controlsRef={cameraControlsRef}
      />
    </Canvas>
  )
}

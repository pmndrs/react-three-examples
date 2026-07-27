/**
 * volume-fire
 * R3F port of three.js `webgpu_volume_fire`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_volume_fire (~1150 lines of JS)
 *
 * DEMONSTRATES
 * - A full GPU fluid simulation as TSL compute: semi-Lagrangian advection, buoyancy,
 *   precomputed curl-noise turbulence, and a Jacobi pressure projection — 8 kernels
 *   over a 100x100x200 voxel grid, dispatched at a fixed 120 Hz timestep from a
 *   `useFrame({ phase: 'update' })` accumulator loop; the dye field ping-pongs by
 *   swapping the read/write texture nodes' `.value`s between substeps
 * - `useGPUStorage` holding eight rgba16float `Storage3DTexture` voxel fields
 *   (velocity/dye/divergence/pressure/noise) — storage-writable AND linearly
 *   filterable, so the render pass samples the same textures compute writes
 * - `VolumeNodeMaterial` raymarching the live simulation: `scatteringNode`
 *   (Beer-Lambert key-light self-shadowing, multiple-scattering + powder
 *   approximations, Henyey-Greenstein phase), a duck-typed `scatteringEmissiveNode`
 *   blackbody fire ramp, and a dithered `offsetNode` (interleaved gradient noise +
 *   golden-ratio `frameId` jitter)
 * - `castShadowNode` + `renderer.shadowMap.transmitted`: an invisible twin mesh
 *   raymarches the volume from the light's POV so the smoke casts a soft shadow
 * - A layered `useRenderPipeline`: main scene pass + a half-resolution layer-10
 *   volumetric pass -> `gaussianBlur` denoise -> saturation/compose -> `bloom`,
 *   mixing the pass-owned-uniform pattern (bloom knobs) with a user-created
 *   `uniform()` for the blur strength (const-folding factory)
 * - `light.colorNode` (duck-typed, B11 family): the fire point light replaces its
 *   punctual falloff with a capsule (flame column) falloff inside the volume and a
 *   projected radial flicker pattern on solid surfaces
 * - drei `DragControls` + camera-controls interplay via DemoHelpers' `controlsRef`
 *   escape hatch (drag the teapot to stir the fluid); CPU `ImprovedNoise` driving
 *   flame sway/flicker/hue-jitter uniforms every substep
 *
 * DIVERGENCE from original
 * - The Inspector GUI (~40 knobs) becomes a reduced leva panel (~21 knobs with the
 *   original defaults/ranges); dropped knobs — scattering & shadows folder, scene
 *   lights folder, velocity damping / turbulence decay & frequency, motion boost,
 *   wind strength, fire intensity, tone-mapping picker & exposure — are pinned at
 *   the original's defaults in constants.ts
 * - The denoise and bloom enable-checkboxes become always-in-graph strength sliders
 *   (direct value controls; the original rebuilds the pipeline per toggle)
 * - `renderer={{ toneMapping: ACESFilmicToneMapping, toneMappingExposure: 2 }}`
 *   matches the original's explicit setting (here fiber's ACES default happens to
 *   agree — exposure 2 still needs the explicit prop)
 * - The DragControls addon (plus manual OrbitControls.enabled flips and position
 *   clamping) becomes drei's `DragControls` with `dragLimits`, toggling
 *   camera-controls through DemoHelpers' `controlsRef`
 * - OrbitControls -> DemoHelpers CameraControls with the original target and dolly
 *   limits; grid off (the original stages its own dark floor plane)
 * - Uniforms are plain three-side `uniform()` nodes living in the `useNodes` store,
 *   synced from leva in an effect and from the sim loop per substep — not fiber
 *   `useUniforms` (avoids ~26 `UniformNode` casts; identical live-mutation semantics)
 * - `fireRamp`/`henyeyGreenstein` are plain TSL builder functions instead of
 *   destructured-param `Fn`s (destructured Fn params lose typing, UPSTREAM.md B10)
 * - Key light target (1,0,0) dropped for the default origin target (imperceptible
 *   at penumbra 1); shadow map type is fiber's `shadows` default (PCFSoft) rather
 *   than the original's renderer default (PCF)
 * - `WebGPU.isAvailable()` guard, Inspector wiring and `.toInspector()` tags,
 *   `.setName()` kernel labels (fiber names store nodes by key) dropped
 */
import { useRef } from 'react'
import { Canvas } from '@react-three/fiber/webgpu'
import { useControls } from 'leva'
import { ACESFilmicToneMapping } from 'three/webgpu'
import type CameraControlsImpl from 'camera-controls'
import { DemoHelpers } from '../../utils/DemoHelpers'
import { VolumeFire } from './VolumeFire'

export default function VolumeFireExample() {
  const cameraControlsRef = useRef<CameraControlsImpl | null>(null)

  const { simulate, simSpeed, turbulence, buoyancy, fireLifespan, smokeLifespan } = useControls(
    'volume-fire simulation',
    {
      simulate: true,
      simSpeed: { value: 1.2, min: 0, max: 2, step: 0.01 },
      turbulence: { value: 3.2, min: 0, max: 5, step: 0.05 },
      buoyancy: { value: 3.0, min: 0, max: 10, step: 0.1 },
      fireLifespan: { value: 1.3, min: 0.5, max: 10, step: 0.1 },
      smokeLifespan: { value: 3.5, min: 1, max: 100, step: 0.5 },
    },
  )

  const { temperature, density, teapotEmissive } = useControls('volume-fire emitter', {
    temperature: { value: 5.5, min: 0, max: 8, step: 0.05 },
    density: { value: 7.0, min: 0, max: 20, step: 0.1 },
    teapotEmissive: { value: 0.2, min: 0, max: 1, step: 0.001 },
  })

  const { fireHue, glowSpread, fireSaturation, startColor, midColor, endColor } = useControls(
    'volume-fire look',
    {
      fireHue: { value: 0, min: 0, max: 360, step: 1 },
      glowSpread: { value: 5.0, min: 1, max: 5, step: 0.1 },
      fireSaturation: { value: 1.1, min: 0, max: 2, step: 0.05 },
      startColor: '#ffe68c',
      midColor: '#ff7305',
      endColor: '#ff0000',
    },
  )

  const { steps, resolution, denoise, bloomStrength, bloomRadius, bloomThreshold } = useControls(
    'volume-fire quality',
    {
      steps: { value: 16, min: 4, max: 42, step: 1 },
      resolution: { value: 0.5, min: 0.1, max: 1, step: 0.05 },
      denoise: { value: 0.5, min: 0, max: 1, step: 0.01 },
      bloomStrength: { value: 0.1, min: 0, max: 3, step: 0.01 },
      bloomRadius: { value: 1.0, min: 0, max: 1, step: 0.01 },
      bloomThreshold: { value: 0.5, min: 0, max: 1, step: 0.01 },
    },
  )

  return (
    <Canvas
      // The original sets ACESFilmic + exposure 2 explicitly — mirrored here
      // (deliberate tone-mapping choice per the corpus rule; the fire ramp is HDR
      // and unwatchable without the filmic rolloff).
      renderer={{ toneMapping: ACESFilmicToneMapping, toneMappingExposure: 2 }}
      shadows
      background="#000000"
      camera={{ position: [14, 5.5, 4.4], fov: 60, near: 0.1, far: 100 }}
    >
      <VolumeFire
        simulate={simulate}
        simSpeed={simSpeed}
        turbulence={turbulence}
        buoyancy={buoyancy}
        fireLifespan={fireLifespan}
        smokeLifespan={smokeLifespan}
        temperature={temperature}
        density={density}
        teapotEmissive={teapotEmissive}
        fireHue={fireHue}
        glowSpread={glowSpread}
        fireSaturation={fireSaturation}
        startColor={startColor}
        midColor={midColor}
        endColor={endColor}
        steps={steps}
        resolution={resolution}
        denoise={denoise}
        bloomStrength={bloomStrength}
        bloomRadius={bloomRadius}
        bloomThreshold={bloomThreshold}
        cameraControlsRef={cameraControlsRef}
      />
      <DemoHelpers
        grid={false}
        target={[0, 3.6, 0]}
        minDistance={2}
        maxDistance={40}
        controlsRef={cameraControlsRef}
      />
    </Canvas>
  )
}

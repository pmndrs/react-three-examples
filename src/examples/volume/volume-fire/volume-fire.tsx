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
 *   with `useUniforms` feeding denoise and bloom nodes directly before compilation
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
 * - Controls live beside the fire system that consumes them. Leva-backed values feed
 *   the existing TSL uniforms through `useUniforms`; frame-driven uniforms remain
 *   imperative and are never reset by React renders
 * - `fireRamp`/`henyeyGreenstein` are plain TSL builder functions instead of
 *   destructured-param `Fn`s (destructured Fn params lose typing, UPSTREAM.md B10)
 * - Key light target (1,0,0) dropped for the default origin target (imperceptible
 *   at penumbra 1); shadow map type is fiber's `shadows` default (PCFSoft) rather
 *   than the original's renderer default (PCF)
 * - `WebGPU.isAvailable()` guard, Inspector wiring and `.toInspector()` tags,
 *   `.setName()` kernel labels (fiber names store nodes by key) dropped
 */
import { useRef } from 'react'
import { ACESFilmicToneMapping } from 'three/webgpu'
import { Canvas } from '@react-three/fiber/webgpu'
import type CameraControlsImpl from 'camera-controls'
import { DemoHelpers } from '../../../utils/DemoHelpers'
import { VolumeFire } from './VolumeFire'

export default function VolumeFireExample() {
  const cameraControlsRef = useRef<CameraControlsImpl | null>(null)

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
      <VolumeFire cameraControlsRef={cameraControlsRef} />
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

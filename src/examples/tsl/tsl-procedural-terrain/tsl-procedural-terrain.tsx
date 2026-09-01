/**
 * tsl-procedural-terrain
 * R3F port of three.js `webgpu_tsl_procedural_terrain`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_tsl_procedural_terrain (~330 lines of JS)
 *
 * DEMONSTRATES
 * - A fully procedural terrain authored in TSL on one `MeshStandardNodeMaterial`
 *   (Terrain.tsx): `positionNode` displaces a flat 500x500-segment plane with
 *   domain-warped fractal `mx_noise_float`, `normalNode` rebuilds lighting normals from
 *   two neighbour elevation taps (`cross` + `transformNormalToView` — the geometry has
 *   its `normal`/`uv` attributes deleted on purpose), and `colorNode` bands a
 *   sand/grass/rock/snow palette off elevation + slope carried in `varying`s
 * - Build-time vs run-time TSL in practice: the octave count is a uniform driving
 *   `Loop({ type: 'float', end: uIterations, condition: '<=' })`, so every leva knob —
 *   iterations included — mutates GPU-side uniforms live, with zero shader rebuilds
 * - Drag-to-scroll infinite terrain via R3F pointer events: an invisible ground plane's
 *   `onPointerDown`/`onPointerMove` feed a `vec2` offset uniform consumed inside the
 *   elevation function — the geometry never changes, the noise domain slides under it
 *   (grab the terrain and drag; camera-controls are suspended through the
 *   `controlsRef` escape hatch while dragging)
 * - Real-light interplay with displaced geometry: a shadow-casting
 *   `<directionalLight>` over the displaced mesh (`castShadow` + `receiveShadow` on the
 *   same terrain), plus a `transmission`-based `<meshPhysicalNodeMaterial>` water plane
 *   refracting the terrain below it
 * - drei `Environment` (`/webgpu`) driving HDR background (blurred) + IBL, matching the
 *   original's equirectangular `scene.background`/`scene.environment` pair
 *
 * DIVERGENCE from original
 * - The drag interaction is ported from a hand-rolled `Raycaster` + DOM listeners to
 *   R3F pointer events on the (invisible) drag plane, with `window` `pointerup` to end
 *   drags that release off-canvas — same 10x plane grow-while-dragging trick as the
 *   original so the pointer can't escape the hit area mid-drag
 * - During a drag the camera-controls are disabled via the `controlsRef` escape
 *   hatch, mirroring `controls.enabled = false`
 * - `normalLookUpShift` folded into a constant (0.01) — the original declares it as a
 *   uniform but never exposes it in the GUI
 * - The scene (light/terrain/water) is Suspense-gated on the `<Environment>` HDR
 *   fetch instead of the original's mount-first-env-later flow: if the terrain's
 *   shader graph compiles before `scene.environment` lands, three 0.185.1
 *   intermittently never folds the IBL into this material (custom position/normal/
 *   color nodes + shadows), leaving shadowed valleys pitch black — race verified both
 *   ways locally; gating makes the first build deterministic
 */
import { Suspense, useRef } from 'react'
import { ACESFilmicToneMapping } from 'three/webgpu'

import { Canvas } from '@react-three/fiber/webgpu'
import { Environment } from '@react-three/drei/webgpu'
import { folder, useControls } from 'leva'
import type CameraControlsImpl from 'camera-controls'

import { DemoHelpers } from '../../../utils/DemoHelpers'
import { Terrain } from './Terrain'

const HDR_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/equirectangular/pedestrian_overpass_1k.hdr'

export default function TslProceduralTerrain() {
  // Only consumed by the water mesh right here — the terrain's own knobs live next
  // to Terrain, the only thing that reads them (merges into the same leva panel).
  const { waterRoughness, waterIor, waterColor } = useControls('tsl-procedural-terrain', {
    water: folder({
      waterRoughness: { value: 0.5, min: 0, max: 1, step: 0.01, label: 'roughness' },
      waterIor: { value: 1.333, min: 1, max: 2, step: 0.001, label: 'ior' },
      waterColor: { value: '#4db2ff', label: 'color' },
    }),
  })

  // Escape hatch to the live camera-controls instance — Terrain disables orbiting for
  // the duration of a terrain drag, like the original's `controls.enabled = false`.
  const controlsRef = useRef<CameraControlsImpl>(null)

  return (
    <Canvas
      renderer={{ toneMapping: ACESFilmicToneMapping }}
      shadows
      background="#201919"
      camera={{ position: [-10, 8, -2.2], fov: 35, near: 0.1, far: 100 }}
    >
      {/* One Suspense over environment + scene: <Environment> suspends on the HDR
          fetch, so the terrain's (expensive, built-once) shader graph only compiles
          AFTER `scene.environment` is set. Mounting the terrain before the HDR lands
          intermittently left its material without IBL (shadowed valleys rendered pitch
          black) — the runtime env-change rebuild is not reliable for this material on
          three 0.185.1, see header DIVERGENCE. */}
      <Suspense fallback={null}>
        {/* HDR environment: blurred background + IBL, one file (original: HDRLoader +
            scene.background/backgroundBlurriness/environment). */}
        <Environment files={HDR_URL} background backgroundBlurriness={0.5} />

        <directionalLight
          color="#ffffff"
          intensity={2}
          position={[6.25, 3, 4]}
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-camera-near={0.1}
          shadow-camera-far={30}
          shadow-camera-top={8}
          shadow-camera-right={8}
          shadow-camera-bottom={-8}
          shadow-camera-left={-8}
          shadow-normalBias={0.05}
        />

        <Terrain controlsRef={controlsRef} />

        {/* Water: a plain transmissive physical material — no node graph needed. */}
        <mesh rotation-x={-Math.PI * 0.5} position-y={-0.1}>
          <planeGeometry args={[10, 10]} />
          <meshPhysicalNodeMaterial
            transmission={1}
            roughness={waterRoughness}
            ior={waterIor}
            color={waterColor}
          />
        </mesh>
      </Suspense>

      <DemoHelpers
        grid={false}
        target={[0, -0.5, 0]}
        maxPolarAngle={Math.PI * 0.45}
        minDistance={0.1}
        maxDistance={50}
        controlsRef={controlsRef}
      />
    </Canvas>
  )
}

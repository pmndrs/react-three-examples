/**
 * shadowmap-progressive
 * R3F port of three.js `webgpu_shadowmap_progressive`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_shadowmap_progressive (~210 lines of JS)
 * By zalo (https://github.com/zalo), inspired by evanw's Lightmap Generation.
 *
 * DEMONSTRATES
 * - `ProgressiveLightMap` (three/addons/misc/ProgressiveLightMapGPU): every frame,
 *   renders the lit objects into a UV-unwrapped "surface map" texture and blends it
 *   with the previous frame's result — a TAA-style accumulator, NOT a one-shot bake.
 *   Four directional lights get randomly re-jittered every frame (sometimes near a
 *   draggable "sun" origin, sometimes uniformly over a hemisphere), so the accumulated
 *   lightmap converges toward soft, ambient-occlusion-like shadows the longer it runs
 * - Two `TransformControls` gizmos (drei, `/webgpu`) manipulating live scene objects —
 *   the light-jitter origin and the loaded model — with orbit controls disabled for
 *   the drag's duration via the `controlsRef` escape hatch (`onMouseDown`/`onMouseUp`)
 * - `potpack`-based UV1 unwrapping (`addObjectsToLightMap`) packs every lightmap
 *   object's own UVs into one shared texture atlas automatically — no manual lightmap
 *   UV authoring
 * - `Blend Window` as the accumulator's exponential-moving-average window: small
 *   values react fast but stay noisy, large values converge to a smooth result slowly
 *   — the single knob that best demonstrates "progressive"
 *
 * DIVERGENCE from original
 * - `addObjectsToLightMap` is called ONCE with the complete final object list
 *   (lights + ground + every loaded mesh), after the model has fully loaded. The
 *   original calls it once per mesh found during `traverse()`, each time re-passing
 *   the whole (growing) array — since the method re-processes and re-registers
 *   everything it's given, that repeats work for objects already registered. Same end
 *   state, without the redundant re-packing.
 * - `renderer={{ toneMapping: NoToneMapping }}` — the original never sets
 *   `renderer.toneMapping`, so it runs the WebGPURenderer default; fiber's Canvas
 *   would otherwise default to ACESFilmic (AGENTS.md tone-mapping parity trap).
 * - OrbitControls -> this repo's `CameraControls` (via `DemoHelpers`); damping/
 *   `screenSpacePanning` have no direct equivalent knob and are left at
 *   `CameraControls`' own (already-damped) defaults.
 * - `renderer.inspector` GUI replaced by leva `useControls`, same six controls
 *   (Enable, Blur Edges, Blend Window, Light Radius, Ambient Weight, Debug Lightmap).
 * - Grid disabled (`grid={false}`) — the scene's own 600×600 ground plane is the
 *   lightmap receiver in frame, and TransformControls gizmos already crowd the view.
 */
import { Suspense, useRef } from 'react'
import { Canvas } from '@react-three/fiber/webgpu'
import { useControls } from 'leva'
import type CameraControlsImpl from 'camera-controls'
import { NoToneMapping } from 'three/webgpu'
import { DemoHelpers } from '../../utils/DemoHelpers'
import { LightmapScene } from './LightmapScene'

export default function ShadowmapProgressive() {
  const controlsRef = useRef<CameraControlsImpl>(null)

  const { enabled, blurEdges, blendWindow, lightRadius, ambientWeight, debugLightmap } = useControls(
    'shadowmap-progressive',
    {
      enabled: { value: true, label: 'Enable' },
      blurEdges: { value: true, label: 'Blur Edges' },
      blendWindow: { value: 200, min: 1, max: 500, step: 1, label: 'Blend Window' },
      lightRadius: { value: 50, min: 0, max: 200, step: 10, label: 'Light Radius' },
      ambientWeight: { value: 0.5, min: 0, max: 1, step: 0.1, label: 'Ambient Weight' },
      debugLightmap: { value: false, label: 'Debug Lightmap' },
    },
  )

  return (
    <Canvas
      // Deliberate NoToneMapping parity — see header DIVERGENCE.
      renderer={{ toneMapping: NoToneMapping }}
      shadows
      background="#949494"
      camera={{ position: [0, 100, 200], fov: 70, near: 1, far: 1000 }}
    >
      <fog attach="fog" args={['#949494', 1000, 3000]} />
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes the displayed scene (AGENTS.md; corpus-wide repair, wave 8). */}
      <Suspense fallback={null}>
        <LightmapScene
          enabled={enabled}
          blurEdges={blurEdges}
          blendWindow={blendWindow}
          lightRadius={lightRadius}
          ambientWeight={ambientWeight}
          debugLightmap={debugLightmap}
          controlsRef={controlsRef}
        />
      </Suspense>
      <DemoHelpers
        grid={false}
        target={[0, 100, 0]}
        minDistance={100}
        maxDistance={500}
        maxPolarAngle={Math.PI / 1.5}
        controlsRef={controlsRef}
      />
    </Canvas>
  )
}

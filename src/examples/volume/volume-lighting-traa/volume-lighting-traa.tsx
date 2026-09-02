/**
 * volume-lighting-traa
 * The same "god rays from ordinary lights" volumetric fog as `volume-lighting`, but
 * resolved through TRAA instead of a dedicated gaussian-blur denoise pass — one
 * temporal-jitter sequence (Halton) drives both the camera's anti-aliasing samples
 * AND the fog's own raymarch dither, so they accumulate together instead of fighting.
 * Original: https://threejs.org/examples/#webgpu_volume_lighting_traa
 *
 * DEMONSTRATES
 * - TRAA (`three/addons/tsl/display/TRAANode.js`) resolving a scene that mixes real
 *   shadow-casting geometry with a raymarched, ADDITIVE-blended volumetric mesh — the
 *   same depth + velocity buffers feed both the fog's occlusion and TRAA's reprojection
 * - Single-sampled pre-pass + MRT: `depthPass(scene, camera, { samples: 0 })` for
 *   occlusion depth, `scenePass.setMRT(mrt({ output, velocity }))` for the beauty +
 *   motion-vector buffers TRAA needs — every pass forced to `samples: 0` (AGENTS.md:
 *   fiber's Canvas defaults to 4x MSAA, which breaks TRAA's depth-history copy)
 * - A PAUSABLE shader-time uniform (`animated` toggle) driving the fog's domain warp,
 *   independent of the ALWAYS-RUNNING Halton jitter that feeds TRAA — two different
 *   "time" concepts in one scene, only one of which the user can freeze
 * - `useRenderPipeline`'s return-to-register pattern swapping the pipeline's output
 *   between the TRAA chain and the raw scene color, mirroring the original's own
 *   `params.traa` GUI toggle
 *
 * DIVERGENCE from original
 * - The original's `volumetricIntensity` uniform is built and wired into its own GUI
 *   slider ("volumetric intensity") but never multiplied into anything in the render
 *   graph — a dead control (same class of no-op as `volume_lighting`'s
 *   `spotLight.lookAt()`, or `volume_caustics`'s unused texture). Dropped.
 * - `renderer.inspector` dat.gui-style panel -> leva, same knobs
 * - OrbitControls -> this repo's CameraControls, same 2/40 dolly limits
 */
import { Suspense } from 'react';
import { NeutralToneMapping } from 'three/webgpu';

import { Canvas } from '@react-three/fiber/webgpu';

import { DemoHelpers } from '../../../utils/DemoHelpers';
import { VolumeLightingTraa } from './VolumeLightingTraa';

export default function VolumeLightingTraaExample() {
  return (
    <Canvas
      renderer={{ toneMapping: NeutralToneMapping, toneMappingExposure: 2 }}
      shadows
      background="#000000"
      camera={{ position: [-8, 1, -6], fov: 60, near: 0.1, far: 100 }}>
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes the displayed scene (AGENTS.md; corpus-wide repair, wave 8). */}
      <Suspense fallback={null}>
        <VolumeLightingTraa />
      </Suspense>
      <DemoHelpers grid={false} minDistance={2} maxDistance={40} />
    </Canvas>
  );
}

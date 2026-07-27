/**
 * instance-points
 * R3F port of three.js `webgpu_instance_points`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_instance_points (~200 lines of JS)
 *
 * DEMONSTRATES
 * - "Fat points" as instanced sprites: ONE `<sprite count={n}>` drawing n camera-facing
 *   quads through `PointsNodeMaterial` — per-instance placement/tint via
 *   `instancedBufferAttribute` feeding `positionNode`/`colorNode`, per-instance pixel
 *   size via `sizeNode` (`sizeAttenuation` off = screen-space px, like gl.POINTS but
 *   wide), `shapeCircle()` as the round `opacityNode` mask, and `alphaToCoverage`
 *   MSAA edge smoothing (`InstancedPoints.tsx`)
 * - A per-frame compute kernel pulsing the per-instance sizes in a GPU storage buffer:
 *   `useBuffers` (`instancedArray` seeded from CPU data) + a `useNodes` kernel
 *   dispatched with `renderer.compute()` in `useFrame({ phase: 'update' })`; the same
 *   storage buffer is read back in the render graph via `.toAttribute()` — both as
 *   `sizeNode` and as the color-fade factor (small point -> dark), zero CPU sync
 * - leva knobs -> live `useUniforms` referenced by BOTH the compute kernel
 *   (pulse speed, min/max width) and the render graph (max width normalizes the fade)
 * - Render-phase takeover (`useFrame(cb, { phase: 'render' })`, `InsetView.tsx`):
 *   full-viewport main render, then `clearDepth` + scissored square inset re-rendering
 *   the SAME scene through a pose-copying second camera — the picture-in-picture
 *   scissor/viewport idiom shared with the `lines-fat` sibling
 *
 * DIVERGENCE from original
 * - Inspector GUI -> leva, same four knobs and ranges (alphaToCoverage toggle,
 *   minWidth 1-30, maxWidth 2-30, pulseSpeed 1-20); the Inspector itself and stats
 *   are shell furniture and omitted
 * - The alphaToCoverage toggle sets `material.needsUpdate` explicitly: a2c is baked
 *   into `shapeCircle()`'s build-time branch AND the pipeline's multisample state, so
 *   a bare property write (all the original's GUI does) can't rebuild the shader
 * - The size storage buffer is created with fiber's `useBuffers` + `instancedArray`
 *   (seeded from the CPU array) instead of the original's manual
 *   `StorageInstancedBufferAttribute` + `storage()` pair — same GPU layout, and the
 *   material reads it via `.toAttribute()` rather than re-wrapping the attribute
 * - The inset pane is pinned TOP-left explicitly (top-origin WebGPU viewport coords).
 *   The original reuses bottom-origin inset math, and because WebGPURenderer's
 *   setViewport/setScissor y is top-origin its inset silently lands bottom-left —
 *   where this shell's titleblock overlay would cover it (same fix as `lines-fat`)
 * - OrbitControls -> this repo's CameraControls (via DemoHelpers), same 10/500 dolly
 *   limits; damping is CameraControls' default; DemoHelpers grid disabled (pulsing
 *   points in a black void)
 * - `renderer={{ toneMapping: NoToneMapping }}` pinned: the original renders with the
 *   WebGPURenderer default and the fully-saturated HSL rainbow is the point —
 *   fiber's ACESFilmic default would mute it (tone-mapping parity rule)
 */
import { Canvas } from '@react-three/fiber/webgpu'
import { useControls } from 'leva'
import { NoToneMapping } from 'three/webgpu'
import { DemoHelpers } from '../../utils/DemoHelpers'
import { InsetView } from './InsetView'
import { InstancedPoints } from './InstancedPoints'

export default function InstancePoints() {
  const { alphaToCoverage, minWidth, maxWidth, pulseSpeed } = useControls('instance-points', {
    alphaToCoverage: { value: true, label: 'alpha to coverage' },
    minWidth: { value: 6, min: 1, max: 30, step: 1, label: 'min width (px)' },
    maxWidth: { value: 20, min: 2, max: 30, step: 1, label: 'max width (px)' },
    pulseSpeed: { value: 6, min: 1, max: 20, step: 0.1, label: 'pulse speed' },
  })

  return (
    <Canvas
      // Original renders with the WebGPURenderer default (NoToneMapping) — see header.
      renderer={{ toneMapping: NoToneMapping }}
      camera={{ position: [-40, 0, 60], fov: 40, near: 1, far: 1000 }}
    >
      <InstancedPoints
        alphaToCoverage={alphaToCoverage}
        minWidth={minWidth}
        maxWidth={maxWidth}
        pulseSpeed={pulseSpeed}
      />
      <InsetView />
      <DemoHelpers grid={false} minDistance={10} maxDistance={500} />
    </Canvas>
  )
}

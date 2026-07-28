/**
 * rendertarget-2d-array-3d
 * R3F port of three.js `webgpu_rendertarget_2d-array_3d`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_rendertarget_2d-array_3d (~280 lines of JS)
 *
 * DEMONSTRATES
 * - Four independent scenes/cameras/OrbitControls composited into ONE canvas via
 *   manual `renderer.setViewport`/`setScissor` + `renderer.render(scene, camera)` per
 *   quadrant — a fully custom multi-view render loop (`{ phase: 'render' }` takeover,
 *   per AGENTS.md: only for examples genuinely about custom rendering), the 4-way
 *   sibling of `lines-fat`'s InsetView 2-pass pattern
 * - `THREE.RenderTarget3D` and a `THREE.RenderTarget` constructed with `{ depth: n }`
 *   (a "RenderTargetArray" — there's no separate class, the option alone switches the
 *   target's texture to an array texture): both written ONE LAYER AT A TIME via
 *   `renderer.setRenderTarget(target, layerIndex)` + a raw `QuadMesh` blit,
 *   continuously cycling which layer holds the live CT-scan slice — GPU-resident
 *   volumetric render TARGETS, not just volumetric source textures
 * - `TextureHelper` (`three/addons/helpers/TextureHelperGPU.js`): the same debug-
 *   visualization mesh for 4 different texture kinds side by side — a raw
 *   `DataArrayTexture`, a raw `Data3DTexture`, and the two render-target textures
 *   above — each rendered as a stack of slightly-offset planes in its own quadrant
 * - The WebGPU-only one-time "clear every layer of a 3D render target before first
 *   use" requirement, a real validation quirk the original itself calls out
 * - `useZippedVolumeData` (`src/utils/`) reused verbatim from `textures-2d-array` —
 *   the same head256x256x109.zip volume feeds both ports
 *
 * DIVERGENCE from original
 * - BUG FIX vs. the original: the original computes each viewport's canvas rect
 *   with WebGL's bottom-origin convention (`y = (1 - top - height) * H`), but
 *   WebGPU's `setViewport`/`setScissor` is TOP-origin (verified in
 *   `WebGPUBackend.js` — no flip; AGENTS.md, same bug class as `lines-fat`'s
 *   InsetView finding). Walking the original's own math against its on-page corner
 *   labels shows each quadrant's CONTENT lands vertically MIRRORED from its label
 *   on WebGPU. This port computes viewport rects TOP-origin directly
 *   (`MultiViewRig.tsx`), so content lands where it's conceptually meant to:
 *   RenderTargetArray/RenderTarget3D on top, the raw DataArrayTexture/Data3DTexture
 *   they're filled from underneath.
 * - The original's four on-page corner-label `<div>`s are dropped — the two content
 *   types are visually distinct without them (the top row visibly cycles through
 *   slices as the fill loop advances; the bottom row is a static full-volume debug
 *   stack), and adding viewport-anchored DOM overlays around the Canvas would fight
 *   this shell's own sidebar/titleblock layout for no real teaching value here.
 * - The periodic render-target layer fill (originally a decoupled `setInterval(50)`
 *   wall-clock timer racing the render loop for the renderer's global viewport/
 *   scissor/render-target state) is folded into the SAME `useFrame` callback as the
 *   4-view render, gated by `state.elapsed` (same technique as
 *   `textures-partialupdate`) — one RAF-driven loop, deterministic ordering. Fill
 *   rate is a leva control (`layersPerSecond`, default 20 ≈ the original's 50ms/layer
 *   pace) instead of the hardcoded interval.
 * - DemoHelpers' grid AND camera-controls are both disabled: there are 4 independent
 *   cameras here, none of them a single user-navigable "the" camera (same rationale
 *   as `camera-array`) — each quadrant gets its own raw `OrbitControls` instead
 *   (`MultiViewRig.tsx`), matching the original's own per-view controls.
 */
import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber/webgpu'
import { useControls } from 'leva'
import { NoToneMapping } from 'three/webgpu'
import { useZippedVolumeData } from '../../utils/useZippedVolumeData'
import { DemoHelpers } from '../../utils/DemoHelpers'
import { MultiViewRig } from './MultiViewRig'

const VOLUME_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/3d/head256x256x109.zip'
const VOLUME_ENTRY = 'head256x256x109'

function Rig({ layersPerSecond }: { layersPerSecond: number }) {
  // Suspends until the shared zip volume is loaded + unpacked (see
  // `textures-2d-array` for the sibling port using the same asset).
  const data = useZippedVolumeData(VOLUME_URL, VOLUME_ENTRY)
  return <MultiViewRig data={data} layersPerSecond={layersPerSecond} />
}

export default function RenderTarget2DArray3D() {
  const { layersPerSecond } = useControls('rendertarget-2d-array-3d', {
    layersPerSecond: { value: 20, min: 2, max: 60, step: 1, label: 'layers / second' },
  })

  return (
    <Canvas renderer={{ toneMapping: NoToneMapping }} background="#000000">
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes the displayed scene (AGENTS.md; corpus-wide repair, wave 8). */}
      <Suspense fallback={null}>
        <Rig layersPerSecond={layersPerSecond} />
      </Suspense>
      <DemoHelpers grid={false} controls={false} />
    </Canvas>
  )
}

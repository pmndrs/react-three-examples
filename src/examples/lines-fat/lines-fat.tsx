/**
 * lines-fat
 * R3F port of three.js `webgpu_lines_fat`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_lines_fat (~280 lines of JS)
 *
 * DEMONSTRATES
 * - The three.js "fat lines" addon stack on WebGPU: `Line2` (the
 *   `three/addons/lines/webgpu/` variant) + `LineGeometry` + `Line2NodeMaterial`
 *   drawing an instanced-quad polyline with real width (pixels OR world units),
 *   vertex colors, dashing, and alphaToCoverage MSAA edge smoothing — side by side
 *   with a native `Line` + `LineBasicNodeMaterial`/`LineDashedNodeMaterial`
 *   (`gl.LINE_STRIP`, always 1px) on the same Hilbert-curve geometry for comparison
 * - Live material knobs via the leva → plain-material-accessor pattern
 *   (`HilbertLines.tsx`): `Line2NodeMaterial`'s `linewidth`/`scale`/`dashSize`/
 *   `gapSize`/`dashOffset` are reference-node-backed, so plain property writes in
 *   effects are picked up per frame — no uniform plumbing; `worldUnits`/`dashed`/
 *   `alphaToCoverage` setters bump `needsUpdate` themselves and rebuild the pipeline
 * - Render-phase takeover (`useFrame(cb, { phase: 'render' })`, `InsetView.tsx`)
 *   reproducing the original's hand-rolled two-pass loop: full-viewport main render,
 *   then `clearDepth` + scissored square inset re-rendering the SAME scene through a
 *   second camera that copies the orbit camera's pose each frame — the classic
 *   scissor/viewport picture-in-picture idiom (cousin: `camera/CameraRig.tsx`)
 * - `scene.backgroundNode` swapped per pass (null for the main pass, `color(0x222222)`
 *   for the inset) so the inset pane reads as a separate framed view
 *
 * DIVERGENCE from original
 * - lil-gui -> leva; the width control is split into two sliders (`width (px)` 1-10,
 *   `width (world)` 0.1-0.5) shown conditionally on the `world units` toggle, instead
 *   of the original's single controller that re-ranges itself in the toggle callback;
 *   dash controls only render while `dashed` is on (they're inert otherwise)
 * - Width defaults reconciled to 5px: the original constructs the material with
 *   `linewidth: 5` but shows 10 in the GUI until first touch — we make the control
 *   and the material agree
 * - The dashed strip-line material starts at `scale: 1` (not the original's `scale: 2`
 *   constructor value that its own GUI default of 1 immediately contradicts) — both
 *   dashed materials track the single `dash scale` control from the start
 * - OrbitControls -> this repo's CameraControls (via DemoHelpers), same 10/500
 *   dolly limits; damping is CameraControls' default
 * - The inset pane is pinned TOP-left explicitly (`insetY = margin` in top-origin
 *   WebGPU viewport coords). The original reuses the webgl version's bottom-origin
 *   math, and because WebGPURenderer's setViewport/setScissor y is top-origin (no
 *   WebGL-style flip in the backend), its inset silently lands bottom-left on WebGPU
 *   — where this shell's titleblock overlay would cover it
 * - DemoHelpers grid disabled — the original is lines in a black void; stats.js
 *   omitted (shell furniture)
 * - `renderer={{ toneMapping: NoToneMapping }}` pinned: the original renders with the
 *   WebGPURenderer default and the fully-saturated HSL rainbow is the whole point —
 *   fiber's ACESFilmic default would mute it (tone-mapping parity rule)
 */
import { Canvas } from '@react-three/fiber/webgpu'
import { useControls } from 'leva'
import { NoToneMapping } from 'three/webgpu'
import { DemoHelpers } from '../../utils/DemoHelpers'
import { HilbertLines, type DashRatio, type LineType } from './HilbertLines'
import { InsetView } from './InsetView'

export default function LinesFat() {
  const { lineType, worldUnits, widthPx, widthWorld, alphaToCoverage, dashed, dashScale, dashOffset, dashRatio } =
    useControls('lines-fat', {
      lineType: {
        value: 'fat' as LineType,
        options: { 'LineGeometry (fat)': 'fat', 'gl.LINE_STRIP (native)': 'strip' } as Record<string, LineType>,
        label: 'line type',
      },
      worldUnits: { value: false, label: 'world units' },
      widthPx: {
        value: 5,
        min: 1,
        max: 10,
        step: 0.5,
        label: 'width (px)',
        render: (get) => !(get('lines-fat.worldUnits') as boolean),
      },
      widthWorld: {
        value: 0.5,
        min: 0.1,
        max: 0.5,
        step: 0.01,
        label: 'width (world)',
        render: (get) => get('lines-fat.worldUnits') as boolean,
      },
      alphaToCoverage: { value: false, label: 'alpha to coverage' },
      dashed: { value: false },
      dashScale: {
        value: 1,
        min: 0.5,
        max: 2,
        step: 0.1,
        label: 'dash scale',
        render: (get) => get('lines-fat.dashed') as boolean,
      },
      dashOffset: {
        value: 0,
        min: 0,
        max: 5,
        step: 0.1,
        label: 'dash offset',
        render: (get) => get('lines-fat.dashed') as boolean,
      },
      dashRatio: {
        value: '1:1' as DashRatio,
        options: { '2 : 1': '2:1', '1 : 1': '1:1', '1 : 2': '1:2' } as Record<string, DashRatio>,
        label: 'dash / gap',
        render: (get) => get('lines-fat.dashed') as boolean,
      },
    })

  return (
    <Canvas
      // Original renders with the WebGPURenderer default (NoToneMapping) — see header.
      renderer={{ toneMapping: NoToneMapping }}
      camera={{ position: [-40, 0, 60], fov: 40, near: 1, far: 1000 }}
    >
      <HilbertLines
        lineType={lineType}
        worldUnits={worldUnits}
        width={worldUnits ? widthWorld : widthPx}
        alphaToCoverage={alphaToCoverage}
        dashed={dashed}
        dashScale={dashScale}
        dashOffset={dashOffset}
        dashRatio={dashRatio}
      />
      <InsetView />
      <DemoHelpers grid={false} minDistance={10} maxDistance={500} />
    </Canvas>
  )
}

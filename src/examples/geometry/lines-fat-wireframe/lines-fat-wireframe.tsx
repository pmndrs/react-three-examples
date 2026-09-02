/**
 * lines-fat-wireframe
 * R3F port of three.js `webgpu_lines_fat_wireframe`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_lines_fat_wireframe (~150 lines of JS)
 *
 * DEMONSTRATES
 * - `Wireframe` + `WireframeGeometry2` (the fat-lines addon applied to an EDGE
 *   set instead of a polyline): instanced-quad wireframe edges with real width
 *   (pixels) and dashing, side by side with a native `LineSegments` +
 *   `WireframeGeometry` (`gl.LINE`, always 1px) built from the SAME Icosahedron
 * - Live material knobs via the leva -> plain-material-accessor pattern
 *   (`Wireframe.tsx`, shared technique with the `lines-fat` sibling): `linewidth`/
 *   `scale`/`dashSize`/`gapSize` are reference-node-backed, so plain property writes
 *   in effects are picked up per frame; the `dashed` setter bumps `needsUpdate` itself
 * - Render-phase takeover (`useFrame(cb, { phase: 'render' })`, `InsetView.tsx`)
 *   reproducing the original's hand-rolled two-pass loop: full-viewport main render,
 *   then a scissored square inset re-rendering the SAME scene through a second camera
 *   that copies the orbit camera's pose each frame (identical technique to the
 *   `lines-fat` sibling — see that file's header for the full picture-in-picture idiom)
 * - `scene.backgroundNode` swapped per pass (null for the main pass, `color(0x222222)`
 *   for the inset) so the inset pane reads as a separate framed view
 *
 * DIVERGENCE from original
 * - lil-gui -> leva; dash controls only render while `dashed` is on (inert otherwise)
 * - The inset pane is pinned TOP-left explicitly (`insetY = margin` in top-origin
 *   WebGPU viewport coords) — see `InsetView.tsx` (same fix as `lines-fat`'s inset;
 *   WebGPURenderer's setViewport/setScissor y has no WebGL-style bottom-origin flip)
 * - OrbitControls -> this repo's CameraControls (via DemoHelpers), same 10/500
 *   dolly limits; damping is CameraControls' default
 * - DemoHelpers grid disabled — the original is a wireframe sphere in a black void
 * - `renderer={{ toneMapping: NoToneMapping }}` pinned: the original renders with the
 *   WebGPURenderer default (tone-mapping parity rule)
 */
import { NoToneMapping } from 'three/webgpu';
import { Canvas } from '@react-three/fiber/webgpu';
import { DemoHelpers } from '../../../utils/DemoHelpers';
import { WireframeIcosahedron } from './Wireframe';
import { InsetView } from './InsetView';

export default function LinesFatWireframe() {
  return (
    <Canvas
      // Original renders with the WebGPURenderer default (NoToneMapping) — see header.
      renderer={{ toneMapping: NoToneMapping }}
      camera={{ position: [-50, 0, 50], fov: 40, near: 1, far: 1000 }}>
      <WireframeIcosahedron />
      <InsetView />
      <DemoHelpers grid={false} minDistance={10} maxDistance={500} />
    </Canvas>
  );
}

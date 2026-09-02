/**
 * lines-fat-raycasting
 * R3F port of three.js `webgpu_lines_fat_raycasting`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_lines_fat_raycasting (~270 lines of JS)
 *
 * DEMONSTRATES
 * - Raycasting against fat lines: `LineSegments2`/`Line2`'s own `.raycast()`
 *   override (an instanced-quad hit test, not a native `gl.LINE` one), configured
 *   via `raycaster.params.Line2.threshold` — a pixel margin around the visible line
 *   that still counts as a hit
 * - A manual, CONTINUOUS per-frame hit test (`Raycasting.tsx`) instead of a discrete
 *   `onPointerMove` handler: with `animate` on, the line rotates under a stationary
 *   cursor, so the intersection markers must re-test every frame even when the
 *   pointer itself hasn't moved — R3F's built-in hover events alone can't reproduce
 *   that (category note, AGENTS.md)
 * - `Line2NodeMaterial`'s live-uniform property writes (`RaycastLines.tsx`, shared
 *   technique with the `lines-fat` sibling): `linewidth`/`worldUnits`/
 *   `alphaToCoverage` are picked up per frame with no shader rebuild plumbing
 * - A translucent "threshold" twin of each line, exactly `width + threshold` wide,
 *   visualizing the raycastable margin around the visible line
 *
 * DIVERGENCE from original
 * - lil-gui -> leva; `threshold` is lifted to this page component since both
 *   `RaycastLines` (threshold-overlay width) and `Raycasting` (the raycaster's own
 *   threshold) consume it — the one genuinely-shared control in this example
 * - OrbitControls -> this repo's CameraControls (via DemoHelpers), same 10/500 dolly
 *   limits as the `lines-fat` sibling; damping is CameraControls' default
 * - DemoHelpers grid disabled — the original is a rotating helix in a black void
 * - `renderer={{ toneMapping: NoToneMapping }}` pinned: the original renders with the
 *   WebGPURenderer default and the fully-saturated HSL rainbow is the whole point
 */
import { useRef } from 'react';
import { NoToneMapping } from 'three/webgpu';
import type { Line2 } from 'three/addons/lines/webgpu/Line2.js';
import type { LineSegments2 } from 'three/addons/lines/webgpu/LineSegments2.js';
import { Canvas } from '@react-three/fiber/webgpu';
import { useControls } from 'leva';
import { DemoHelpers } from '../../../utils/DemoHelpers';
import { RaycastLines } from './RaycastLines';
import { Raycasting } from './Raycasting';

export default function LinesFatRaycasting() {
  // Shared by RaycastLines (threshold-overlay width) and Raycasting (the
  // raycaster's own hit-test margin) — see header DIVERGENCE.
  const { threshold } = useControls('lines-fat-raycasting', { threshold: { value: 0, min: 0, max: 10, step: 0.1 } });

  const activeLineRef = useRef<Line2 | LineSegments2 | null>(null);

  return (
    <Canvas
      // Original renders with the WebGPURenderer default (NoToneMapping) — see header.
      renderer={{ toneMapping: NoToneMapping }}
      camera={{ position: [-40, 0, 60], fov: 40, near: 1, far: 1000 }}>
      <RaycastLines activeLineRef={activeLineRef} threshold={threshold} />
      <Raycasting activeLineRef={activeLineRef} threshold={threshold} />
      <DemoHelpers grid={false} minDistance={10} maxDistance={500} />
    </Canvas>
  );
}

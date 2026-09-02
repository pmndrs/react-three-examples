/**
 * compute-rasterizer
 * A rasterizer written in compute shaders. 160,000 teapots are culled, LOD-picked and
 * scan-converted by hand into a packed visibility buffer, then resolved in one
 * fullscreen pass — the hardware pipeline only draws the few triangles too big for a
 * single thread.
 * Original: https://threejs.org/examples/#webgpu_compute_rasterizer
 *
 * DEMONSTRATES
 * - The whole GPU-driven pipeline as five kernels built once in `useNodes` and
 *   dispatched in order: clear, cull + LOD + work allocation, indirect dispatch args,
 *   software raster, hardware draw args
 * - A packed VISIBILITY buffer instead of a colour buffer: depth in the high bits and
 *   the triangle/instance id in the low bits, so a single `atomicMax` per pixel
 *   resolves the depth test and the payload write together, order-independently
 * - GPU-driven work: a kernel appends 64-triangle chunks to a work queue with
 *   `atomicAdd`, a second kernel turns the queue length into an
 *   `IndirectStorageBufferAttribute`, and `renderer.compute(kernel, attribute)`
 *   dispatches from it — the CPU never learns how much work there is
 * - `computeKernel()` rather than `.compute(count)` for the raster pass: a numeric
 *   count would emit a bounds check against a number that only exists on the GPU
 * - Indirect DRAWING for the hardware fallback: a dummy `<mesh>` whose
 *   `geometry.setIndirect()` argument buffer is written by a kernel, with a
 *   `positionNode` that pulls every vertex out of storage by `vertexIndex`
 * - A render-phase takeover (`useFrame(cb, { phase: 'render' })`) that is the demo:
 *   compute passes, then a `QuadMesh` resolve that republishes the software depth via
 *   `depthNode`, then the hardware mesh drawn over it with `autoClear` off
 * - Visibility-buffer shading: the resolve pass recomputes barycentrics, perspective
 *   correction and analytic UV derivatives from two ids, because `dFdx` would sample
 *   neighbouring pixels belonging to different triangles
 * - Screen-sized storage that follows the drawing buffer — a `useLayoutEffect`
 *   reallocates the visibility buffers and disposes the pipelines that bound them
 *
 * DIVERGENCE from original
 * - No "Rendering N triangles" readout: the repo shell owns the titleblock, so the
 *   example never builds UI of its own.
 * - The six frustum-plane tests are unrolled in JS instead of a TSL `Loop`. The plane
 *   COUNT is compile-time data (the values stay live uniforms), and unrolling avoids
 *   the nested-loop naming that @types/three cannot express — see `namedLoop` in
 *   Rasterizer.tsx, which is still needed for the two dynamic loops.
 */
import { Suspense } from 'react';
import { NoToneMapping } from 'three/webgpu';
import { Canvas } from '@react-three/fiber/webgpu';

import { DemoHelpers } from '../../../utils/DemoHelpers';
import { Rasterizer } from './Rasterizer';

export default function ComputeRasterizer() {
  return (
    <Canvas
      // The original leaves the WebGPURenderer default (no tone mapping) — the resolve
      // pass writes final display colours, so ACES would only mute them.
      renderer={{ toneMapping: NoToneMapping }}
      camera={{ position: [0, 15, 50], fov: 50, near: 0.25, far: 1000000 }}>
      {/* Rasterizer suspends on the UV grid texture, its creator hooks first (B18). */}
      <Suspense fallback={null}>
        <Rasterizer />
      </Suspense>

      {/* Grid off: the teapot field is its own ground plane, 1600 units across. */}
      <DemoHelpers grid={false} target={[0, -1.5, 0]} />
    </Canvas>
  );
}

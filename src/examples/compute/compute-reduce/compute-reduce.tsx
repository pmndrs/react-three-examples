/**
 * compute-reduce
 * Six ways to sum 262,144 numbers on the GPU, two of them running side by side. Each
 * half runs its algorithm, shows the buffer as a shade grid, then flashes green or red
 * depending on whether the total came out right — once a second, forever.
 * Original: https://threejs.org/examples/#webgpu_compute_reduce
 *
 * DEMONSTRATES
 * - Six reduction strategies as compute-kernel sequences (reduceAlgorithms.ts):
 *   strided halving, a strided accumulate, a workgroup tree reduce in shared memory,
 *   a subgroup reduce, a vectorised subgroup version, and a deliberately wrong control
 * - The WebGPU primitives the fast ones need — `workgroupArray` shared memory,
 *   `workgroupBarrier()`, `subgroupAdd`, `subgroupSize`, `invocationLocalIndex`,
 *   `invocationSubgroupIndex`, `.uniformFlow()` and `countTrailingZeros` for strides
 *   derived from a subgroup size only known at runtime
 * - One graph, many dispatch sizes: Reduce 0 builds a single kernel and calls
 *   `.compute(n, [workgroupSize])` on it eighteen times at halving thread counts
 * - fiber's multi-canvas mode running the comparison: two `<Canvas>` roots sharing one
 *   WebGPU device, each with its own buffers, kernels and state machine
 * - The scheduler's `{ fps: 1 }` throttle standing in for the original's chained
 *   `setTimeout` — a run / validate / reset cycle that is still a normal frame job
 * - Repeated-instance rule: `<ReduceDisplay>` renders twice and takes its algorithm
 *   and display mode as DATA, so the four knobs stay one leva panel
 *
 * DIVERGENCE from original
 * - The bottom explainer panel (16 CSS thread boxes that animate a subgroup reduction
 *   on hover) and the per-side `Ran in Nms` readouts are dropped: both are DOM
 *   apparatus around the demo, and the repo shell owns that part of the page.
 *   `trackTimestamp` goes with them.
 * - So does the Debug folder — `ReadbackBuffer` console dumps and the two disabled
 *   state fields. The readback pattern it demonstrates is `multiple-rendertargets-readback`.
 * - `.setPBO(true)` on every buffer is dropped: it only matters to the WebGL fallback,
 *   and this port is WebGPU-only.
 */
import { Canvas } from '@react-three/fiber/webgpu';
import { useControls } from 'leva';

import { DemoHelpers } from '../../../utils/DemoHelpers';
import { DISPLAY_MODES, PlaneFraming, ReduceDisplay, type DisplayMode } from './ReduceDisplay';
import { ALGORITHMS, type AlgorithmName } from './reduceAlgorithms';

export default function ComputeReduce() {
  // One panel for both sides. The two displays are the SAME component rendered twice,
  // so per AGENTS.md they take data, not a leva folder each — a per-instance folder
  // would need a dynamic key.
  const { leftAlgorithm, rightAlgorithm, leftDisplay, rightDisplay } = useControls('compute-reduce', {
    leftAlgorithm: { value: 'Reduce 0 (N/2)' as AlgorithmName, options: [...ALGORITHMS] },
    rightAlgorithm: { value: 'Reduce 4 (Subgroup Optimized)' as AlgorithmName, options: [...ALGORITHMS] },
    leftDisplay: { value: 'Input Log2' as DisplayMode, options: [...DISPLAY_MODES] },
    rightDisplay: { value: 'Input Element 0' as DisplayMode, options: [...DISPLAY_MODES] },
  });

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
      <div style={{ width: '50%', height: '100%' }}>
        <Canvas id="main" orthographic background="#313131" camera={{ position: [0, 0, 1], near: 0, far: 2 }}>
          <PlaneFraming />
          <ReduceDisplay side="left" algorithm={leftAlgorithm} displayMode={leftDisplay} />
          {/* Readiness signal on the first canvas only — the smoke tier and the
              screenshot both look at `canvas().first()` (AGENTS.md multi-canvas). */}
          <DemoHelpers grid={false} controls={false} />
        </Canvas>
      </div>
      <div style={{ width: '50%', height: '100%' }}>
        {/* Secondary root: shares the primary's WebGPU device. */}
        <Canvas
          renderer={{ primaryCanvas: 'main' }}
          orthographic
          background="#212121"
          camera={{ position: [0, 0, 1], near: 0, far: 2 }}>
          <PlaneFraming />
          <ReduceDisplay side="right" algorithm={rightAlgorithm} displayMode={rightDisplay} />
        </Canvas>
      </div>
    </div>
  );
}

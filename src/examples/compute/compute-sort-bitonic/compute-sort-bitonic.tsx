/**
 * compute-sort-bitonic
 * A bitonic sort of 16,384 values, stepped one comparison pass at a time so you can
 * watch the network fold. The left half uses three's `BitonicSort`, which keeps most
 * passes inside workgroup memory; the right half forces every swap through global
 * storage buffers.
 * Original: https://threejs.org/examples/#webgpu_compute_sort_bitonic
 *
 * DEMONSTRATES
 * - three's `BitonicSort` GPGPU module driven from React: constructed once over a
 *   storage buffer and advanced a step per tick with `computeStep(renderer)`
 * - The same network hand-written next to it (GlobalSort.tsx): a flip/disperse kernel
 *   pair using `getBitonicFlipIndices`/`getBitonicDisperseIndices`, a temp buffer so
 *   no thread reads a value another has overwritten, and a copy-back pass — the cost
 *   the workgroup-local version avoids
 * - A state machine that lives ON the GPU: a three-uint info buffer holds the next
 *   step type and compare span, one single-thread kernel advances it, and the display
 *   graph reads the same buffer to colour the swap zones — the CPU only counts steps
 * - Two views of one buffer: `storage(...)` and `storage(...).toReadOnly()` over the
 *   same attribute, so the material can sample what the kernels are writing
 * - fiber's multi-canvas mode for the side-by-side, with a per-side store SCOPE —
 *   `useBuffers`/`useNodes` resolve against the PRIMARY canvas, so a shared scope
 *   would make the two sorts fight over one buffer
 * - Frame-loop scheduling instead of chained `setTimeout`: one step per 100ms with a
 *   one-second hold on the finished sort, from `state.elapsed`
 *
 * DIVERGENCE from original
 * - The two colour-key legends in the page header are dropped — the repo shell owns
 *   that area, and the colours are legible from the display itself.
 * - `.setPBO(true)` on every buffer is dropped: it only matters to the WebGL fallback,
 *   and this port is WebGPU-only.
 */
import { Canvas } from '@react-three/fiber/webgpu';
import { useControls } from 'leva';

import { DemoHelpers } from '../../../utils/DemoHelpers';
import { GlobalSort } from './GlobalSort';
import { LocalSort } from './LocalSort';

export default function ComputeSortBitonic() {
  // One knob for both halves, so it lives at their shared parent and goes down as data
  // (the two sorts are siblings, and a leva folder each would need a dynamic key).
  const { displayMode } = useControls('compute-sort-bitonic', {
    displayMode: { value: 'Swap Zone Highlight', options: ['Elements', 'Swap Zone Highlight'] },
  });
  const highlight = displayMode === 'Swap Zone Highlight';

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
      <div style={{ width: '50%', height: '100%' }}>
        <Canvas id="main" orthographic background="#313131" camera={{ position: [0, 0, 1], near: 0, far: 2 }}>
          <LocalSort highlight={highlight} />
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
          <GlobalSort highlight={highlight} />
        </Canvas>
      </div>
    </div>
  );
}

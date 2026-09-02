// Left half: the sort three ships. `BitonicSort` keeps as much of the work as it can
// inside workgroup-local memory, only falling out to global storage-buffer swaps when
// a compare span is wider than a workgroup — so most steps never touch global memory.
import { useRef } from 'react';
import { Fn, instanceIndex, storage } from 'three/tsl';
import { BitonicSort } from 'three/addons/gpgpu/BitonicSort.js';
import { StorageInstancedBufferAttribute } from 'three/webgpu';
import { useBuffers, useFrame, useLocalNodes, useThree, useUniforms } from '@react-three/fiber/webgpu';

import { createSortDisplayNode, PlaneFraming, shuffledIndices, SIZE, StepType } from './sortDisplay';

/** Step cadence, and the pause once a full sort has finished (original values). */
const STEP_SECONDS = 0.1;
const FINISHED_PAUSE_SECONDS = 1;

export interface LocalSortProps {
  /** leva's display mode, as data — this component is one of two siblings. */
  highlight: boolean;
}

export function LocalSort({ highlight }: LocalSortProps) {
  const renderer = useThree((state) => state.renderer);

  const { uHighlight } = useUniforms({ uHighlight: highlight ? 1 : 0 }, 'bitonicLocal');

  // Scoped per side: fiber resolves these stores against the PRIMARY canvas, so two
  // canvases would otherwise share one set of buffers.
  const { elements, shuffled } = useBuffers(() => {
    const data = shuffledIndices();
    return {
      elements: storage(new StorageInstancedBufferAttribute(data, 1), 'uint', SIZE),
      // Keeps the starting order so a finished sort can be replayed.
      shuffled: storage(new StorageInstancedBufferAttribute(SIZE, 1), 'uint', SIZE),
    };
  }, 'bitonicLocal');

  // useLocalNodes rather than useNodes: BitonicSort is a module object, not a node, and
  // the display graph has to be built from the SAME instance the frame loop steps.
  const { sort, colorNode, saveShuffled, restoreShuffled } = useLocalNodes(() => {
    const sort = new BitonicSort(renderer, elements, { workgroupSize: 64 });

    return {
      sort,
      // The module publishes its own state: element 0 is the step type, element 1 the
      // current compare span. The display reads them straight out of the buffer.
      colorNode: createSortDisplayNode({
        elements,
        stepType: sort.infoStorage.element(0),
        blockHeight: sort.infoStorage.element(1),
        quietStep: StepType.SWAP_LOCAL,
        highlight: uHighlight,
      }),
      saveShuffled: Fn(() => {
        shuffled.element(instanceIndex).assign(elements.element(instanceIndex));
      })().compute(SIZE),
      restoreShuffled: Fn(() => {
        elements.element(instanceIndex).assign(shuffled.element(instanceIndex));
      })().compute(SIZE),
    };
  });

  // ONE STEP AT A TIME so the sort is watchable. Idempotent: the copy runs once and
  // survives StrictMode's double effect.
  const stateRef = useRef({ step: 0, nextAt: 0, saved: false });

  useFrame(
    ({ elapsed }) => {
      const state = stateRef.current;
      if (!state.saved) {
        renderer.compute(saveShuffled);
        state.saved = true;
      }
      if (elapsed < state.nextAt) return;

      if (state.step < sort.stepCount) {
        sort.computeStep(renderer);
        state.step += 1;
      } else {
        renderer.compute(restoreShuffled);
        state.step = 0;
      }

      // Hold the finished sort on screen for a beat before starting over.
      state.nextAt = elapsed + (state.step === sort.stepCount ? FINISHED_PAUSE_SECONDS : STEP_SECONDS);
    },
    { phase: 'update' },
  );

  return (
    <>
      <PlaneFraming />
      <mesh>
        <planeGeometry args={[1, 1]} />
        <meshBasicNodeMaterial colorNode={colorNode} />
      </mesh>
    </>
  );
}

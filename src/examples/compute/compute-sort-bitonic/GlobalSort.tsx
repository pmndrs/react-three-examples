// Right half: the same bitonic sort with every swap forced through global storage —
// no workgroup-local shortcut. It is the useful comparison: the network is identical,
// but each step is a full round trip through a temp buffer, and the state machine that
// picks the next step lives on the GPU too, in a three-uint info buffer.
import { useRef } from 'react';
import { Fn, If, instanceIndex, storage, uint } from 'three/tsl';
import { getBitonicDisperseIndices, getBitonicFlipIndices } from 'three/addons/gpgpu/BitonicSort.js';
import { StorageInstancedBufferAttribute, type Node } from 'three/webgpu';
import { useBuffers, useFrame, useLocalNodes, useNodes, useThree, useUniforms } from '@react-three/fiber/webgpu';

import { createSortDisplayNode, MAX_STEPS, PlaneFraming, shuffledIndices, SIZE, StepType } from './sortDisplay';

const STEP_SECONDS = 0.1;
const FINISHED_PAUSE_SECONDS = 1;

/** Info buffer layout: [ next step type, unused, widest block reached ]. */
const INFO_INITIAL = new Uint32Array([StepType.FLIP_GLOBAL, 2, 2]);

export interface GlobalSortProps {
  highlight: boolean;
}

export function GlobalSort({ highlight }: GlobalSortProps) {
  const renderer = useThree((state) => state.renderer);

  const { uHighlight } = useUniforms({ uHighlight: highlight ? 1 : 0 }, 'bitonicGlobal');

  const { elements, temp, shuffled, info, blockHeight, blockHeightRead } = useBuffers(() => {
    const data = shuffledIndices();
    const blockHeightAttribute = new StorageInstancedBufferAttribute(new Uint32Array([2]), 1);
    return {
      elements: storage(new StorageInstancedBufferAttribute(data, 1), 'uint', SIZE),
      // Every global swap writes here and is copied back, so a thread never reads a
      // value another thread has already overwritten.
      temp: storage(new StorageInstancedBufferAttribute(data, 1), 'uint', SIZE),
      shuffled: storage(new StorageInstancedBufferAttribute(SIZE, 1), 'uint', SIZE),
      info: storage(new StorageInstancedBufferAttribute(INFO_INITIAL, 1), 'uint', INFO_INITIAL.length),
      blockHeight: storage(blockHeightAttribute, 'uint', 1),
      // A second, read-only view: the display samples it while the kernels write it.
      blockHeightRead: storage(blockHeightAttribute, 'uint', 1).toReadOnly(),
    };
  }, 'bitonicGlobal');

  const { bitonicStep, setNextStep, alignCurrent, saveShuffled, restoreShuffled, resetAlgo } = useNodes(() => {
    // One comparison, written into the temp buffer either way — branchless from the
    // buffer's point of view, so no thread races another's read.
    const compareAndSwap = (before: Node<'uint'>, after: Node<'uint'>) => {
      If(elements.element(after).lessThan(elements.element(before)), () => {
        temp.element(before).assign(elements.element(after));
        temp.element(after).assign(elements.element(before));
      }).Else(() => {
        temp.element(before).assign(elements.element(before));
        temp.element(after).assign(elements.element(after));
      });
    };

    return {
      // One step of the sorting network. Which step it is comes out of the info
      // buffer, so the CPU never needs to know where the sort has got to.
      bitonicStep: Fn(() => {
        const span = blockHeight.element(0).toVar();
        const nextAlgo = info.element(0).toVar();

        If(nextAlgo.equal(uint(StepType.FLIP_GLOBAL)), () => {
          const indices = getBitonicFlipIndices(instanceIndex, span);
          compareAndSwap(indices.x, indices.y);
        }).ElseIf(nextAlgo.equal(uint(StepType.DISPERSE_GLOBAL)), () => {
          const indices = getBitonicDisperseIndices(instanceIndex, span);
          compareAndSwap(indices.x, indices.y);
        });
      })().compute(SIZE / 2),

      // Advance the network: halve the compare span, and when it bottoms out, start
      // the next (twice as wide) flip — or stop, once a block spans everything.
      setNextStep: Fn(() => {
        const span = blockHeight.element(0).toVar();
        const nextAlgo = info.element(0);
        const widestBlock = info.element(2).toVar();

        span.divAssign(2);

        If(span.equal(1), () => {
          widestBlock.mulAssign(2);

          If(widestBlock.equal(SIZE * 2), () => {
            nextAlgo.assign(StepType.NONE);
            span.assign(0);
          }).Else(() => {
            nextAlgo.assign(StepType.FLIP_GLOBAL);
            span.assign(widestBlock);
          });
        }).Else(() => {
          nextAlgo.assign(StepType.DISPERSE_GLOBAL);
        });

        blockHeight.element(0).assign(span);
        info.element(2).assign(widestBlock);
      })().compute(1),

      // Global swaps write to temp, so the data buffer has to be re-aligned after
      // every step — the cost the local sort avoids.
      alignCurrent: Fn(() => {
        elements.element(instanceIndex).assign(temp.element(instanceIndex));
      })().compute(SIZE),

      saveShuffled: Fn(() => {
        shuffled.element(instanceIndex).assign(elements.element(instanceIndex));
      })().compute(SIZE),
      restoreShuffled: Fn(() => {
        elements.element(instanceIndex).assign(shuffled.element(instanceIndex));
      })().compute(SIZE),
      resetAlgo: Fn(() => {
        info.element(0).assign(StepType.FLIP_GLOBAL);
        info.element(2).assign(2);
        blockHeight.element(0).assign(2);
      })().compute(1),
    };
  }, 'bitonicGlobal');

  const { colorNode } = useLocalNodes(() => ({
    colorNode: createSortDisplayNode({
      elements,
      stepType: info.element(0),
      blockHeight: blockHeightRead.element(0),
      // This side idles on NONE rather than on a local swap, so that is the step that
      // draws no overlay.
      quietStep: StepType.NONE,
      highlight: uHighlight,
    }),
  }));

  const stateRef = useRef({ step: 0, nextAt: 0, saved: false });

  useFrame(
    ({ elapsed }) => {
      const state = stateRef.current;
      if (!state.saved) {
        renderer.compute(saveShuffled);
        state.saved = true;
      }
      if (elapsed < state.nextAt) return;

      if (state.step !== MAX_STEPS) {
        renderer.compute(bitonicStep);
        renderer.compute(alignCurrent);
        renderer.compute(setNextStep);
        state.step += 1;
      } else {
        renderer.compute(restoreShuffled);
        renderer.compute(resetAlgo);
        state.step = 0;
      }

      state.nextAt = elapsed + (state.step === MAX_STEPS ? FINISHED_PAUSE_SECONDS : STEP_SECONDS);
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

// One side of the comparison: its own copy of the data, the full set of reduction
// kernels built over it, the four ways of visualising the buffer, and the one-second
// run / validate / reset cycle. Rendered twice — once per canvas — so it takes the
// chosen algorithm and display mode as DATA, not as its own leva folder.
import { useEffect, useLayoutEffect, useRef } from 'react';
import {
  float,
  floor,
  Fn,
  If,
  instancedArray,
  instanceIndex,
  storage,
  uint,
  uniform,
  uv,
  uvec2,
  vec2,
  vec3,
} from 'three/tsl';
import {
  StorageInstancedBufferAttribute,
  type MeshBasicNodeMaterial,
  type Node,
  type OrthographicCamera,
} from 'three/webgpu';
import { useBuffers, useFrame, useLocalNodes, useNodes, useThree } from '@react-three/fiber/webgpu';

import { type AlgorithmName, buildAlgorithms, NUM_ROWS, REDUCE_SIZE, VEC_SIZE } from './reduceAlgorithms';

export const DISPLAY_MODES = ['Input Grid', 'Input Log2', 'Input Element 0', 'Workgroup Sum Grid'] as const;
export type DisplayMode = (typeof DISPLAY_MODES)[number];

/** The input laid out as a square. */
const GRID_DIM = Math.sqrt(REDUCE_SIZE);
/** The workgroup-sums buffer laid out as a rectangle. */
const SUM_GRID_WIDTH = 8;
const SUM_GRID_HEIGHT = 16;

/** Fallback if the device limit can't be read — the original's starting value. */
const DEFAULT_MAX_WORKGROUP_SIZE = 64;

// The cycle each side walks, one step per second.
const STEPS = ['run', 'validate', 'reset'] as const;
type Step = (typeof STEPS)[number];

export interface ReduceDisplayProps {
  /**
   * Which half this is. Also picks the store SCOPE, and that part is load-bearing:
   * fiber's `useBuffers`/`useNodes` resolve against the PRIMARY canvas's store
   * (`usePrimaryStore`), so in multi-canvas mode the two sides would otherwise share
   * one set of buffers and reduce each other's data.
   */
  side: 'left' | 'right';
  algorithm: AlgorithmName;
  displayMode: DisplayMode;
}

//* Framing ========================================================

// The original builds an OrthographicCamera with a frustum two world units tall, so a
// 1x1 plane fills half the height. fiber sizes an orthographic frustum in PIXELS, so
// the equivalent is a zoom (materials-displacementmap / compute-points pattern).
export function PlaneFraming() {
  // useThree's `camera` types as the base Camera union even on an `orthographic`
  // Canvas — the cast is safe because this only mounts under one.
  const camera = useThree((state) => state.camera) as OrthographicCamera;
  const size = useThree((state) => state.size);

  useLayoutEffect(() => {
    camera.zoom = size.height / 2;
    camera.updateProjectionMatrix();
  }, [camera, size]);

  return null;
}

//* One side ========================================================

export function ReduceDisplay({ side, algorithm, displayMode }: ReduceDisplayProps) {
  const renderer = useThree((state) => state.renderer);
  const scope = side === 'left' ? 'reduceLeft' : 'reduceRight';

  //* GPU State ====================================================
  const { inputStorage, inputVectorized, workgroupSums } = useBuffers(() => {
    const ones = new Uint32Array(REDUCE_SIZE).fill(1);
    return {
      inputStorage: instancedArray(ones, 'uint'),
      // The same values as uvec4s. A SECOND buffer over the same seed data, not an
      // alias — which is why Reduce 4 always starts from a pristine copy.
      inputVectorized: storage(new StorageInstancedBufferAttribute(ones, 4), 'uvec4', VEC_SIZE),
      workgroupSums: instancedArray(new Uint32Array(NUM_ROWS), 'uint'),
    };
  }, scope);

  const { uThreadsDispatched, uHighlight, resetInput, resetWorkgroupSums } = useNodes(
    () => ({
      // Reduce 0 halves this between dispatches, and the validate step flips the
      // highlight — both written from the frame loop, so plain TSL uniforms.
      uThreadsDispatched: uniform(REDUCE_SIZE / 2, 'uint'),
      uHighlight: uniform(0),

      resetInput: Fn(() => {
        inputStorage.element(instanceIndex).assign(1);
      })().compute(REDUCE_SIZE),
      resetWorkgroupSums: Fn(() => {
        workgroupSums.element(instanceIndex).assign(0);
      })().compute(NUM_ROWS),
    }),
    scope,
  );

  //* Algorithms + display graphs ==================================
  // useLocalNodes rather than useNodes: the value here is a KEYED SET of kernel
  // arrays, which the node store cannot hold. It is still create-once (a useMemo) and,
  // being store-free, it is the safe creator on either side of a suspension.
  const { algorithms, displayNodes } = useLocalNodes(() => {
    // The original has to dispatch a throwaway kernel before it can read this; fiber
    // awaits renderer.init() before children render, so the device is already up.
    // Cast: `renderer.backend` types as the abstract Backend, which has no `device`.
    const backend = renderer.backend as { device?: { limits: { maxComputeWorkgroupSizeX: number } } | null };
    const maxWorkgroupSize = backend.device?.limits.maxComputeWorkgroupSizeX ?? DEFAULT_MAX_WORKGROUP_SIZE;

    // Darker = larger value. During the validate step the whole display turns green if
    // element 0 holds the expected total, red if it doesn't.
    const shadeFor = (value: Node<'float'>, elementCount: number) => {
      const shade = value.div(elementCount).oneMinus();
      const color = vec3(shade).toVar();

      If(uHighlight.equal(1), () => {
        If(inputStorage.element(0).equal(REDUCE_SIZE), () => {
          color.assign(vec3(0, shade, 0));
        }).Else(() => {
          color.assign(vec3(shade, 0, 0));
        });
      });

      return color;
    };

    const gridIndex = (width: number, height: number) => {
      const gridUv = uv().mul(vec2(width, height));
      const pixel = uvec2(uint(floor(gridUv.x)), uint(floor(gridUv.y)));
      return uint(width).mul(pixel.y).add(pixel.x);
    };

    const displayNodes: Record<DisplayMode, Node<'vec3'>> = {
      // Every element, as a square.
      'Input Grid': Fn(() => shadeFor(float(inputStorage.element(gridIndex(GRID_DIM, GRID_DIM))), REDUCE_SIZE))(),

      // Only the logarithmic indices (1, 2, 4, … 262144) across the width — the ones
      // the halving reduction actually touches.
      'Input Log2': Fn(() => {
        const index = uint(1).shiftLeft(uint(uv().x.mul(Math.log2(REDUCE_SIZE))));
        return shadeFor(float(inputStorage.element(index)), REDUCE_SIZE);
      })(),

      // The answer: element 0 alone, clamped so a correct total is still readable.
      'Input Element 0': Fn(() => shadeFor(float(inputStorage.element(0)).clamp(0, REDUCE_SIZE / 2), REDUCE_SIZE))(),

      // The per-workgroup partial sums the two-stage algorithms write.
      'Workgroup Sum Grid': Fn(() =>
        shadeFor(
          float(workgroupSums.element(gridIndex(SUM_GRID_WIDTH, SUM_GRID_HEIGHT))),
          SUM_GRID_WIDTH * SUM_GRID_HEIGHT,
        ),
      )(),
    };

    return {
      algorithms: buildAlgorithms({
        inputStorage,
        inputVectorized,
        workgroupSums,
        maxWorkgroupSize,
        uThreadsDispatched,
      }),
      displayNodes,
    };
  });

  // Swapping colorNode re-keys the pipeline, which the property write alone doesn't do.
  const materialRef = useRef<MeshBasicNodeMaterial>(null);
  useEffect(() => {
    if (materialRef.current) materialRef.current.needsUpdate = true;
  }, [displayMode]);

  //* Frame =========================================================
  // ONE STEP PER SECOND, via the scheduler's fps throttle rather than the original's
  // chained setTimeout. Compute dispatches, so phase 'update' — the plane is still
  // drawn by the default render phase every frame.
  const stepRef = useRef<Step>('run');
  useFrame(
    () => {
      const step = stepRef.current;

      if (step === 'reset') {
        renderer.compute(resetInput);
        renderer.compute(resetWorkgroupSums);
      } else if (step === 'run') {
        const calls = algorithms[algorithm];
        // Reduce 0 dispatches the same kernel at halving thread counts, so the count
        // it reads has to move with it.
        let threads = REDUCE_SIZE / 2;
        for (const call of calls) {
          uThreadsDispatched.value = threads;
          threads /= 2;
          renderer.compute(call);
        }
      }

      // Highlight only while the result is being validated.
      uHighlight.value = step === 'run' ? 1 : 0;
      stepRef.current = STEPS[(STEPS.indexOf(step) + 1) % STEPS.length];
    },
    { phase: 'update', fps: 1 },
  );

  return (
    <mesh>
      <planeGeometry args={[1, 1]} />
      <meshBasicNodeMaterial ref={materialRef} colorNode={displayNodes[displayMode]} />
    </mesh>
  );
}

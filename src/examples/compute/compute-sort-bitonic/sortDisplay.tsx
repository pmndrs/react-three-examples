// Shared between the two halves: the data both sides sort, the grid display graph, and
// the orthographic framing. The display is the whole visualisation — value as shade,
// plus a two-tone overlay showing which halves of each block the current step is
// comparing.
import { useLayoutEffect } from 'react';
import { abs, float, floor, Fn, If, int, not, uint, uv, uvec2, vec2, vec3 } from 'three/tsl';
import type { Node, OrthographicCamera, StorageBufferNode } from 'three/webgpu';
import { useThree } from '@react-three/fiber/webgpu';

/** Elements sorted, laid out as a square for display. */
export const SIZE = 16384;
export const GRID_DIM = Math.sqrt(SIZE);

/** What the current step is doing — written into a storage buffer by the sort itself. */
export const StepType = {
  NONE: 0,
  /** Swap values within workgroup-local arrays. */
  SWAP_LOCAL: 1,
  DISPERSE_LOCAL: 2,
  /** Swap values across the whole storage buffer. */
  FLIP_GLOBAL: 3,
  DISPERSE_GLOBAL: 4,
} as const;

/** Steps in a full bitonic sort of SIZE elements: n(n+1)/2 for n = log2(SIZE). */
const n = Math.log2(SIZE);
export const MAX_STEPS = (n * (n + 1)) / 2;

/** 0..SIZE-1, shuffled — the unsorted starting state. */
export function shuffledIndices(): Uint32Array {
  const array = new Uint32Array(SIZE);
  for (let i = 0; i < SIZE; i++) array[i] = i;
  for (let i = SIZE - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export interface SortDisplayProps {
  /** The live data buffer. */
  elements: StorageBufferNode<'uint'>;
  /** Element 0 of the sort's info buffer: which step type is about to run. */
  stepType: Node<'uint'>;
  /** How wide a block the current step compares across. */
  blockHeight: Node<'uint'>;
  /** The one step type that draws no overlay — different on each side. */
  quietStep: number;
  /** leva's display-mode switch, as a uniform. */
  highlight: Node<'float'>;
}

/**
 * value -> shade, plus the swap-zone overlay: the two halves of every block get
 * different channels, and blue marks a workgroup-local step rather than a global one.
 */
export function createSortDisplayNode({ elements, stepType, blockHeight, quietStep, highlight }: SortDisplayProps) {
  return Fn(() => {
    const gridUv = uv().mul(vec2(GRID_DIM, GRID_DIM));
    const pixel = uvec2(uint(floor(gridUv.x)), uint(floor(gridUv.y)));
    const elementIndex = uint(GRID_DIM).mul(pixel.y).add(pixel.x);

    // Darker = larger value, so a finished sort reads as a smooth gradient.
    const color = vec3(float(elements.element(elementIndex)).div(SIZE).oneMinus()).toVar();

    If(highlight.equal(1).and(not(stepType.equal(quietStep))), () => {
      // Which half of its block this element sits in — the two halves are what the
      // current step compares against each other.
      const lowerHalf = int(elementIndex.mod(blockHeight).lessThan(blockHeight.div(2)));
      color.z.assign(stepType.lessThanEqual(StepType.DISPERSE_LOCAL));
      color.x.mulAssign(lowerHalf);
      color.y.mulAssign(abs(lowerHalf.sub(1)));
    });

    return color;
  })();
}

/**
 * The original builds an OrthographicCamera with a frustum two world units tall, so a
 * 1x1 plane fills half the height. fiber sizes an orthographic frustum in PIXELS, so
 * the equivalent is a zoom (materials-displacementmap / compute-points pattern).
 */
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

// The six reduction strategies, each built as the sequence of compute kernels it needs
// to collapse `REDUCE_SIZE` uints down to one. Pure graph construction — the display
// component owns the buffers, the uniforms and the dispatch order.
//
// They get progressively cleverer: strided halving, a strided accumulate, a workgroup
// tree reduce in shared memory, a subgroup reduce, and finally a vectorised subgroup
// version. The last entry is deliberately wrong, as a control.
import {
  dot,
  float,
  Fn,
  If,
  instanceIndex,
  invocationLocalIndex,
  invocationSubgroupIndex,
  Loop,
  countTrailingZeros,
  select,
  subgroupAdd,
  subgroupSize,
  uint,
  uvec4,
  workgroupArray,
  workgroupBarrier,
  workgroupId,
} from 'three/tsl';
import type { ComputeNode, Node, StorageBufferNode } from 'three/webgpu';

/** Elements reduced, and the value a correct algorithm has to land on. */
export const REDUCE_SIZE = 262144;
/** The same data seen as uvec4s. */
export const VEC_SIZE = REDUCE_SIZE / 4;
/** Rows the two-stage algorithms split the input into — one partial sum each. */
export const NUM_ROWS = 128;

export const ALGORITHMS = [
  'Reduce 0 (N/2)',
  'Reduce 1 (Naive Accumulate)',
  'Reduce 2 (Workgroup Reduction)',
  'Reduce 3 (Subgroup Reduce)',
  'Reduce 4 (Subgroup Optimized)',
  'Incorrect Baseline',
] as const;

export type AlgorithmName = (typeof ALGORITHMS)[number];

const divRoundUp = (size: number, partSize: number) => Math.floor((size + partSize - 1) / partSize);
/** Smallest power of two >= x. The original computes this in a TSL function with an
 * explicit layout, but every call site passes a compile-time workgroup size. */
const pow2Ceil = (x: number) => 2 ** Math.ceil(Math.log2(x));

//* Typed-TSL gaps ================================================
// @types/three declares these as bare `Node`/`WorkgroupInfoNode`, which carry none of
// the fluent surface the graph below needs. Each cast adds the type information the
// runtime already has — AGENTS.md B10/B11 family.

/** `Loop( <bool node> )` — the while form, which the typed Loop overloads omit. */
const whileLoop = (condition: Node<'bool'>, body: () => void) =>
  (Loop as unknown as (c: Node<'bool'>, b: () => void) => void)(condition, body);

/** Sum one value across every invocation in the subgroup. */
const subgroupSum = (value: Node<'uint'>) => subgroupAdd(value) as Node<'uint'>;

/** `dot` on uint vectors — typed TSL only covers float vectors, WGSL covers both. */
const uintDot = (a: Node<'uvec4'>, b: Node<'uvec4'>) =>
  (dot as unknown as (x: Node<'uvec4'>, y: Node<'uvec4'>) => Node<'uint'>)(a, b);

/** log2 of a power of two, on the GPU. */
const trailingZeros = (value: Node<'uint'>) => countTrailingZeros(value) as unknown as Node<'uint'>;

/** Workgroup-shared scratch array of uints. */
const sharedUints = (count: number) =>
  workgroupArray('uint', count) as unknown as {
    element: (index: Node<'uint'> | number) => Node<'uint'>;
  };

export interface ReduceBuffers {
  /** The live data: `REDUCE_SIZE` uints, all 1 at the start of every run. */
  inputStorage: StorageBufferNode<'uint'>;
  /** The SAME memory seen as uvec4s, for the vectorised algorithm. */
  inputVectorized: StorageBufferNode<'uvec4'>;
  /** One partial sum per workgroup, for the two-stage algorithms. */
  workgroupSums: StorageBufferNode<'uint'>;
}

export interface ReduceAlgorithmProps extends ReduceBuffers {
  /** Device limit, read once — the widest workgroup this GPU allows. */
  maxWorkgroupSize: number;
  /** Reduce 0 halves this between dispatches; the runner writes it. */
  uThreadsDispatched: Node<'uint'>;
}

//* Reduce 1 ======================================================
// Every thread strides through the buffer by the dispatch size, accumulating into its
// own slot; three passes shrink 262144 -> dispatchSize -> workgroupSize -> 1.
const createReduce1 = (
  inputStorage: StorageBufferNode<'uint'>,
  dispatchSize: number,
  numElements: number,
  workgroupSize: number,
) =>
  Fn(() => {
    const total = uint(0).toVar();
    const k = instanceIndex.toVar();

    whileLoop(k.lessThan(uint(numElements)), () => {
      total.addAssign(inputStorage.element(k));
      k.addAssign(uint(dispatchSize));
    });

    inputStorage.element(instanceIndex).assign(total);
  })().compute(dispatchSize, [workgroupSize]);

//* Reduce 2 ======================================================
// Same strided accumulate, but each workgroup then tree-reduces in SHARED memory and
// writes one value per workgroup — an order of magnitude fewer global writes.
const createReduce2 = (
  inputStorage: StorageBufferNode<'uint'>,
  dispatchSize: number,
  numElements: number,
  workgroupSize: number,
) =>
  Fn(() => {
    const totals = sharedUints(workgroupSize);

    const k = instanceIndex.toVar();
    totals.element(invocationLocalIndex).assign(uint(0));

    whileLoop(k.lessThan(uint(numElements)), () => {
      totals.element(invocationLocalIndex).addAssign(inputStorage.element(k));
      k.addAssign(uint(dispatchSize));
    });

    workgroupBarrier();

    // Halving tree over shared memory. The stride starts at the next power of two so a
    // non-power-of-two workgroup count still folds cleanly.
    k.assign(uint(pow2Ceil(workgroupSize) / 2));
    whileLoop(k.greaterThan(0), () => {
      If(invocationLocalIndex.lessThan(k).and(invocationLocalIndex.add(k).lessThan(workgroupSize)), () => {
        totals.element(invocationLocalIndex).addAssign(totals.element(invocationLocalIndex.add(k)));
      });
      workgroupBarrier();
      k.divAssign(2);
    });

    If(invocationLocalIndex.equal(uint(0)), () => {
      inputStorage.element(workgroupId.x).assign(totals.element(uint(0)));
    });
  })().compute(dispatchSize, [workgroupSize]);

//* Reduce 3 ======================================================
// One workgroup per ROW of the input. Each thread walks its row in blocks, then the
// workgroup folds the per-thread totals with subgroup adds instead of shared memory.

/** Per-thread accumulation over one row, in workgroup-sized blocks. */
const rowReduce = (
  inputStorage: StorageBufferNode<'uint'>,
  total: Node<'uint'>,
  rowOffset: Node<'uint'>,
  currentRowSize: Node<'uint'>,
  workgroupSize: number,
  workPerThread: number,
) => {
  const blockSize = uint(workgroupSize).mul(workPerThread);
  const block = uint(0).toVar();
  const blockLimit = currentRowSize.div(blockSize).toVar();

  whileLoop(block.lessThan(blockLimit), () => {
    const startThread = block.mul(blockSize).add(invocationLocalIndex.mul(workPerThread));
    const threadOffset = uint(0).toVar();

    whileLoop(threadOffset.lessThan(uint(workPerThread)), () => {
      total.addAssign(inputStorage.element(rowOffset.add(startThread).add(threadOffset)));
      threadOffset.addAssign(1);
    });

    block.addAssign(1);
  });
  // The leftover check is skipped: rowSize is a multiple of blockSize by construction.
};

/** Fold one value per thread down to one value per workgroup, subgroup by subgroup. */
const workgroupReduce = (total: Node<'uint'>, workgroupSize: number) => {
  // Worst-case subgroup size is 4, so this is the largest spine the workgroup can need.
  const subgroupSums = sharedUints(workgroupSize / 4);

  total.assign(subgroupSum(total));

  const delta = uint(workgroupSize).div(subgroupSize).toVar();
  const subgroupRank = invocationLocalIndex.div(subgroupSize);

  whileLoop(float(delta).greaterThan(1), () => {
    If(invocationSubgroupIndex.equal(0), () => {
      subgroupSums.element(subgroupRank).assign(total);
    });

    workgroupBarrier();

    // Fewer subgroups than threads in a subgroup, so one more subgroupAdd finishes the
    // level. uniformFlow() promises the compiler the select is subgroup-uniform.
    total.assign(
      select(invocationLocalIndex.lessThan(delta), subgroupSums.element(invocationLocalIndex), uint(0)).uniformFlow(),
    );
    total.assign(subgroupSum(total));

    delta.divAssign(subgroupSize);
  });
};

const createReduce3 = (
  inputStorage: StorageBufferNode<'uint'>,
  intermediateBuffer: StorageBufferNode<'uint'>,
  workgroupSize: number,
  workPerThread: number,
  rowSize: number,
) =>
  Fn(() => {
    const inputSize = uint(inputStorage.bufferCount);
    const rowOffset = workgroupId.x.mul(rowSize);

    // Last row may be short — clamp it rather than reading past the end.
    const currentRowSize = select(
      rowOffset.add(rowSize).greaterThan(inputSize),
      select(inputSize.greaterThan(rowOffset), inputSize.sub(rowOffset), uint(0)).uniformFlow(),
      uint(rowSize),
    ).uniformFlow();

    const total = uint(0).toVar();
    rowReduce(inputStorage, total, rowOffset, currentRowSize, workgroupSize, workPerThread);
    workgroupReduce(total, workgroupSize);

    If(invocationLocalIndex.equal(0), () => {
      intermediateBuffer.element(workgroupId.x).assign(total);
    });
  })();

//* Reduce 4 ======================================================
// The fast one: every thread reads uvec4s (four elements per load), sums them with a
// dot product, and the workgroup spine is folded with subgroup adds only.
const createReduce4 = (
  inputVectorized: StorageBufferNode<'uvec4'>,
  intermediateBuffer: StorageBufferNode<'uint'>,
  size: number,
  workgroupSize: number,
  workPerThread: number,
  maxWorkgroupSize: number,
) => {
  const ELEMENTS_PER_VEC4 = 4;
  const partitionSize = workgroupSize * workPerThread * ELEMENTS_PER_VEC4;
  const vecSize = divRoundUp(size, ELEMENTS_PER_VEC4);
  const numWorkgroups = divRoundUp(size, partitionSize);
  // No way to dispatch in whole workgroups, so convert to an invocation count.
  const numInvocations = numWorkgroups * workgroupSize;

  return Fn(() => {
    const perSubgroupSums = sharedUints(workgroupSize / 4);

    const subgroupRank = invocationLocalIndex.div(subgroupSize);
    // Each subgroup block scans `workPerThread` subgroups, so a new subgroup starts
    // that many subgroups further along.
    const subgroupOffset = subgroupRank.mul(subgroupSize).mul(workPerThread);
    subgroupOffset.addAssign(invocationSubgroupIndex);

    const workgroupOffset = workgroupId.x.mul(uint(maxWorkgroupSize).mul(workPerThread));
    const startThread = subgroupOffset.add(workgroupOffset);
    const subgroupReduction = uint(0);

    const scanRange = { start: uint(0), end: workPerThread, type: 'uint' as const, condition: '<' };

    If(workgroupId.x.lessThan(uint(numWorkgroups).sub(1)), () => {
      Loop(scanRange, () => {
        // Four elements summed by one dot product.
        subgroupReduction.addAssign(uintDot(uvec4(1), inputVectorized.element(startThread)));
        startThread.addAssign(subgroupSize);
      });
    });

    // The last workgroup is the only one that can run off the end of the buffer.
    If(workgroupId.x.equal(uint(numWorkgroups).sub(1)), () => {
      Loop(scanRange, () => {
        const value = select(
          startThread.lessThan(uint(vecSize)),
          inputVectorized.element(startThread),
          uvec4(0),
        ).uniformFlow();
        subgroupReduction.addAssign(uintDot(value, uvec4(1)));
        startThread.addAssign(subgroupSize);
      });
    });

    subgroupReduction.assign(subgroupSum(subgroupReduction));

    If(invocationSubgroupIndex.equal(uint(0)), () => {
      perSubgroupSums.element(subgroupRank).assign(subgroupReduction);
    });

    workgroupBarrier();

    // Fold the spine. The subgroup size is a RUNTIME value, so the strides are derived
    // on the GPU: countTrailingZeros of a power of two is its log2.
    // NAMED on purpose: the spine loop's `update` below is a raw WGSL string, so it
    // can only reference this variable by the name the generator emits.
    const subgroupSizeLog = trailingZeros(subgroupSize).toVar('subgroupSizeLog');
    const spineSize = uint(workgroupSize).shiftRight(subgroupSizeLog);
    const spineSizeLog = trailingZeros(spineSize).toVar();

    const squaredSubgroupLog = spineSizeLog.add(subgroupSizeLog).sub(1);
    squaredSubgroupLog.divAssign(subgroupSizeLog);
    squaredSubgroupLog.mulAssign(subgroupSizeLog);
    const alignedSize = uint(1).shiftLeft(squaredSubgroupLog).toVar();

    const offset = uint(0);

    // More subgroups than a subgroup can hold means another pass over the spine.
    Loop(
      { start: subgroupSize, end: alignedSize, condition: '<=', type: 'uint' as const, update: '<<= subgroupSizeLog' },
      () => {
        const subgroupIndex = invocationLocalIndex.add(1).shiftLeft(offset).sub(1);
        const isValid = subgroupIndex.lessThan(spineSize).toVar();

        // toVar so the subgroupAdd runs OUTSIDE the If — every thread has to reach it.
        const folded = subgroupSum(
          select(isValid, perSubgroupSums.element(subgroupIndex), uint(0)).uniformFlow(),
        ).toVar();

        If(isValid, () => {
          perSubgroupSums.element(subgroupIndex).assign(folded);
        });

        workgroupBarrier();
        offset.addAssign(subgroupSizeLog);
      },
    );

    If(invocationLocalIndex.equal(uint(0)), () => {
      intermediateBuffer.element(workgroupId.x).assign(perSubgroupSums.element(spineSize.sub(1)));
    });
  })().compute(numInvocations, [maxWorkgroupSize]);
};

//* The set ========================================================

export function buildAlgorithms({
  inputStorage,
  inputVectorized,
  workgroupSums,
  maxWorkgroupSize,
  uThreadsDispatched,
}: ReduceAlgorithmProps): Record<AlgorithmName, ComputeNode[]> {
  // Reduce 3/4 split the input into rows, one workgroup each.
  const workPerThread = 4;
  const rowSize = divRoundUp(REDUCE_SIZE, NUM_ROWS);

  // Reduce 0: fold the buffer in half, over and over. One graph, dispatched at halving
  // thread counts — log2(REDUCE_SIZE) passes of pure global memory traffic.
  const halveInPlace = Fn(() => {
    inputStorage.element(instanceIndex).addAssign(inputStorage.element(instanceIndex.add(uThreadsDispatched)));
  })();
  const reduce0: ComputeNode[] = [];
  for (let threads = REDUCE_SIZE / 2; threads >= 1; threads /= 2) {
    reduce0.push(halveInPlace.compute(threads, [maxWorkgroupSize]));
  }

  return {
    'Reduce 0 (N/2)': reduce0,
    'Reduce 1 (Naive Accumulate)': [
      createReduce1(inputStorage, maxWorkgroupSize * maxWorkgroupSize, REDUCE_SIZE, maxWorkgroupSize),
      createReduce1(inputStorage, maxWorkgroupSize, maxWorkgroupSize * maxWorkgroupSize, maxWorkgroupSize),
      createReduce1(inputStorage, 1, maxWorkgroupSize, 1),
    ],
    'Reduce 2 (Workgroup Reduction)': [
      createReduce2(inputStorage, maxWorkgroupSize * maxWorkgroupSize, REDUCE_SIZE, maxWorkgroupSize),
      createReduce2(inputStorage, maxWorkgroupSize, maxWorkgroupSize, maxWorkgroupSize),
    ],
    'Reduce 3 (Subgroup Reduce)': [
      createReduce3(inputStorage, workgroupSums, maxWorkgroupSize, workPerThread, rowSize).compute(
        maxWorkgroupSize * NUM_ROWS,
        [maxWorkgroupSize],
      ),
      createReduce3(workgroupSums, inputStorage, 32, workPerThread, rowSize).compute(32, [32]),
    ],
    'Reduce 4 (Subgroup Optimized)': [
      createReduce4(inputVectorized, workgroupSums, REDUCE_SIZE, maxWorkgroupSize, workPerThread, maxWorkgroupSize),
      createReduce3(workgroupSums, inputStorage, 32, workPerThread, rowSize).compute(32, [32]),
    ],
    // The control: writes a wrong answer everywhere, so the validation step goes red.
    'Incorrect Baseline': [
      Fn(() => {
        inputStorage.element(instanceIndex).assign(99999);
      })().compute(REDUCE_SIZE),
    ],
  };
}

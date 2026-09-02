// The five compute passes that fill the visibility buffer: clear it, cull and
// LOD-select every instance into a work queue, turn the queue length into an indirect
// dispatch size, scan-convert the queued meshlets, and write the hardware fallback's
// draw arguments. Pure graph construction, built once by the component's `useNodes`.
import {
  atomicAdd,
  atomicLoad,
  atomicMax,
  atomicStore,
  bool,
  cos,
  distance,
  dot,
  float,
  floor,
  Fn,
  If,
  instanceIndex,
  int,
  Loop,
  mat4,
  max,
  min,
  screenSize,
  sin,
  sqrt,
  storage,
  time,
  uint,
  uvec4,
  vec2,
  vec4,
} from 'three/tsl';
import type { IndirectStorageBufferAttribute, Node, StorageBufferNode, UniformArrayNode } from 'three/webgpu';

import { LOD_COUNT, type MegaMesh, TRIANGLES_PER_CHUNK } from './helmetMeshlets';
import {
  DEPTH_INST_MAX,
  DEPTH_TRI_MAX,
  INSTANCE_INDEX_BITS,
  TRIANGLE_INDEX_BITS,
  TRIANGLE_INDEX_MASK,
} from './visibilitySurface';

/** A triangle whose screen bounding box exceeds this goes to the hardware path — a
 * software thread iterating a big box is O(n^2). */
const MAX_RASTER_SIZE = 32;
/** WebGPU's per-dimension workgroup limit — past it the dispatch goes 2-D. */
const MAX_DISPATCH_DIMENSION = 65535;

// `name` is a runtime LoopNode parameter @types/three leaves commented out, and it is
// load-bearing for NESTED loops: without it every level generates `i` and the inner
// shadows the outer. Typed-TSL gap, AGENTS.md B10 family.
function namedLoop<K extends string, T extends 'int' | 'uint'>(
  params: { name: K; type: T; start: Node<T> | number; end: Node<T> | number; condition: string },
  body: (inputs: Record<K, Node<T>>) => void,
) {
  (Loop as unknown as (loopParams: typeof params, loopBody: typeof body) => void)(params, body);
}

/** Signed screen-space area of a triangle — also the barycentric weight generator. */
const edge = (a: Node<'vec2'>, b: Node<'vec2'>, c: Node<'vec2'>) =>
  c.y
    .sub(a.y)
    .mul(b.x.sub(a.x))
    .sub(c.x.sub(a.x).mul(b.y.sub(a.y)));

export interface RasterizerKernelProps {
  megaMesh: MegaMesh;
  instanceCount: number;
  maxWorkItems: number;
  maxHwTriangles: number;

  vertexBuffer: StorageBufferNode<'vec4'>;
  indexBuffer: StorageBufferNode<'uint'>;
  chunkBoundsBuffer: StorageBufferNode<'vec4'>;
  instanceDataBuffer: StorageBufferNode<'vec4'>;
  instanceWorldBuffer: StorageBufferNode<'mat4'>;
  instancePrevWorldBuffer: StorageBufferNode<'mat4'>;
  instanceMvpBuffer: StorageBufferNode<'mat4'>;
  workQueueBuffer: StorageBufferNode<'uvec4'>;
  workQueueCountAtomic: StorageBufferNode<'uint'>;
  workQueueCountRead: StorageBufferNode<'uint'>;
  hwQueueAtomic: StorageBufferNode<'uint'>;
  screenTriAtomic: StorageBufferNode<'uint'>;
  screenInstAtomic: StorageBufferNode<'uint'>;
  dispatchAttribute: IndirectStorageBufferAttribute;
  hwDrawAttribute: IndirectStorageBufferAttribute;

  uProjScreenMatrix: Node<'mat4'>;
  uFrustumPlanes: UniformArrayNode<'vec4'>;
  uCameraPos: Node<'vec3'>;
  uCotHalfFov: Node<'float'>;
  uTimeScale: Node<'float'>;
  uLodThreshold: Node<'float'>;
  /** From createSphereOcclusionTest — the pyramid's read side. */
  sphereOccluded: (center: Node<'vec3'>, radius: Node<'float'>) => Node<'bool'>;
  /** LOD table as a uniform array: triangleStart, triangleCount, chunkStart. */
  uLodOffsets: UniformArrayNode<'vec4'>;
}

export function buildRasterizerKernels({
  megaMesh,
  instanceCount,
  maxWorkItems,
  maxHwTriangles,
  vertexBuffer,
  indexBuffer,
  chunkBoundsBuffer,
  instanceDataBuffer,
  instanceWorldBuffer,
  instancePrevWorldBuffer,
  instanceMvpBuffer,
  workQueueBuffer,
  workQueueCountAtomic,
  workQueueCountRead,
  hwQueueAtomic,
  screenTriAtomic,
  screenInstAtomic,
  dispatchAttribute,
  hwDrawAttribute,
  uProjScreenMatrix,
  uFrustumPlanes,
  uCameraPos,
  uCotHalfFov,
  uTimeScale,
  uLodThreshold,
  sphereOccluded,
  uLodOffsets,
}: RasterizerKernelProps) {
  // Six frustum planes, unrolled at graph-build time: the COUNT is constant even
  // though the plane values are live uniforms.
  const cullAgainstFrustum = (visible: Node<'bool'>, center: Node<'vec3'>, radius: Node<'float'>) => {
    for (let i = 0; i < 6; i++) {
      const plane = uFrustumPlanes.element(i);
      If(dot(plane.xyz, center).add(plane.w).lessThan(radius.negate()), () => {
        visible.assign(bool(false));
      });
    }
  };

  // Conservative sphere-vs-pyramid test against LAST frame's depth: pick the level
  // where the sphere's diameter fits one texel, so a 2x2 window always covers it.

  // (1) Clear the visibility buffers and both queue counters.
  const computeClear = Fn(() => {
    atomicStore(screenTriAtomic.element(instanceIndex), uint(0));
    atomicStore(screenInstAtomic.element(instanceIndex), uint(0));

    If(instanceIndex.equal(0), () => {
      atomicStore(workQueueCountAtomic.element(0), uint(0));
      atomicStore(hwQueueAtomic.element(0), uint(0));
    });
  })().compute(screenTriAtomic.bufferCount, [256]);

  // (2) Per instance: animate, frustum-cull, occlusion-cull against the pyramid, pick
  // a LOD from projected error, then cull each meshlet and queue the survivors.
  const computeFrustum = Fn(() => {
    // Keep last frame's transform before overwriting it.
    instancePrevWorldBuffer.element(instanceIndex).assign(instanceWorldBuffer.element(instanceIndex));

    const data = instanceDataBuffer.element(instanceIndex);
    const position = data.xyz;
    const scale = data.w;

    const rotation = time.mul(uTimeScale).add(float(instanceIndex));
    const c = cos(rotation);
    const s = sin(rotation);
    const matrixWorld = mat4(
      vec4(c.mul(scale), 0, s.mul(scale), 0),
      vec4(0, scale, 0, 0),
      vec4(s.negate().mul(scale), 0, c.mul(scale), 0),
      vec4(position, 1),
    );

    const visible = bool(true).toVar();
    const radius = scale.mul(megaMesh.boundingRadius);
    cullAgainstFrustum(visible, position, radius);

    If(visible, () => {
      visible.assign(sphereOccluded(position, radius).not());
    });

    If(visible, () => {
      // Screen-space projected error: cotHalfFov * worldError / distance * height/2.
      const pixelFactor = uCotHalfFov
        .div(max(0.01, distance(uCameraPos, position)))
        .mul(float(screenSize.y))
        .div(2);

      // Coarsest LOD whose projected error still fits the budget. A JS if/else-if
      // chain because the LOD table is compile-time data; the comparison is live.
      const lodLevel = uint(0).toVar();
      let lodSelection: ReturnType<typeof If> | null = null;
      for (let i = LOD_COUNT - 1; i > 0; i--) {
        const withinBudget = float(megaMesh.lodErrors[i]).mul(scale).mul(pixelFactor).lessThanEqual(uLodThreshold);
        const assign = () => {
          lodLevel.assign(i);
        };
        lodSelection = lodSelection === null ? If(withinBudget, assign) : lodSelection.ElseIf(withinBudget, assign);
      }

      const lodData = uLodOffsets.element(lodLevel);
      const lodTriangleStart = uint(lodData.x);
      const lodTriangleCount = uint(lodData.y);
      const lodChunkStart = uint(lodData.z);
      const workItems = lodTriangleCount.add(TRIANGLES_PER_CHUNK - 1).div(TRIANGLES_PER_CHUNK);

      namedLoop({ name: 'chunk', type: 'uint', start: uint(0), end: workItems, condition: '<' }, ({ chunk }) => {
        const bounds = chunkBoundsBuffer.element(lodChunkStart.add(chunk));
        const boundsCenter = bounds.xyz;
        // Vars, not expressions: the frustum test below reads them six times.
        const chunkCenter = matrixWorld.mul(vec4(boundsCenter, 1)).xyz.toVar();
        const chunkRadius = bounds.w.mul(scale).toVar();

        const chunkVisible = bool(true).toVar();
        cullAgainstFrustum(chunkVisible, chunkCenter, chunkRadius);

        If(chunkVisible, () => {
          // Last frame's position, to stay consistent with last frame's pyramid.
          const previousCenter = instancePrevWorldBuffer.element(instanceIndex).mul(vec4(boundsCenter, 1)).xyz.toVar();
          chunkVisible.assign(sphereOccluded(previousCenter, chunkRadius).not());
        });

        If(chunkVisible, () => {
          const item = atomicAdd(workQueueCountAtomic.element(0), 1);
          If(item.lessThan(maxWorkItems), () => {
            workQueueBuffer.element(item).assign(uvec4(instanceIndex, lodTriangleStart, lodTriangleCount, chunk));
          });
        });
      });

      instanceWorldBuffer.element(instanceIndex).assign(matrixWorld);
      instanceMvpBuffer.element(instanceIndex).assign(uProjScreenMatrix.mul(matrixWorld));
    });
  })().compute(instanceCount);

  // (3) Turn the work-queue length into an indirect dispatch size, splitting into a
  // 2-D grid past the per-dimension workgroup limit.
  const computeDispatch = Fn(() => {
    const totalWorkgroups = workQueueCountRead.element(0);
    const maxDimension = uint(MAX_DISPATCH_DIMENSION);
    const dispatch = storage(dispatchAttribute, 'uint', 3);

    // Typed TSL has no integer min (AGENTS.md); the float round-trip is exact well
    // below 2^24, and a workgroup count never gets near it.
    dispatch.element(0).assign(uint(float(totalWorkgroups).min(MAX_DISPATCH_DIMENSION)));
    dispatch.element(1).assign(totalWorkgroups.add(maxDimension).sub(1).div(maxDimension));
    dispatch.element(2).assign(uint(1));
  })().compute(1);

  // (4) The software rasterizer: one workgroup per work item, one thread per
  // triangle, walking the triangle's bounding box and atomicMaxing a packed
  // depth + payload word into the visibility buffer.
  const computeRasterize = Fn(() => {
    const totalThreads = workQueueCountRead.element(0).mul(TRIANGLES_PER_CHUNK);

    If(instanceIndex.lessThan(totalThreads), () => {
      const workItem = workQueueBuffer.element(instanceIndex.div(TRIANGLES_PER_CHUNK));
      const instanceId = workItem.x;
      const lodTriangleStart = workItem.y;
      const lodTriangleCount = workItem.z;
      const chunkIndex = workItem.w;

      const triangleInLod = chunkIndex.mul(TRIANGLES_PER_CHUNK).add(instanceIndex.mod(TRIANGLES_PER_CHUNK));

      If(triangleInLod.lessThan(lodTriangleCount), () => {
        const megaTriangleIndex = lodTriangleStart.add(triangleInLod);
        const indexOffset = megaTriangleIndex.mul(3);

        const v0 = vertexBuffer.element(indexBuffer.element(indexOffset));
        const v1 = vertexBuffer.element(indexBuffer.element(indexOffset.add(1)));
        const v2 = vertexBuffer.element(indexBuffer.element(indexOffset.add(2)));

        const mvp = instanceMvpBuffer.element(instanceId);
        const p0 = mvp.mul(v0);
        const p1 = mvp.mul(v1);
        const p2 = mvp.mul(v2);

        // Near-plane clip: whole triangles only, no clipping.
        If(p0.w.greaterThan(0).and(p1.w.greaterThan(0)).and(p2.w.greaterThan(0)), () => {
          const ndc0 = p0.xyz.div(p0.w);
          const ndc1 = p1.xyz.div(p1.w);
          const ndc2 = p2.xyz.div(p2.w);

          // Backface cull in NDC, before any per-pixel work.
          If(edge(ndc0.xy, ndc1.xy, ndc2.xy).greaterThan(0), () => {
            const ndcMinX = min(ndc0.x, min(ndc1.x, ndc2.x));
            const ndcMaxX = max(ndc0.x, max(ndc1.x, ndc2.x));
            const ndcMinY = min(ndc0.y, min(ndc1.y, ndc2.y));
            const ndcMaxY = max(ndc0.y, max(ndc1.y, ndc2.y));

            If(
              ndcMaxX.greaterThan(-1).and(ndcMinX.lessThan(1)).and(ndcMaxY.greaterThan(-1)).and(ndcMinY.lessThan(1)),
              () => {
                const w = screenSize.x;
                const h = screenSize.y;
                const s0 = ndc0.xy.add(1).mul(0.5).mul(vec2(w, h));
                const s1 = ndc1.xy.add(1).mul(0.5).mul(vec2(w, h));
                const s2 = ndc2.xy.add(1).mul(0.5).mul(vec2(w, h));

                const startX = int(floor(max(0, min(s0.x, min(s1.x, s2.x)))));
                const endX = int(floor(min(w.sub(1), max(s0.x, max(s1.x, s2.x)))));
                const startY = int(floor(max(0, min(s0.y, min(s1.y, s2.y)))));
                const endY = int(floor(min(h.sub(1), max(s0.y, max(s1.y, s2.y)))));

                If(
                  startX
                    .lessThanEqual(endX)
                    .and(startY.lessThanEqual(endY))
                    .and(endX.sub(startX).lessThanEqual(int(MAX_RASTER_SIZE)))
                    .and(endY.sub(startY).lessThanEqual(int(MAX_RASTER_SIZE))),
                  () => {
                    const area = edge(s0, s1, s2);

                    const stepXw0 = s1.y.sub(s2.y);
                    const stepYw0 = s2.x.sub(s1.x);
                    const stepXw1 = s2.y.sub(s0.y);
                    const stepYw1 = s0.x.sub(s2.x);
                    const stepXw2 = s0.y.sub(s1.y);
                    const stepYw2 = s1.x.sub(s0.x);

                    // Top-left fill rule: a shared edge lands in exactly one triangle.
                    const isTopLeft = (stepX: Node<'float'>, stepY: Node<'float'>) =>
                      stepX.lessThan(0).or(stepX.equal(0).and(stepY.greaterThan(0)));
                    const bias0 = isTopLeft(stepXw0, stepYw0).select(0, -1e-5);
                    const bias1 = isTopLeft(stepXw1, stepYw1).select(0, -1e-5);
                    const bias2 = isTopLeft(stepXw2, stepYw2).select(0, -1e-5);

                    const pixelStart = vec2(float(startX).add(0.5), float(startY).add(0.5));
                    const rowW0 = edge(s1, s2, pixelStart).add(bias0).toVar();
                    const rowW1 = edge(s2, s0, pixelStart).add(bias1).toVar();
                    const rowW2 = edge(s0, s1, pixelStart).add(bias2).toVar();

                    // Depth interpolated incrementally: one add per pixel.
                    const rowZ = rowW0
                      .div(area)
                      .mul(ndc0.z)
                      .add(rowW1.div(area).mul(ndc1.z))
                      .add(rowW2.div(area).mul(ndc2.z))
                      .toVar();
                    const stepXz = stepXw0
                      .div(area)
                      .mul(ndc0.z)
                      .add(stepXw1.div(area).mul(ndc1.z))
                      .add(stepXw2.div(area).mul(ndc2.z));
                    const stepYz = stepYw0
                      .div(area)
                      .mul(ndc0.z)
                      .add(stepYw1.div(area).mul(ndc1.z))
                      .add(stepYw2.div(area).mul(ndc2.z));

                    namedLoop({ name: 'y', type: 'int', start: startY, end: endY, condition: '<=' }, ({ y }) => {
                      const w0 = rowW0.toVar();
                      const w1 = rowW1.toVar();
                      const w2 = rowW2.toVar();
                      const z = rowZ.toVar();

                      namedLoop({ name: 'x', type: 'int', start: startX, end: endX, condition: '<=' }, ({ x }) => {
                        If(w0.greaterThanEqual(0).and(w1.greaterThanEqual(0)).and(w2.greaterThanEqual(0)), () => {
                          If(z.greaterThanEqual(0).and(z.lessThanEqual(1)), () => {
                            // Fourth-root depth distribution, packed above each
                            // payload's own bit width.
                            const encoded = sqrt(sqrt(float(1).sub(z)));
                            const depthTri = uint(encoded.mul(DEPTH_TRI_MAX));
                            const depthInst = uint(encoded.mul(DEPTH_INST_MAX));

                            const packedTri = depthTri
                              .shiftLeft(TRIANGLE_INDEX_BITS)
                              .bitOr(megaTriangleIndex.bitAnd(TRIANGLE_INDEX_MASK));
                            const packedInst = depthInst.shiftLeft(INSTANCE_INDEX_BITS).bitOr(instanceId);

                            const pixelIndex = uint(y).mul(uint(screenSize.x)).add(uint(x));

                            // Cheap pre-check: skip both atomics when this pixel is
                            // already covered by something closer.
                            const currentDepth = atomicLoad(screenTriAtomic.element(pixelIndex)).shiftRight(
                              TRIANGLE_INDEX_BITS,
                            );
                            If(depthTri.greaterThanEqual(currentDepth), () => {
                              atomicMax(screenTriAtomic.element(pixelIndex), packedTri);
                              atomicMax(screenInstAtomic.element(pixelIndex), packedInst);
                            });
                          });
                        });

                        w0.addAssign(stepXw0);
                        w1.addAssign(stepXw1);
                        w2.addAssign(stepXw2);
                        z.addAssign(stepXz);
                      });

                      rowW0.addAssign(stepYw0);
                      rowW1.addAssign(stepYw1);
                      rowW2.addAssign(stepYw2);
                      rowZ.addAssign(stepYz);
                    });
                  },
                ).Else(() => {
                  // Too big for a single thread — queue it for the hardware pipeline.
                  If(startX.lessThanEqual(endX).and(startY.lessThanEqual(endY)), () => {
                    const count = atomicAdd(hwQueueAtomic.element(0), 1);
                    If(count.lessThan(maxHwTriangles), () => {
                      const slot = count.mul(2).add(1);
                      atomicStore(hwQueueAtomic.element(slot), instanceId);
                      atomicStore(hwQueueAtomic.element(slot.add(1)), megaTriangleIndex);
                    });
                  });
                });
              },
            );
          });
        });
      });
    });
    // No count: the dispatch size comes from the indirect buffer, and a count would
    // also emit a bounds check against a number that only exists on the GPU.
  })().computeKernel();

  // (5) Draw arguments for the hardware pass: 3 vertices per queued triangle.
  const computeHwArgs = Fn(() => {
    const hwDraw = storage(hwDrawAttribute, 'uint', 4);
    hwDraw.element(0).assign(atomicLoad(hwQueueAtomic.element(0)).mul(3)); // vertexCount
    hwDraw.element(1).assign(uint(1)); // instanceCount
    hwDraw.element(2).assign(uint(0)); // firstVertex
    hwDraw.element(3).assign(uint(0)); // firstInstance
  })().compute(1);

  return { computeClear, computeFrustum, computeDispatch, computeRasterize, computeHwArgs };
}

// The GPU-driven rasterizer itself: the mega-mesh storage buffers, the five compute
// kernels (clear, cull+LOD+work-allocation, indirect dispatch args, software raster,
// hardware draw args), the fullscreen resolve pass, and the hardware fallback mesh for
// triangles too big to rasterize in a thread. Uses fiber hooks
// (`useControls`/`useBuffers`/`useNodes`/`useUniforms`/`useTexture`/`useFrame`/
// `useThree`), so it lives inside <Canvas>, not in the page shell.
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
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
  texture,
  time,
  uint,
  uniform,
  uniformArray,
  uv,
  uvec4,
  varyingProperty,
  vec2,
  vec4,
  vertexIndex,
} from 'three/tsl';
import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Frustum,
  IndirectStorageBufferAttribute,
  Matrix4,
  NodeMaterial,
  QuadMesh,
  RepeatWrapping,
  SRGBColorSpace,
  Sphere,
  StorageBufferAttribute,
  Vector2,
  Vector3,
  Vector4,
  type Node,
} from 'three/webgpu';
import { useBuffers, useFrame, useLocalNodes, useNodes, useThree, useUniforms } from '@react-three/fiber/webgpu';
import { useTexture } from '@react-three/drei/webgpu';
import { useControls } from 'leva';

import { buildMegaMesh, LOD_COUNT, LOD_ERRORS, TRIANGLES_PER_CHUNK } from './megaMesh';

const UV_GRID_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/uv_grid_directx.jpg';

// Instance field: 400 x 400 teapots, 4 world units apart (original values).
const ROWS = 400;
const COLS = 400;
const INSTANCE_COUNT = ROWS * COLS;

// A triangle whose screen bounding box exceeds this many pixels is handed to the
// hardware rasterizer — a software rasterizer thread iterating a big box is O(n^2).
const MAX_RASTER_SIZE = 16;
// Screen-space LOD error budget, in pixels.
const PIXEL_ERROR_THRESHOLD = 4;

// Visibility-buffer packing. Depth goes in the HIGH bits of each word, so a single
// atomicMax resolves the depth test AND the payload write in one order-independent
// step — no frame-to-frame flicker from racing threads.
// screenTri:  depth(18) | triangleIndex(14)   screenInst: depth(14) | instanceId(18)
const TRIANGLE_INDEX_BITS = 14;
const TRIANGLE_INDEX_MASK = 0x3fff;
const INSTANCE_INDEX_BITS = 18;
const INSTANCE_INDEX_MASK = 0x3ffff;
const DEPTH_TRI_MAX = 262143;
const DEPTH_INST_MAX = 16383;

// Work queue budget — one item is a 64-triangle chunk of one visible instance.
const MAX_WORK_ITEMS = 2_820_000;
const MAX_HW_TRIANGLES = 100_000;
// WebGPU's per-dimension workgroup limit — past it the dispatch goes 2-D.
const MAX_DISPATCH_DIMENSION = 65535;

const BACKGROUND = new Color(0.1, 0.1, 0.1);

//* TSL helpers =====================================================

// `name` is a runtime LoopNode parameter @types/three leaves commented out ("TODO The
// variable name should affect the type of the loop function"), and it is load-bearing
// for NESTED loops: without it every level generates `i` and the inner shadows the
// outer. This wrapper re-declares Loop with the name and the matching callback key —
// typed-TSL gap, AGENTS.md B10 family.
function namedLoop<K extends string, T extends 'int' | 'uint'>(
  params: { name: K; type: T; start: Node<T> | number; end: Node<T> | number; condition: string },
  body: (inputs: Record<K, Node<T>>) => void,
) {
  (Loop as unknown as (loopParams: typeof params, loopBody: typeof body) => void)(params, body);
}

// Signed area of a triangle in screen space — also the barycentric weight generator.
// Plain function rather than `Fn`: it declares no variables, so it needs no stack of
// its own and inlines at every call site.
const edgeFunction = (a: Node<'vec2'>, b: Node<'vec2'>, c: Node<'vec2'>) =>
  c.y
    .sub(a.y)
    .mul(b.x.sub(a.x))
    .sub(c.x.sub(a.x).mul(b.y.sub(a.y)));

// PCG-style hash → a stable colour per meshlet id. Called only from inside Fn bodies,
// so its `.toVar()` always has a live stack.
const hashColor = (idIn: Node<'uint'>) => {
  let id: Node<'uint'> = uint(idIn).toVar();
  id = id.mul(uint(747796405)).add(uint(289559509));
  id = id.shiftRight(16).bitXor(id).mul(uint(277803737));
  id = id.shiftRight(16).bitXor(id);

  const r = float(id.bitAnd(uint(255))).div(255);
  const g = float(id.shiftRight(8).bitAnd(uint(255))).div(255);
  const b = float(id.shiftRight(16).bitAnd(uint(255))).div(255);
  return vec4(r.mul(0.8).add(0.2), g.mul(0.8).add(0.2), b.mul(0.8).add(0.2), 1);
};

// Pixel index of the current fragment in the screen-sized visibility buffers.
const pixelIndexFromUv = () => {
  const screenX = uint(floor(uv().x.mul(screenSize.x)));
  const screenY = uint(floor(uv().y.oneMinus().mul(screenSize.y)));
  return screenY.mul(uint(screenSize.x)).add(screenX);
};

export function Rasterizer() {
  //* Controls =====================================================
  const { mode, rasterizer, animationSpeed } = useControls('compute-rasterizer', {
    mode: { value: 'Meshlet Debug', options: ['Meshlet Debug', 'Texture'] },
    rasterizer: { value: 'Both', options: ['SW Only', 'HW Only', 'Both'] },
    animationSpeed: { value: 1, min: 0, max: 1, step: 0.01 },
  });
  const { uTimeScale } = useUniforms({ uTimeScale: animationSpeed }, 'rasterizer');

  const renderer = useThree((state) => state.renderer);
  const scene = useThree((state) => state.scene);
  const size = useThree((state) => state.size);

  //* GPU State ====================================================
  const {
    vertexBuffer,
    uvBuffer,
    indexBuffer,
    meshletIdBuffer,
    lodOffsetsBuffer,
    chunkBoundsBuffer,
    instanceDataBuffer,
    instanceWorldBuffer,
    instanceWorldRead,
    instanceMvpBuffer,
    workQueueBuffer,
    workQueueCountAtomic,
    workQueueCountRead,
    dispatchAttribute,
    hwQueueAtomic,
    hwQueueRead,
    hwDrawAttribute,
    screenTriAtomic,
    screenTriRead,
    screenInstAtomic,
    screenInstRead,
  } = useBuffers(() => {
    const mega = buildMegaMesh();

    // Teapot field: xyz position + uniform scale in w.
    const instanceData = new Float32Array(INSTANCE_COUNT * 4);
    let write = 0;
    for (let i = 0; i < ROWS; i++) {
      for (let j = 0; j < COLS; j++) {
        instanceData[write++] = (i - ROWS / 2) * 4;
        instanceData[write++] = -1;
        instanceData[write++] = (j - COLS / 2) * 4;
        instanceData[write++] = 1;
      }
    }

    // Per-instance matrices the frustum kernel writes and the raster kernel reads.
    // instanceWorld gets a SECOND read-only view because the hardware mesh's vertex
    // stage reads it while the kernel still needs write access.
    const instanceWorldAttribute = new StorageBufferAttribute(new Float32Array(INSTANCE_COUNT * 16), 16);
    const instanceMvpAttribute = new StorageBufferAttribute(new Float32Array(INSTANCE_COUNT * 16), 16);

    // Two views of one word: the kernels bump it atomically, the readers read it back.
    const workQueueCountAttribute = new StorageBufferAttribute(new Uint32Array(1), 1);
    // Slot 0 is the atomic counter; 1.. hold one packed payload per queued triangle.
    const hwQueueAttribute = new StorageBufferAttribute(new Uint32Array(MAX_HW_TRIANGLES + 1), 1);

    // Screen-sized visibility buffers, one word per pixel. Sized from the drawing
    // buffer, and reallocated by the resize effect below.
    const drawingBuffer = renderer.getDrawingBufferSize(new Vector2());
    const pixelCount = drawingBuffer.x * drawingBuffer.y;
    const screenTriAttribute = new StorageBufferAttribute(new Uint32Array(pixelCount), 1);
    const screenInstAttribute = new StorageBufferAttribute(new Uint32Array(pixelCount), 1);

    return {
      // The mega mesh, read-only for every kernel that touches it.
      vertexBuffer: storage(new StorageBufferAttribute(mega.vertexArray, 4), 'vec4', mega.vertexCount).toReadOnly(),
      uvBuffer: storage(new StorageBufferAttribute(mega.uvArray, 2), 'vec2', mega.vertexCount).toReadOnly(),
      indexBuffer: storage(new StorageBufferAttribute(mega.indexArray, 1), 'uint', mega.indexCount).toReadOnly(),
      meshletIdBuffer: storage(
        new StorageBufferAttribute(mega.meshletIdArray, 1),
        'uint',
        mega.indexCount / 3,
      ).toReadOnly(),
      lodOffsetsBuffer: storage(new StorageBufferAttribute(mega.lodOffsetsArray, 4), 'uvec4', LOD_COUNT).toReadOnly(),
      chunkBoundsBuffer: storage(
        new StorageBufferAttribute(mega.chunkBoundsArray, 4),
        'vec4',
        mega.chunkCount,
      ).toReadOnly(),

      instanceDataBuffer: storage(new StorageBufferAttribute(instanceData, 4), 'vec4', INSTANCE_COUNT),
      instanceWorldBuffer: storage(instanceWorldAttribute, 'mat4', INSTANCE_COUNT),
      instanceWorldRead: storage(instanceWorldAttribute, 'mat4', INSTANCE_COUNT).toReadOnly(),
      instanceMvpBuffer: storage(instanceMvpAttribute, 'mat4', INSTANCE_COUNT),

      workQueueBuffer: storage(
        new StorageBufferAttribute(new Uint32Array(MAX_WORK_ITEMS * 4), 4),
        'uvec4',
        MAX_WORK_ITEMS,
      ),
      workQueueCountAtomic: storage(workQueueCountAttribute, 'uint', 1).toAtomic(),
      workQueueCountRead: storage(workQueueCountAttribute, 'uint', 1).toReadOnly(),

      hwQueueAtomic: storage(hwQueueAttribute, 'uint', MAX_HW_TRIANGLES + 1).toAtomic(),
      hwQueueRead: storage(hwQueueAttribute, 'uint', MAX_HW_TRIANGLES + 1).toReadOnly(),

      // Indirect argument buffers, both written by kernels and never by the CPU:
      // a compute dispatch size and a non-indexed draw's (vertexCount, …).
      dispatchAttribute: new IndirectStorageBufferAttribute(new Uint32Array(3), 3),
      hwDrawAttribute: new IndirectStorageBufferAttribute(new Uint32Array(4), 4),

      screenTriAtomic: storage(screenTriAttribute, 'uint', pixelCount).toAtomic(),
      screenTriRead: storage(screenTriAttribute, 'uint', pixelCount).toReadOnly(),
      screenInstAtomic: storage(screenInstAttribute, 'uint', pixelCount).toAtomic(),
      screenInstRead: storage(screenInstAttribute, 'uint', pixelCount).toReadOnly(),
    };
  }, 'rasterizer');

  //* Compute Graph =================================================
  const {
    computeClear,
    computeFrustum,
    computeDispatch,
    computeRasterize,
    computeHwArgs,
    uProjScreenMatrix,
    uFrustumPlanes,
    uCameraPos,
    uCotHalfFov,
    uMaterialMode,
  } = useNodes(() => {
    // Camera state, rewritten every frame from the render loop — plain TSL uniforms,
    // not useUniforms: React must never write these back.
    const uProjScreenMatrix = uniform(new Matrix4());
    const uFrustumPlanes = uniformArray<'vec4'>(
      [new Vector4(), new Vector4(), new Vector4(), new Vector4(), new Vector4(), new Vector4()],
      'vec4',
    );
    const uCameraPos = uniform(new Vector3());
    const uCotHalfFov = uniform(1);
    // uint, so it cannot come from useUniforms — an effect below tracks the leva knob.
    const uMaterialMode = uniform(0, 'uint');

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

    // (1) Clear the visibility buffers and both queue counters.
    const computeClear = Fn(() => {
      atomicStore(screenTriAtomic.element(instanceIndex), uint(0));
      atomicStore(screenInstAtomic.element(instanceIndex), uint(0));

      If(instanceIndex.equal(0), () => {
        atomicStore(workQueueCountAtomic.element(0), uint(0));
        atomicStore(hwQueueAtomic.element(0), uint(0));
      });
    })().compute(screenTriAtomic.bufferCount, [256]);

    // (2) Per instance: animate, frustum-cull, pick a LOD from projected error, then
    // cull each 64-triangle chunk and push the survivors onto the work queue.
    const computeFrustum = Fn(() => {
      const data = instanceDataBuffer.element(instanceIndex);
      const position = data.xyz;
      const scale = data.w;

      // Spin, offset per instance so the field doesn't move as one block.
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
      cullAgainstFrustum(visible, position, scale.mul(2));

      If(visible, () => {
        // Screen-space projected error: cotHalfFov * worldError / distance * height/2.
        const pixelFactor = uCotHalfFov
          .div(max(0.01, distance(uCameraPos, position)))
          .mul(float(screenSize.y))
          .div(2);

        // Coarsest LOD whose projected error still fits the budget. Built as a JS
        // if/else-if chain because the LOD table is compile-time data; the comparison
        // itself is live.
        const lodLevel = uint(0).toVar();
        let lodSelection: ReturnType<typeof If> | null = null;
        for (let i = LOD_COUNT - 1; i > 0; i--) {
          const withinBudget = float(LOD_ERRORS[i]).mul(scale).mul(pixelFactor).lessThanEqual(PIXEL_ERROR_THRESHOLD);
          const assign = () => {
            lodLevel.assign(i);
          };
          lodSelection = lodSelection === null ? If(withinBudget, assign) : lodSelection.ElseIf(withinBudget, assign);
        }

        const lodData = lodOffsetsBuffer.element(lodLevel);
        const lodTriangleStart = lodData.x;
        const lodTriangleCount = lodData.y;
        const lodChunkStart = lodData.z;

        const workItems = lodTriangleCount.add(TRIANGLES_PER_CHUNK - 1).div(TRIANGLES_PER_CHUNK);

        namedLoop({ name: 'chunk', type: 'uint', start: uint(0), end: workItems, condition: '<' }, ({ chunk }) => {
          const bounds = chunkBoundsBuffer.element(lodChunkStart.add(chunk));
          // Var, not an expression: the frustum test below reads them six times.
          const chunkCenter = matrixWorld.mul(vec4(bounds.xyz, 1)).xyz.toVar();
          const chunkRadius = bounds.w.mul(scale).toVar();

          const chunkVisible = bool(true).toVar();
          cullAgainstFrustum(chunkVisible, chunkCenter, chunkRadius);

          If(chunkVisible, () => {
            const item = atomicAdd(workQueueCountAtomic.element(0), 1);
            workQueueBuffer.element(item).assign(uvec4(instanceIndex, lodTriangleStart, lodTriangleCount, chunk));
          });
        });

        instanceWorldBuffer.element(instanceIndex).assign(matrixWorld);
        instanceMvpBuffer.element(instanceIndex).assign(uProjScreenMatrix.mul(matrixWorld));
      });
    })().compute(INSTANCE_COUNT);

    // (3) Turn the work-queue length into an indirect dispatch size, splitting into a
    // 2-D grid past the 65535-workgroup-per-dimension limit.
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
    // triangle. Walks the triangle's screen bounding box and atomicMaxes a packed
    // depth+payload word into the visibility buffer.
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

          // Near-plane clip: no partial-triangle clipping, whole triangles only.
          If(p0.w.greaterThan(0).and(p1.w.greaterThan(0)).and(p2.w.greaterThan(0)), () => {
            const ndc0 = p0.xyz.div(p0.w);
            const ndc1 = p1.xyz.div(p1.w);
            const ndc2 = p2.xyz.div(p2.w);

            // Backface cull in NDC, before any per-pixel work.
            If(edgeFunction(ndc0.xy, ndc1.xy, ndc2.xy).greaterThan(0), () => {
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

                  // payload32: instanceId(18) | triangleIndex(14), full precision, for
                  // the hardware path (which needs no depth in the word).
                  const payload32 = instanceId
                    .shiftLeft(TRIANGLE_INDEX_BITS)
                    .bitOr(megaTriangleIndex.bitAnd(TRIANGLE_INDEX_MASK));

                  If(
                    startX
                      .lessThanEqual(endX)
                      .and(startY.lessThanEqual(endY))
                      .and(endX.sub(startX).lessThanEqual(int(MAX_RASTER_SIZE)))
                      .and(endY.sub(startY).lessThanEqual(int(MAX_RASTER_SIZE))),
                    () => {
                      const area = edgeFunction(s0, s1, s2);

                      const stepXw0 = s1.y.sub(s2.y);
                      const stepYw0 = s2.x.sub(s1.x);
                      const stepXw1 = s2.y.sub(s0.y);
                      const stepYw1 = s0.x.sub(s2.x);
                      const stepXw2 = s0.y.sub(s1.y);
                      const stepYw2 = s1.x.sub(s0.x);

                      // Top-left fill rule: shared edges land in exactly one triangle.
                      const isTopLeft = (stepX: Node<'float'>, stepY: Node<'float'>) =>
                        stepX.lessThan(0).or(stepX.equal(0).and(stepY.greaterThan(0)));
                      const bias0 = isTopLeft(stepXw0, stepYw0).select(0, -1e-5);
                      const bias1 = isTopLeft(stepXw1, stepYw1).select(0, -1e-5);
                      const bias2 = isTopLeft(stepXw2, stepYw2).select(0, -1e-5);

                      const pixelStart = vec2(float(startX).add(0.5), float(startY).add(0.5));
                      const rowW0 = edgeFunction(s1, s2, pixelStart).add(bias0).toVar();
                      const rowW1 = edgeFunction(s2, s0, pixelStart).add(bias1).toVar();
                      const rowW2 = edgeFunction(s0, s1, pixelStart).add(bias2).toVar();

                      // Depth interpolated incrementally: one add per pixel instead of
                      // three divides.
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
                      const slot = atomicAdd(hwQueueAtomic.element(0), 1).add(1);
                      atomicStore(hwQueueAtomic.element(slot), payload32);
                    });
                  });
                },
              );
            });
          });
        });
      });
      // No count: the dispatch size comes from the indirect buffer at dispatch time,
      // and a count would also emit a bounds check against a number we don't have.
    })().computeKernel();

    // (5) Draw arguments for the hardware pass: 3 vertices per queued triangle.
    const computeHwArgs = Fn(() => {
      const hwDraw = storage(hwDrawAttribute, 'uint', 4);
      hwDraw.element(0).assign(atomicLoad(hwQueueAtomic.element(0)).mul(3)); // vertexCount
      hwDraw.element(1).assign(uint(1)); // instanceCount
      hwDraw.element(2).assign(uint(0)); // firstVertex
      hwDraw.element(3).assign(uint(0)); // firstInstance
    })().compute(1);

    return {
      computeClear,
      computeFrustum,
      computeDispatch,
      computeRasterize,
      computeHwArgs,
      uProjScreenMatrix,
      uFrustumPlanes,
      uCameraPos,
      uCotHalfFov,
      uMaterialMode,
    };
  }, 'rasterizer');

  // SUSPENDS — ordered after every creator hook above (AGENTS.md B18). The material
  // graphs that sample it are built with `useLocalNodes`, which is a plain useMemo
  // with no store write, so it is safe on this side of the suspension.
  const map = useTexture(UV_GRID_URL, (loaded) => {
    loaded.colorSpace = SRGBColorSpace;
    loaded.wrapS = RepeatWrapping;
    loaded.wrapT = RepeatWrapping;
  });

  //* Shading =======================================================
  const { resolveColorNode, resolveDepthNode, hwPositionNode, hwFragmentNode } = useLocalNodes(() => {
    // Vertex → fragment varyings for the hardware path. The vertex stage pulls its own
    // data out of the queue, so the payload has to ride along.
    const vPayload = varyingProperty<'uint'>('uint', 'vPayload');
    const vUv = varyingProperty<'vec2'>('vec2', 'vUv');

    // Hardware path, vertex stage: pure vertex pulling. The geometry is a dummy buffer
    // whose draw count comes from hwDrawAttribute — every attribute is fetched here.
    const hwPositionNode = Fn(() => {
      const triangleIndex = vertexIndex.div(3);
      const localVertex = vertexIndex.mod(3);

      const payload32 = hwQueueRead.element(triangleIndex.add(1));
      const instanceId = payload32.shiftRight(TRIANGLE_INDEX_BITS);
      const megaTriangleIndex = payload32.bitAnd(TRIANGLE_INDEX_MASK);

      const globalVertex = indexBuffer.element(megaTriangleIndex.mul(3).add(localVertex));

      vUv.assign(uvBuffer.element(globalVertex));
      vPayload.assign(payload32);

      return instanceWorldRead.element(instanceId).mul(vertexBuffer.element(globalVertex)).xyz;
    })();

    // Hardware path, fragment stage: real hardware-interpolated UVs, so no manual
    // barycentrics here.
    const hwFragmentNode = Fn(() => {
      const instanceId = vPayload.shiftRight(TRIANGLE_INDEX_BITS);
      const megaTriangleIndex = vPayload.bitAnd(TRIANGLE_INDEX_MASK);

      const outColor = vec4(0).toVar();
      If(uMaterialMode.equal(0), () => {
        outColor.assign(hashColor(meshletIdBuffer.element(megaTriangleIndex).add(instanceId.mul(1000))));
      }).Else(() => {
        outColor.assign(texture(map, vUv));
      });
      return outColor;
    })();

    // Resolve pass, depth: republish the software rasterizer's depth so the hardware
    // mesh drawn afterwards depth-tests against it.
    const resolveDepthNode = Fn(() => {
      const depthTri = screenTriRead.element(pixelIndexFromUv()).shiftRight(TRIANGLE_INDEX_BITS);
      // Undo the fourth root the rasterizer stored.
      const y = float(depthTri).div(DEPTH_TRI_MAX);
      const y2 = y.mul(y);
      return float(1).sub(y2.mul(y2));
    })();

    // Resolve pass, colour: the visibility buffer holds only "which triangle of which
    // instance" — everything else (position, UV, derivatives) is recomputed here, per
    // pixel, at full 32-bit precision.
    const resolveColorNode = Fn(() => {
      const packedTri = screenTriRead.element(pixelIndexFromUv());
      const outColor = vec4(BACKGROUND, 1).toVar();

      If(packedTri.shiftRight(TRIANGLE_INDEX_BITS).greaterThan(0), () => {
        const megaTriangleIndex = packedTri.bitAnd(TRIANGLE_INDEX_MASK);
        const instanceId = screenInstRead.element(pixelIndexFromUv()).bitAnd(INSTANCE_INDEX_MASK);

        const i0 = indexBuffer.element(megaTriangleIndex.mul(3));
        const i1 = indexBuffer.element(megaTriangleIndex.mul(3).add(1));
        const i2 = indexBuffer.element(megaTriangleIndex.mul(3).add(2));

        const uv0 = uvBuffer.element(i0);
        const uv1 = uvBuffer.element(i1);
        const uv2 = uvBuffer.element(i2);

        const mvp = instanceMvpBuffer.element(instanceId);
        const p0 = mvp.mul(vertexBuffer.element(i0));
        const p1 = mvp.mul(vertexBuffer.element(i1));
        const p2 = mvp.mul(vertexBuffer.element(i2));

        const s0 = p0.xy.div(p0.w).add(1).mul(0.5).mul(screenSize);
        const s1 = p1.xy.div(p1.w).add(1).mul(0.5).mul(screenSize);
        const s2 = p2.xy.div(p2.w).add(1).mul(0.5).mul(screenSize);
        const pixel = vec2(uv().x.mul(screenSize.x), uv().y.oneMinus().mul(screenSize.y));

        const area = edgeFunction(s0, s1, s2);
        const w0 = edgeFunction(s1, s2, pixel);
        const w1 = edgeFunction(s2, s0, pixel);
        const w2 = edgeFunction(s0, s1, pixel);

        const safeArea = area.equal(0).select(1, area);
        const b0 = w0.div(safeArea);
        const b1 = w1.div(safeArea);
        const b2 = w2.div(safeArea);

        // Perspective-correct interpolation from the clip-space w's.
        const zInv = b0.div(p0.w).add(b1.div(p1.w)).add(b2.div(p2.w));
        const safeZInv = zInv.equal(0).select(1, zInv);
        const uvInterp = uv0
          .mul(b0.div(p0.w).div(safeZInv))
          .add(uv1.mul(b1.div(p1.w).div(safeZInv)))
          .add(uv2.mul(b2.div(p2.w).div(safeZInv)));

        // Analytic UV derivatives. dFdx/dFdy would read neighbouring fragments, which
        // belong to different triangles here — the derivative comes from the
        // barycentric gradients instead.
        const q0 = float(1).div(p0.w);
        const q1 = float(1).div(p1.w);
        const q2 = float(1).div(p2.w);
        const sumWq = w0.mul(q0).add(w1.mul(q1)).add(w2.mul(q2));
        const safeSumWq = sumWq.equal(0).select(1, sumWq);

        const uvGradient = (d0: Node<'float'>, d1: Node<'float'>, d2: Node<'float'>) =>
          d0
            .mul(q0)
            .mul(uv0.sub(uvInterp))
            .add(d1.mul(q1).mul(uv1.sub(uvInterp)))
            .add(d2.mul(q2).mul(uv2.sub(uvInterp)))
            .div(safeSumWq);

        const dUvDx = uvGradient(s2.y.sub(s1.y), s0.y.sub(s2.y), s1.y.sub(s0.y));
        const dUvDy = uvGradient(s1.x.sub(s2.x), s2.x.sub(s0.x), s0.x.sub(s1.x));

        If(uMaterialMode.equal(0), () => {
          outColor.assign(hashColor(meshletIdBuffer.element(megaTriangleIndex).add(instanceId.mul(1000))));
        }).Else(() => {
          outColor.assign(texture(map, uvInterp).grad(dUvDx, dUvDy));
        });
      });

      return outColor;
    })();

    return { resolveColorNode, resolveDepthNode, hwPositionNode, hwFragmentNode };
  });

  //* Meshes ========================================================
  // The resolve pass is a QuadMesh rendered by hand rather than an object in the
  // scene: it has to draw BEFORE the hardware mesh, into the same target, with its
  // own depth. That ordering is the whole point of the render takeover below.
  const resolveMaterial = useMemo(() => {
    const material = new NodeMaterial();
    material.depthWrite = true;
    material.colorNode = resolveColorNode;
    material.depthNode = resolveDepthNode;
    return material;
  }, [resolveColorNode, resolveDepthNode]);
  const quadMesh = useMemo(() => new QuadMesh(resolveMaterial), [resolveMaterial]);

  // Dummy geometry: no attribute is ever read, the vertex count comes from the
  // GPU-written indirect draw buffer and the vertex stage pulls everything itself.
  const hwGeometry = useMemo(() => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(MAX_HW_TRIANGLES * 9), 3));
    geometry.setIndirect(hwDrawAttribute);
    geometry.boundingSphere = new Sphere(new Vector3(), Infinity);
    return geometry;
  }, [hwDrawAttribute]);

  useEffect(() => {
    uMaterialMode.value = mode === 'Texture' ? 1 : 0;
  }, [mode, uMaterialMode]);

  //* Resize ========================================================
  // The visibility buffers are one word per PIXEL, so they follow the drawing buffer.
  // Layout effect: the storage nodes must point at the new attributes before the next
  // render phase reads them.
  const hwMaterialRef = useRef<NodeMaterial>(null);
  useLayoutEffect(() => {
    const drawingBuffer = renderer.getDrawingBufferSize(new Vector2());
    const pixelCount = drawingBuffer.x * drawingBuffer.y;
    if (pixelCount === screenTriAtomic.bufferCount) return;

    screenTriAtomic.value.dispose();
    screenInstAtomic.value.dispose();

    const screenTriAttribute = new StorageBufferAttribute(new Uint32Array(pixelCount), 1);
    const screenInstAttribute = new StorageBufferAttribute(new Uint32Array(pixelCount), 1);
    for (const [node, attribute] of [
      [screenTriAtomic, screenTriAttribute],
      [screenTriRead, screenTriAttribute],
      [screenInstAtomic, screenInstAttribute],
      [screenInstRead, screenInstAttribute],
    ] as const) {
      node.value = attribute;
      node.bufferCount = pixelCount;
    }

    // Every pipeline that binds one of those buffers has to be rebuilt.
    computeClear.count = pixelCount;
    for (const kernel of [computeClear, computeRasterize, computeFrustum, computeDispatch, computeHwArgs]) {
      kernel.dispose();
    }
    resolveMaterial.dispose();
    hwMaterialRef.current?.dispose();
  }, [
    renderer,
    size,
    screenTriAtomic,
    screenTriRead,
    screenInstAtomic,
    screenInstRead,
    computeClear,
    computeRasterize,
    computeFrustum,
    computeDispatch,
    computeHwArgs,
    resolveMaterial,
  ]);

  //* Frame =========================================================
  // Takes over rendering entirely (`{ phase: 'render' }`) — this example IS about a
  // hand-written rasterizer: five compute passes, then a resolve quad, then the
  // hardware mesh drawn over it without clearing.
  const frustum = useMemo(() => new Frustum(), []);
  const projScreenMatrix = useMemo(() => new Matrix4(), []);

  useFrame(
    ({ camera }) => {
      camera.updateMatrixWorld();
      projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(projScreenMatrix);

      uProjScreenMatrix.value.copy(projScreenMatrix);
      uCameraPos.value.copy(camera.position);
      // projectionMatrix[5] IS cot(fov/2) for a perspective camera.
      uCotHalfFov.value = camera.projectionMatrix.elements[5];
      // Cast: UniformArrayNode types its backing store as `unknown[]` — the element
      // type is only carried on the node's TSL side (typed-TSL gap, B11 family).
      const planeArray = uFrustumPlanes.array as Vector4[];
      frustum.planes.forEach((plane, i) => {
        planeArray[i].set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
      });

      renderer.compute(computeClear);
      renderer.compute(computeFrustum);
      renderer.compute(computeDispatch);
      renderer.compute(computeRasterize, dispatchAttribute);
      renderer.compute(computeHwArgs);

      // Software resolve: fullscreen quad reading the visibility buffer.
      if (rasterizer !== 'HW Only') quadMesh.render(renderer);

      // Hardware pass: real depth testing against the depth the quad just wrote, so it
      // must not clear unless it is the only thing on screen.
      if (rasterizer !== 'SW Only') {
        const hwOnly = rasterizer === 'HW Only';
        scene.background = hwOnly ? BACKGROUND : null;
        renderer.autoClear = hwOnly;
        renderer.render(scene, camera);
        renderer.autoClear = true;
      }
    },
    { phase: 'render' },
  );

  return (
    <mesh geometry={hwGeometry} frustumCulled={false}>
      <nodeMaterial
        ref={hwMaterialRef}
        positionNode={hwPositionNode}
        fragmentNode={hwFragmentNode}
        depthWrite
        depthTest
      />
    </mesh>
  );
}

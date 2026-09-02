// CPU-side construction of the mega mesh the GPU rasterizer reads: six LODs of the
// helmet, each simplified by meshopt and then cut into 64-triangle meshlets with a
// bounding sphere apiece, concatenated into one set of vertex/normal/uv/index buffers.
// Pure and deterministic — after the upload every buffer is GPU-only.
import { MeshoptClusterizer } from 'three/addons/libs/meshopt_clusterizer.module.js';
import { MeshoptSimplifier } from 'three/addons/libs/meshopt_simplifier.module.js';
import type { BufferGeometry } from 'three/webgpu';

/** Both WASM modules initialise once per page; components suspend on this. */
export const MESHOPT_READY = Promise.all([MeshoptClusterizer.ready, MeshoptSimplifier.ready]);

/** One work item = one meshlet = this many triangles, and one rasterizer workgroup. */
export const TRIANGLES_PER_CHUNK = 64;

// Per-LOD simplification: how much of the index buffer to keep, the error budget, and
// how strongly each attribute (normal xyz, uv xy) resists being collapsed.
const LOD_TARGETS = [
  { ratio: 1.0, error: 0.0, weights: [0.25, 0.25, 0.25, 0.5, 0.5], flags: [] as string[] },
  { ratio: 0.55, error: 0.004, weights: [0.2, 0.2, 0.2, 0.35, 0.35], flags: ['RegularizeLight'] },
  { ratio: 0.25, error: 0.015, weights: [0.12, 0.12, 0.12, 0.2, 0.2], flags: ['RegularizeLight'] },
  { ratio: 0.1, error: 0.05, weights: [0.08, 0.08, 0.08, 0.12, 0.12], flags: ['RegularizeLight'] },
  { ratio: 0.04, error: 0.14, weights: [0.04, 0.04, 0.04, 0.06, 0.06], flags: ['Regularize', 'Permissive'] },
  { ratio: 0.015, error: 0.3, weights: [0.02, 0.02, 0.02, 0.03, 0.03], flags: ['Regularize', 'Permissive'] },
];

export const LOD_COUNT = LOD_TARGETS.length;

export interface MegaMesh {
  /** Bounding sphere radius of the source mesh, with a little slack. */
  boundingRadius: number;
  /** World-space geometric error each LOD introduces — the GPU picks with these. */
  lodErrors: number[];
  /** vec4 per LOD-vertex (w = 1, so an mvp mat4 can multiply it directly). */
  vertexArray: Float32Array;
  /** vec4 per LOD-vertex (w unused). */
  normalArray: Float32Array;
  uvArray: Float32Array;
  /** uint per index, already offset into the concatenated vertex buffer. */
  indexArray: Uint32Array;
  /** uint per triangle: which meshlet it belongs to. */
  meshletIdArray: Uint32Array;
  /** vec4 per meshlet: centre xyz + radius, in the helmet's local space. */
  chunkBoundsArray: Float32Array;
  /** Per LOD: triangleStart, triangleCount, chunkStart. */
  lodOffsets: [number, number, number][];
  vertexCount: number;
  indexCount: number;
  chunkCount: number;
}

export function buildHelmetMeshlets(geometry: BufferGeometry): MegaMesh {
  geometry.computeBoundingSphere();
  const boundingRadius = (geometry.boundingSphere?.radius ?? 1) * 1.05;

  const positions = geometry.attributes.position;
  const normals = geometry.attributes.normal;
  const uvs = geometry.attributes.uv;
  const vertexCount = positions.count;
  const positionArray = positions.array as Float32Array;

  // meshopt simplifies over position AND a packed attribute stream, so creases and UV
  // seams survive the collapse.
  const simplifierAttributes = new Float32Array(vertexCount * 5);
  for (let i = 0; i < vertexCount; i++) {
    simplifierAttributes[i * 5 + 0] = normals.getX(i);
    simplifierAttributes[i * 5 + 1] = normals.getY(i);
    simplifierAttributes[i * 5 + 2] = normals.getZ(i);
    simplifierAttributes[i * 5 + 3] = uvs.getX(i);
    simplifierAttributes[i * 5 + 4] = uvs.getY(i);
  }

  const sourceIndices = geometry.index
    ? new Uint32Array(geometry.index.array)
    : new Uint32Array(Array.from({ length: vertexCount }, (_, i) => i));
  const sourceScale = MeshoptSimplifier.getScale(positionArray, 3);

  // Every LOD keeps the FULL vertex list (only the index buffer shrinks), which is what
  // lets one shared vertex/normal/uv buffer serve all six.
  const lods: {
    meshletBuffers: ReturnType<typeof MeshoptClusterizer.buildMeshlets>;
    bounds: ReturnType<typeof MeshoptClusterizer.computeMeshletBounds>;
    error: number;
    chunkCount: number;
    triangleCount: number;
    vertexOffset: number;
  }[] = [];

  let indices = sourceIndices;
  let previousError = 0;
  let chunkCount = 0;

  for (let i = 0; i < LOD_COUNT; i++) {
    let error = previousError;

    if (i > 0) {
      const target = LOD_TARGETS[i];
      const targetIndexCount = Math.max(3, Math.floor((sourceIndices.length * target.ratio) / 3) * 3);
      // Simplify the PREVIOUS LOD's indices, so error accumulates down the chain.
      const [simplifiedIndices, relativeError] = MeshoptSimplifier.simplifyWithAttributes(
        indices,
        positionArray,
        3,
        simplifierAttributes,
        5,
        target.weights,
        null,
        targetIndexCount,
        target.error,
        target.flags,
      );

      if (simplifiedIndices.length >= 3) {
        indices = new Uint32Array(simplifiedIndices);
        error = previousError + relativeError * sourceScale;
      }
    }

    previousError = error;

    const meshletBuffers = MeshoptClusterizer.buildMeshlets(indices, positionArray, 3, 64, TRIANGLES_PER_CHUNK, 0.25);

    lods.push({
      meshletBuffers,
      bounds: MeshoptClusterizer.computeMeshletBounds(meshletBuffers, positionArray, 3),
      error,
      chunkCount: meshletBuffers.meshletCount,
      // Padded so every meshlet is exactly TRIANGLES_PER_CHUNK triangles — the
      // rasterizer dispatches one thread per slot either way.
      triangleCount: meshletBuffers.meshletCount * TRIANGLES_PER_CHUNK,
      vertexOffset: i * vertexCount,
    });
    chunkCount += meshletBuffers.meshletCount;
  }

  const totalVertices = LOD_COUNT * vertexCount;
  const indexCount = chunkCount * TRIANGLES_PER_CHUNK * 3;

  const vertexArray = new Float32Array(totalVertices * 4);
  const normalArray = new Float32Array(totalVertices * 4);
  const uvArray = new Float32Array(totalVertices * 2);
  const indexArray = new Uint32Array(indexCount);
  const meshletIdArray = new Uint32Array(indexCount / 3);
  const chunkBoundsArray = new Float32Array(chunkCount * 4);
  const lodOffsets: [number, number, number][] = [];

  let meshletId = 1;
  let currentChunk = 0;
  let indexOffset = 0;

  for (const lod of lods) {
    const { vertexOffset } = lod;

    for (let v = 0; v < vertexCount; v++) {
      const target = vertexOffset + v;
      vertexArray[target * 4 + 0] = positions.getX(v);
      vertexArray[target * 4 + 1] = positions.getY(v);
      vertexArray[target * 4 + 2] = positions.getZ(v);
      vertexArray[target * 4 + 3] = 1;

      normalArray[target * 4 + 0] = normals.getX(v);
      normalArray[target * 4 + 1] = normals.getY(v);
      normalArray[target * 4 + 2] = normals.getZ(v);

      uvArray[target * 2 + 0] = uvs.getX(v);
      uvArray[target * 2 + 1] = uvs.getY(v);
    }

    lodOffsets.push([indexOffset / 3, lod.triangleCount, currentChunk]);

    for (let m = 0; m < lod.chunkCount; m++) {
      const meshlet = MeshoptClusterizer.extractMeshlet(lod.meshletBuffers, m);
      const meshletTriangles = meshlet.triangles.length / 3;

      for (let t = 0; t < TRIANGLES_PER_CHUNK; t++) {
        const triangle = indexOffset / 3 + m * TRIANGLES_PER_CHUNK + t;

        if (t < meshletTriangles) {
          indexArray[triangle * 3 + 0] = vertexOffset + meshlet.vertices[meshlet.triangles[t * 3 + 0]];
          indexArray[triangle * 3 + 1] = vertexOffset + meshlet.vertices[meshlet.triangles[t * 3 + 1]];
          indexArray[triangle * 3 + 2] = vertexOffset + meshlet.vertices[meshlet.triangles[t * 3 + 2]];
        } else {
          // Pad the meshlet out with a degenerate triangle so every slot is valid.
          const first = vertexOffset + meshlet.vertices[0];
          indexArray[triangle * 3 + 0] = first;
          indexArray[triangle * 3 + 1] = first;
          indexArray[triangle * 3 + 2] = first;
        }

        meshletIdArray[triangle] = meshletId;
      }

      meshletId++;

      const bounds = lod.bounds[m];
      chunkBoundsArray[currentChunk * 4 + 0] = bounds.centerX;
      chunkBoundsArray[currentChunk * 4 + 1] = bounds.centerY;
      chunkBoundsArray[currentChunk * 4 + 2] = bounds.centerZ;
      chunkBoundsArray[currentChunk * 4 + 3] = bounds.radius;
      currentChunk++;
    }

    indexOffset += lod.triangleCount * 3;
  }

  return {
    boundingRadius,
    lodErrors: lods.map((lod) => lod.error),
    vertexArray,
    normalArray,
    uvArray,
    indexArray,
    meshletIdArray,
    chunkBoundsArray,
    lodOffsets,
    vertexCount: totalVertices,
    indexCount,
    chunkCount,
  };
}

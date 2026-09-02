// CPU-side construction of the "mega mesh" the GPU rasterizer reads: seven teapot LODs
// concatenated into ONE set of vertex/uv/index buffers, cut into 64-triangle chunks
// with a precomputed bounding sphere each, and tagged with 126-triangle meshlet ids.
// Pure and deterministic — after the upload every buffer is GPU-only.
import { TeapotGeometry } from 'three/addons/geometries/TeapotGeometry.js';

/** Teapot tessellation per LOD, with the world-space geometric error it introduces. */
const LODS = [
  { segments: 10, error: 0.0 },
  { segments: 8, error: 0.005 },
  { segments: 6, error: 0.015 },
  { segments: 5, error: 0.03 },
  { segments: 4, error: 0.06 },
  { segments: 3, error: 0.1 },
  { segments: 2, error: 0.2 },
];

/** One work item = one chunk = this many triangles, and one rasterizer workgroup. */
export const TRIANGLES_PER_CHUNK = 64;
/** Meshlet size, used only to colour the debug view. */
const TRIANGLES_PER_MESHLET = 126;

export const LOD_COUNT = LODS.length;
/** Screen-space error, in world units, per LOD — the GPU picks with these. */
export const LOD_ERRORS = LODS.map((lod) => lod.error);

export interface MegaMesh {
  /** Triangles in the finest LOD — the per-instance worst case. */
  maxTrianglesPerInstance: number;
  /** vec4 per vertex (w = 1, so an mvp mat4 can multiply it directly). */
  vertexArray: Float32Array;
  /** vec2 per vertex. */
  uvArray: Float32Array;
  /** uint per index, already offset into the concatenated vertex buffer. */
  indexArray: Uint32Array;
  /** uint per triangle: which meshlet it belongs to. */
  meshletIdArray: Uint32Array;
  /** vec4 per chunk: centre xyz + radius, in the teapot's local space. */
  chunkBoundsArray: Float32Array;
  /** uvec4 per LOD: triangleStart, triangleCount, chunkStart, 0. */
  lodOffsetsArray: Uint32Array;
  vertexCount: number;
  indexCount: number;
  chunkCount: number;
}

export function buildMegaMesh(): MegaMesh {
  // Flatten each LOD into plain arrays first, recording where it lands in the
  // concatenated buffers.
  let vertexCount = 0;
  let indexCount = 0;
  let chunkCount = 0;

  const lods = LODS.map((lod) => {
    const geometry = new TeapotGeometry(1, lod.segments);
    const positions = geometry.attributes.position;
    const uvs = geometry.attributes.uv;
    const indices = geometry.index
      ? Array.from(geometry.index.array)
      : Array.from({ length: positions.count }, (_, i) => i);

    const entry = {
      positions,
      uvs,
      indices,
      vertexOffset: vertexCount,
      indexOffset: indexCount,
      chunkStart: chunkCount,
      triangleCount: indices.length / 3,
      chunkCount: Math.ceil(indices.length / 3 / TRIANGLES_PER_CHUNK),
    };

    vertexCount += positions.count;
    indexCount += indices.length;
    chunkCount += entry.chunkCount;
    return entry;
  });

  const vertexArray = new Float32Array(vertexCount * 4);
  const uvArray = new Float32Array(vertexCount * 2);
  const indexArray = new Uint32Array(indexCount);
  const meshletIdArray = new Uint32Array(indexCount / 3);
  const chunkBoundsArray = new Float32Array(chunkCount * 4);
  const lodOffsetsArray = new Uint32Array(LODS.length * 4);

  let meshletId = 1;

  for (const [lodIndex, lod] of lods.entries()) {
    const { positions, uvs, indices, vertexOffset, indexOffset } = lod;

    for (let i = 0; i < positions.count; i++) {
      const v = vertexOffset + i;
      vertexArray[v * 4 + 0] = positions.getX(i);
      vertexArray[v * 4 + 1] = positions.getY(i);
      vertexArray[v * 4 + 2] = positions.getZ(i);
      vertexArray[v * 4 + 3] = 1;
      if (uvs) {
        uvArray[v * 2 + 0] = uvs.getX(i);
        uvArray[v * 2 + 1] = uvs.getY(i);
      }
    }

    let trianglesInMeshlet = 0;
    for (let t = 0; t < lod.triangleCount; t++) {
      const triangle = indexOffset / 3 + t;
      indexArray[triangle * 3 + 0] = vertexOffset + indices[t * 3 + 0];
      indexArray[triangle * 3 + 1] = vertexOffset + indices[t * 3 + 1];
      indexArray[triangle * 3 + 2] = vertexOffset + indices[t * 3 + 2];

      if (trianglesInMeshlet >= TRIANGLES_PER_MESHLET) {
        meshletId++;
        trianglesInMeshlet = 0;
      }
      meshletIdArray[triangle] = meshletId;
      trianglesInMeshlet++;
    }
    meshletId++;

    // Bounding sphere per chunk — this is what the GPU frustum-culls per cluster.
    for (let c = 0; c < lod.chunkCount; c++) {
      const startTriangle = c * TRIANGLES_PER_CHUNK;
      const endTriangle = Math.min(startTriangle + TRIANGLES_PER_CHUNK, lod.triangleCount);

      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (let t = startTriangle * 3; t < endTriangle * 3; t++) {
        const index = indices[t];
        cx += positions.getX(index);
        cy += positions.getY(index);
        cz += positions.getZ(index);
      }
      const sampleCount = (endTriangle - startTriangle) * 3;
      cx /= sampleCount;
      cy /= sampleCount;
      cz /= sampleCount;

      let maxDistanceSq = 0;
      for (let t = startTriangle * 3; t < endTriangle * 3; t++) {
        const index = indices[t];
        const dx = positions.getX(index) - cx;
        const dy = positions.getY(index) - cy;
        const dz = positions.getZ(index) - cz;
        maxDistanceSq = Math.max(maxDistanceSq, dx * dx + dy * dy + dz * dz);
      }

      const chunk = lod.chunkStart + c;
      chunkBoundsArray[chunk * 4 + 0] = cx;
      chunkBoundsArray[chunk * 4 + 1] = cy;
      chunkBoundsArray[chunk * 4 + 2] = cz;
      chunkBoundsArray[chunk * 4 + 3] = Math.sqrt(maxDistanceSq);
    }

    lodOffsetsArray[lodIndex * 4 + 0] = indexOffset / 3;
    lodOffsetsArray[lodIndex * 4 + 1] = lod.triangleCount;
    lodOffsetsArray[lodIndex * 4 + 2] = lod.chunkStart;
  }

  return {
    maxTrianglesPerInstance: lods[0].triangleCount,
    vertexArray,
    uvArray,
    indexArray,
    meshletIdArray,
    chunkBoundsArray,
    lodOffsetsArray,
    vertexCount,
    indexCount,
    chunkCount,
  };
}

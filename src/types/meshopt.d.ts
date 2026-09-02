// three r185 ships the meshopt clusterizer and simplifier as plain .js with NO
// declaration file in @types/three, so importing them is a TS7016 under `strict`.
// This declares only the surface `compute-rasterizer-ibl` uses; when @types/three
// catches up, delete the file.
declare module 'three/addons/libs/meshopt_clusterizer.module.js' {
  /** Packed meshlet output: `meshlets` is 4 uints per meshlet (vertexOffset, triangleOffset, vertexCount, triangleCount). */
  export interface MeshletBuffers {
    meshlets: Uint32Array;
    vertices: Uint32Array;
    triangles: Uint8Array;
    meshletCount: number;
  }

  /** One meshlet's slice of the packed buffers: local triangle indices into `vertices`. */
  export interface Meshlet {
    vertices: Uint32Array;
    triangles: Uint8Array;
  }

  /** meshopt_Bounds — only the bounding sphere is used here. */
  export interface MeshletBounds {
    centerX: number;
    centerY: number;
    centerZ: number;
    radius: number;
    coneApexX: number;
    coneApexY: number;
    coneApexZ: number;
    coneAxisX: number;
    coneAxisY: number;
    coneAxisZ: number;
    coneCutoff: number;
  }

  export const MeshoptClusterizer: {
    readonly supported: boolean;
    readonly ready: Promise<void>;
    buildMeshlets(
      indices: Uint32Array,
      vertexPositions: Float32Array,
      vertexPositionsStride: number,
      maxVertices: number,
      maxTriangles: number,
      coneWeight: number,
    ): MeshletBuffers;
    computeMeshletBounds(
      buffers: MeshletBuffers,
      vertexPositions: Float32Array,
      vertexPositionsStride: number,
    ): MeshletBounds[];
    extractMeshlet(buffers: MeshletBuffers, index: number): Meshlet;
  };
}

declare module 'three/addons/libs/meshopt_simplifier.module.js' {
  export const MeshoptSimplifier: {
    readonly supported: boolean;
    readonly ready: Promise<void>;
    /** Returns [ simplified indices, relative error ]. */
    simplifyWithAttributes(
      indices: Uint32Array,
      vertexPositions: Float32Array,
      vertexPositionsStride: number,
      vertexAttributes: Float32Array,
      vertexAttributesStride: number,
      attributeWeights: number[],
      vertexLock: Uint8Array | null,
      targetIndexCount: number,
      targetError: number,
      flags?: string[],
    ): [Uint32Array, number];
    /** Scale factor that turns a relative simplification error into world units. */
    getScale(vertexPositions: Float32Array, vertexPositionsStride: number): number;
  };
}

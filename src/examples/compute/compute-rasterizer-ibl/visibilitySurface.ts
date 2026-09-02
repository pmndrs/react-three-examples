// The shading half of the demo: turning "which triangle of which instance" back into a
// lit surface. Everything here is pure node-graph construction, built once and handed
// to the two meshes that draw it — the fullscreen resolve pass and the hardware
// fallback mesh, which have to agree pixel for pixel where they meet.
import {
  cameraViewMatrix,
  cross,
  dFdx,
  dFdy,
  Discard,
  float,
  Fn,
  If,
  min,
  normalize,
  positionGeometry,
  screenCoordinate,
  screenSize,
  sign,
  sqrt,
  texture,
  uint,
  varyingProperty,
  vec2,
  vec4,
  vertexIndex,
} from 'three/tsl';
import type { Node, StorageBufferNode, Texture } from 'three/webgpu';

/** Visibility-buffer packing: depth in the bits ABOVE each payload. */
export const TRIANGLE_INDEX_BITS = 16;
export const INSTANCE_INDEX_BITS = 17;
export const TRIANGLE_INDEX_MASK = 2 ** TRIANGLE_INDEX_BITS - 1;
export const INSTANCE_INDEX_MASK = 2 ** INSTANCE_INDEX_BITS - 1;
export const DEPTH_TRI_MAX = 2 ** (32 - TRIANGLE_INDEX_BITS) - 1;
export const DEPTH_INST_MAX = 2 ** (32 - INSTANCE_INDEX_BITS) - 1;

// Specular antialiasing (Tokuyoshi & Kaplanyan): widen roughness by the normal's
// screen-space variance so sub-pixel geometry stops aliasing into fireflies. Shared by
// both rasterizer paths so their roughness matches where the paths meet.
const SPECULAR_AA_VARIANCE = 2.0;
const SPECULAR_AA_MAX = 0.2;

/** The glTF material's texture set. */
export interface HelmetMaps {
  map: Texture;
  normalMap: Texture;
  /** glTF packs roughness in g and metalness in b. */
  roughnessMap: Texture;
  aoMap: Texture;
  emissiveMap: Texture;
}

export interface VisibilitySurfaceProps {
  maps: HelmetMaps;
  vertexBuffer: StorageBufferNode<'vec4'>;
  normalBuffer: StorageBufferNode<'vec4'>;
  uvBuffer: StorageBufferNode<'vec2'>;
  indexBuffer: StorageBufferNode<'uint'>;
  meshletIdBuffer: StorageBufferNode<'uint'>;
  instanceWorldRead: StorageBufferNode<'mat4'>;
  hwQueueRead: StorageBufferNode<'uint'>;
  screenTriRead: StorageBufferNode<'uint'>;
  screenInstRead: StorageBufferNode<'uint'>;
  uProjScreenMatrix: Node<'mat4'>;
  /** 0 = shaded, 1..7 = a single material channel. */
  uOutputMode: Node<'uint'>;
}

/** Signed screen-space area of a triangle — also the barycentric weight generator. */
const edgeFunction = (a: Node<'vec2'>, b: Node<'vec2'>, c: Node<'vec2'>) =>
  c.y
    .sub(a.y)
    .mul(b.x.sub(a.x))
    .sub(c.x.sub(a.x).mul(b.y.sub(a.y)));

/** PCG-style hash → a stable colour per meshlet. Always called inside an Fn body. */
const hashColor = (idIn: Node<'uint'>) => {
  let id: Node<'uint'> = uint(idIn).toVar();
  id = id.mul(uint(747796405)).add(uint(289559509));
  id = id.shiftRight(16).bitXor(id).mul(uint(277803737));
  id = id.shiftRight(16).bitXor(id);

  const channel = (shift: number) =>
    float(id.shiftRight(shift).bitAnd(uint(255)))
      .div(255)
      .mul(0.8)
      .add(0.2);
  return vec4(channel(0), channel(8), channel(16), 1);
};

/**
 * Tangent frame from the triangle's own world-space edges and UVs. The mega buffer has
 * no tangent attribute, and a visibility buffer has no vertex stage to interpolate one.
 */
const computeTangent = (
  w0: Node<'vec3'>,
  w1: Node<'vec3'>,
  w2: Node<'vec3'>,
  uv0: Node<'vec2'>,
  uv1: Node<'vec2'>,
  uv2: Node<'vec2'>,
  normal: Node<'vec3'>,
) => {
  const dp1 = w1.sub(w0);
  const dp2 = w2.sub(w0);
  const duv1 = uv1.sub(uv0);
  const duv2 = uv2.sub(uv0);

  const determinant = duv1.x.mul(duv2.y).sub(duv1.y.mul(duv2.x));
  const tangent = dp1.mul(duv2.y).sub(dp2.mul(duv1.y)).mul(sign(determinant));

  // Orthonormalise against the (smooth) normal.
  return normalize(tangent.sub(normal.mul(normal.dot(tangent))));
};

const applyNormalMap = (normal: Node<'vec3'>, tangent: Node<'vec3'>, sample: Node<'vec4'>) => {
  const bitangent = cross(normal, tangent);
  const mapNormal = sample.xyz.mul(2).sub(1);
  return normalize(tangent.mul(mapNormal.x).add(bitangent.mul(mapNormal.y)).add(normal.mul(mapNormal.z)));
};

/** One material channel, unlit — the debug outputs the Output menu selects. */
const visualiseChannel = (
  outputMode: Node<'uint'>,
  normal: Node<'vec3'>,
  mappedNormal: Node<'vec3'>,
  uv: Node<'vec2'>,
  roughness: Node<'float'>,
  metalness: Node<'float'>,
  ao: Node<'float'>,
  emissive: Node<'vec3'>,
) =>
  Fn(() => {
    const result = vec4(0).toVar();
    If(outputMode.equal(1), () => {
      result.assign(vec4(normal.mul(0.5).add(0.5), 1));
    })
      .ElseIf(outputMode.equal(2), () => {
        result.assign(vec4(mappedNormal.mul(0.5).add(0.5), 1));
      })
      .ElseIf(outputMode.equal(3), () => {
        result.assign(vec4(uv, 0, 1));
      })
      .ElseIf(outputMode.equal(4), () => {
        result.assign(vec4(roughness, roughness, roughness, 1));
      })
      .ElseIf(outputMode.equal(5), () => {
        result.assign(vec4(metalness, metalness, metalness, 1));
      })
      .ElseIf(outputMode.equal(6), () => {
        result.assign(vec4(ao, ao, ao, 1));
      })
      .ElseIf(outputMode.equal(7), () => {
        result.assign(vec4(emissive, 1));
      });
    return result;
  })();

export function buildVisibilitySurface({
  maps,
  vertexBuffer,
  normalBuffer,
  uvBuffer,
  indexBuffer,
  meshletIdBuffer,
  instanceWorldRead,
  hwQueueRead,
  screenTriRead,
  screenInstRead,
  uProjScreenMatrix,
  uOutputMode,
}: VisibilitySurfaceProps) {
  //* Hardware path ================================================
  // Big triangles the software rasterizer refused. The vertex stage pulls everything
  // out of storage by `vertexIndex`, so the geometry is a dummy buffer.
  const vInstId = varyingProperty<'uint'>('uint', 'vInstId');
  const vMegaTriIdx = varyingProperty<'uint'>('uint', 'vMegaTriIdx');
  const vUv = varyingProperty<'vec2'>('vec2', 'vUv');
  const vNormal = varyingProperty<'vec3'>('vec3', 'vNormal');
  const vTangent = varyingProperty<'vec3'>('vec3', 'vTangent');

  const hwPositionNode = Fn(() => {
    const triangleIndex = vertexIndex.div(3);
    const localVertex = vertexIndex.mod(3);

    // Queue layout: slot 0 is the atomic counter, then [instanceId, triangleIndex].
    const slot = triangleIndex.mul(2).add(1);
    const instanceId = hwQueueRead.element(slot);
    const megaTriangleIndex = hwQueueRead.element(slot.add(1));

    const matrixWorld = instanceWorldRead.element(instanceId);
    const indexOffset = megaTriangleIndex.mul(3);

    const i0 = indexBuffer.element(indexOffset);
    const i1 = indexBuffer.element(indexOffset.add(1));
    const i2 = indexBuffer.element(indexOffset.add(2));

    // All three corners, because the tangent frame needs the whole triangle.
    const w0 = matrixWorld.mul(vertexBuffer.element(i0)).xyz;
    const w1 = matrixWorld.mul(vertexBuffer.element(i1)).xyz;
    const w2 = matrixWorld.mul(vertexBuffer.element(i2)).xyz;

    const globalVertex = indexBuffer.element(indexOffset.add(localVertex));
    const worldPosition = localVertex.equal(1).select(w1, localVertex.equal(2).select(w2, w0));
    const worldNormal = normalize(matrixWorld.mul(vec4(normalBuffer.element(globalVertex).xyz, 0)).xyz);

    const uv0 = uvBuffer.element(i0);
    const uv1 = uvBuffer.element(i1);
    const uv2 = uvBuffer.element(i2);

    vInstId.assign(instanceId);
    vMegaTriIdx.assign(megaTriangleIndex);
    vUv.assign(localVertex.equal(1).select(uv1, localVertex.equal(2).select(uv2, uv0)));
    vNormal.assign(worldNormal);
    vTangent.assign(computeTangent(w0, w1, w2, uv0, uv1, uv2, worldNormal));

    return worldPosition;
  })();

  const sampleHw = (map: Texture) => texture(map, vUv);

  const hwNormal = normalize(vNormal);
  // Hardware derivatives are valid here: this path IS a normal triangle raster.
  const hwDNdx = dFdx(hwNormal);
  const hwDNdy = dFdy(hwNormal);
  const hwKernelRoughness = min(hwDNdx.dot(hwDNdx).add(hwDNdy.dot(hwDNdy)).mul(SPECULAR_AA_VARIANCE), SPECULAR_AA_MAX);
  const hwMetalRough = sampleHw(maps.roughnessMap);
  const hwMappedNormal = applyNormalMap(hwNormal, normalize(vTangent), sampleHw(maps.normalMap));

  const hwShadedNodes = {
    positionNode: hwPositionNode,
    colorNode: sampleHw(maps.map),
    normalNode: hwMappedNormal.transformDirection(cameraViewMatrix),
    roughnessNode: sqrt(hwMetalRough.g.mul(hwMetalRough.g).add(hwKernelRoughness)),
    metalnessNode: hwMetalRough.b,
    aoNode: sampleHw(maps.aoMap).r,
    emissiveNode: sampleHw(maps.emissiveMap).rgb,
  };

  const hwDebugFragmentNode = Fn(() => hashColor(meshletIdBuffer.element(vMegaTriIdx).add(vInstId.mul(1000))))();

  const hwVisFragmentNode = visualiseChannel(
    uOutputMode,
    hwNormal,
    hwMappedNormal,
    vUv,
    hwMetalRough.g,
    hwMetalRough.b,
    sampleHw(maps.aoMap).r,
    sampleHw(maps.emissiveMap).rgb,
  );

  //* Resolve path =================================================
  // A fullscreen triangle drawn through the SCENE camera: `vertexNode` puts it in clip
  // space while the standard lighting pipeline still runs per fragment, so the
  // reconstructed surface can be lit by the environment like any other material.

  // The rasterizer addresses the screen bottom-up, screenCoordinate is top-down.
  const flippedY = float(screenSize.y).sub(screenCoordinate.y);
  const pixelIndex = uint(flippedY).mul(uint(screenSize.x)).add(uint(screenCoordinate.x));

  const packedTri = screenTriRead.element(pixelIndex);
  const megaTriangleIndex = packedTri.bitAnd(TRIANGLE_INDEX_MASK);
  const instanceId = screenInstRead.element(pixelIndex).bitAnd(INSTANCE_INDEX_MASK);

  const i0 = indexBuffer.element(megaTriangleIndex.mul(3));
  const i1 = indexBuffer.element(megaTriangleIndex.mul(3).add(1));
  const i2 = indexBuffer.element(megaTriangleIndex.mul(3).add(2));

  const matrixWorld = instanceWorldRead.element(instanceId);
  const w0 = matrixWorld.mul(vertexBuffer.element(i0)).xyz;
  const w1 = matrixWorld.mul(vertexBuffer.element(i1)).xyz;
  const w2 = matrixWorld.mul(vertexBuffer.element(i2)).xyz;

  const uv0 = uvBuffer.element(i0);
  const uv1 = uvBuffer.element(i1);
  const uv2 = uvBuffer.element(i2);

  // Re-project the triangle to find where this pixel sits inside it.
  const p0 = uProjScreenMatrix.mul(vec4(w0, 1));
  const p1 = uProjScreenMatrix.mul(vec4(w1, 1));
  const p2 = uProjScreenMatrix.mul(vec4(w2, 1));

  const s0 = p0.xy.div(p0.w).add(1).mul(0.5).mul(screenSize);
  const s1 = p1.xy.div(p1.w).add(1).mul(0.5).mul(screenSize);
  const s2 = p2.xy.div(p2.w).add(1).mul(0.5).mul(screenSize);
  const pixel = vec2(screenCoordinate.x, flippedY);

  const area = edgeFunction(s0, s1, s2);
  const e0 = edgeFunction(s1, s2, pixel);
  const e1 = edgeFunction(s2, s0, pixel);
  const e2 = edgeFunction(s0, s1, pixel);

  const safeArea = area.equal(0).select(1, area);
  const b0 = e0.div(safeArea);
  const b1 = e1.div(safeArea);
  const b2 = e2.div(safeArea);

  // Perspective-correct weights from the clip-space w's.
  const zInv = b0.div(p0.w).add(b1.div(p1.w)).add(b2.div(p2.w));
  const safeZInv = zInv.equal(0).select(1, zInv);
  const c0 = b0.div(p0.w).div(safeZInv);
  const c1 = b1.div(p1.w).div(safeZInv);
  const c2 = b2.div(p2.w).div(safeZInv);

  const uvInterp = uv0.mul(c0).add(uv1.mul(c1)).add(uv2.mul(c2));

  const n0 = matrixWorld.mul(vec4(normalBuffer.element(i0).xyz, 0)).xyz;
  const n1 = matrixWorld.mul(vec4(normalBuffer.element(i1).xyz, 0)).xyz;
  const n2 = matrixWorld.mul(vec4(normalBuffer.element(i2).xyz, 0)).xyz;
  const normalInterp = normalize(n0.mul(c0).add(n1.mul(c1)).add(n2.mul(c2)));

  const worldPosition = w0.mul(c0).add(w1.mul(c1)).add(w2.mul(c2));
  const positionViewHelmet = cameraViewMatrix.mul(vec4(worldPosition, 1)).xyz;
  const positionViewDirectionHelmet = positionViewHelmet.negate().normalize();

  // Analytic screen-space derivatives. dFdx/dFdy would read neighbouring fragments,
  // which belong to different triangles in a visibility buffer.
  const q0 = float(1).div(p0.w);
  const q1 = float(1).div(p1.w);
  const q2 = float(1).div(p2.w);
  const sumWq = e0.mul(q0).add(e1.mul(q1)).add(e2.mul(q2));
  const safeSumWq = sumWq.equal(0).select(1, sumWq);

  const gradientX = <T extends Node<'vec2'> | Node<'vec3'>>(v0: T, v1: T, v2: T, centre: T) =>
    s2.y
      .sub(s1.y)
      .mul(q0)
      .mul(v0.sub(centre))
      .add(s0.y.sub(s2.y).mul(q1).mul(v1.sub(centre)))
      .add(s1.y.sub(s0.y).mul(q2).mul(v2.sub(centre)))
      .div(safeSumWq);

  const gradientY = <T extends Node<'vec2'> | Node<'vec3'>>(v0: T, v1: T, v2: T, centre: T) =>
    s1.x
      .sub(s2.x)
      .mul(q0)
      .mul(v0.sub(centre))
      .add(s2.x.sub(s0.x).mul(q1).mul(v1.sub(centre)))
      .add(s0.x.sub(s1.x).mul(q2).mul(v2.sub(centre)))
      .div(safeSumWq);

  const dUvDx = gradientX(uv0, uv1, uv2, uvInterp);
  const dUvDy = gradientY(uv0, uv1, uv2, uvInterp);
  const sampleResolve = (map: Texture) => texture(map, uvInterp).grad(dUvDx, dUvDy);

  const dNdx = gradientX(n0, n1, n2, normalInterp);
  const dNdy = gradientY(n0, n1, n2, normalInterp);
  const kernelRoughness = min(dNdx.dot(dNdx).add(dNdy.dot(dNdy)).mul(SPECULAR_AA_VARIANCE), SPECULAR_AA_MAX);

  /** Pixels the rasterizer never covered fall through to the background. */
  const covered = <T>(colorNode: T) =>
    Fn(() => {
      If(packedTri.shiftRight(TRIANGLE_INDEX_BITS).equal(0), () => {
        Discard();
      });
      return colorNode;
    })();

  // Republishes the software rasterizer's depth so the hardware mesh, drawn after,
  // depth-tests against it.
  const resolveDepthNode = Fn(() => {
    const depth = float(packedTri.shiftRight(TRIANGLE_INDEX_BITS)).div(DEPTH_TRI_MAX);
    // Undo the fourth root the rasterizer stored.
    const squared = depth.mul(depth);
    return float(1).sub(squared.mul(squared));
  })();

  const resolveVertexNode = vec4(positionGeometry.xy, 0, 1);
  const resolveMetalRough = sampleResolve(maps.roughnessMap);
  const resolveTangent = computeTangent(w0, w1, w2, uv0, uv1, uv2, normalInterp);
  const resolveMappedNormal = applyNormalMap(normalInterp, resolveTangent, sampleResolve(maps.normalMap));

  return {
    hwPositionNode,
    hwShadedNodes,
    hwDebugFragmentNode,
    hwVisFragmentNode,

    resolveVertexNode,
    resolveDepthNode,
    /**
     * The lighting pipeline derives view position from the fullscreen triangle's own
     * vertices, which are meaningless here — override it with the position
     * reconstructed from the visibility buffer.
     */
    resolveOverrides: [positionViewHelmet, positionViewDirectionHelmet] as const,
    resolveShadedNodes: {
      colorNode: covered(sampleResolve(maps.map)),
      normalNode: resolveMappedNormal.transformDirection(cameraViewMatrix),
      roughnessNode: sqrt(resolveMetalRough.g.mul(resolveMetalRough.g).add(kernelRoughness)),
      metalnessNode: resolveMetalRough.b,
      aoNode: sampleResolve(maps.aoMap).r,
      emissiveNode: sampleResolve(maps.emissiveMap).rgb,
    },
    resolveDebugFragmentNode: covered(hashColor(meshletIdBuffer.element(megaTriangleIndex).add(instanceId.mul(1000)))),
    resolveVisFragmentNode: covered(
      visualiseChannel(
        uOutputMode,
        normalInterp,
        resolveMappedNormal,
        uvInterp,
        resolveMetalRough.g,
        resolveMetalRough.b,
        sampleResolve(maps.aoMap).r,
        sampleResolve(maps.emissiveMap).rgb,
      ),
    ),
  };
}

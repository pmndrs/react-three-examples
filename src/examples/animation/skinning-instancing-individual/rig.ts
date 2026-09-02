// CPU-side rig construction — the original's per-instance body-proportion data, the
// belly-morph source-vertex packing, and the foot-grounding math. Pure and
// deterministic (no React, no TSL): this is exactly the data the compute kernel in
// `Herd.tsx` uploads once (or, for the two per-instance transforms, refreshes every
// frame) as GPU storage buffers.
import { Object3D, StorageBufferAttribute, Vector3 } from 'three/webgpu';
import type { Bone, BufferGeometry, Mesh } from 'three/webgpu';

export const INSTANCE_COUNT = 30;

interface BodyType {
  width: number;
  height: number;
  depth: number;
  belly: number;
  headScale: number;
  bellyWidth: number;
  chestWidth: number;
  armLength: number;
  legLength: number;
}

export interface Variation extends BodyType {
  size: number;
  x: number;
  y: number;
}

// Five hand-tuned body shapes, cycled across the herd — ported verbatim from the
// original's `bodyTypes` array.
const BODY_TYPES: BodyType[] = [
  {
    width: 0.92,
    height: 1.09,
    depth: 0.92,
    belly: 0,
    headScale: 0.96,
    bellyWidth: 0.98,
    chestWidth: 0.98,
    armLength: 1.03,
    legLength: 1.04,
  },
  {
    width: 1.0,
    height: 1.05,
    depth: 0.99,
    belly: 0,
    headScale: 0.98,
    bellyWidth: 1.0,
    chestWidth: 1.03,
    armLength: 1.02,
    legLength: 1.02,
  },
  {
    width: 1.0,
    height: 1.0,
    depth: 1.0,
    belly: 0,
    headScale: 1.0,
    bellyWidth: 1.0,
    chestWidth: 1.0,
    armLength: 1.0,
    legLength: 1.0,
  },
  {
    width: 1.08,
    height: 0.9,
    depth: 1.1,
    belly: 0.75,
    headScale: 1.06,
    bellyWidth: 1.12,
    chestWidth: 1.0,
    armLength: 0.9,
    legLength: 0.9,
  },
  {
    width: 1.2,
    height: 0.8,
    depth: 1.22,
    belly: 1.6,
    headScale: 1.12,
    bellyWidth: 1.24,
    chestWidth: 1.04,
    armLength: 0.72,
    legLength: 0.7,
  },
];

// Two concentric rings (10 inner @ r175, 20 outer @ r340), body type cycling every 5,
// and a child/adult size split every other instance — ported verbatim from the
// original's instance-building loop.
export function buildVariations(instanceCount: number): Variation[] {
  const variations: Variation[] = [];

  for (let i = 0; i < instanceCount; i++) {
    const bodyType = BODY_TYPES[i % BODY_TYPES.length];
    const isChild = i % 2 === 0;
    const size = isChild ? (i % 4 === 0 ? 0.68 : 0.78) : 1;
    const innerRing = i < 10;
    const ringIndex = innerRing ? i : i - 10;
    const ringCount = innerRing ? 10 : 20;
    const angle = (ringIndex / ringCount) * Math.PI * 2;
    const radius = innerRing ? 175 : 340;

    variations.push({
      ...bodyType,
      size,
      x: Math.sin(angle) * radius,
      y: Math.cos(angle) * radius,
    });
  }

  return variations;
}

export interface ProportionBones {
  head: Bone;
  belly: Bone;
  chest: Bone;
  arms: Bone[];
  legs: Bone[];
  baseScales: Vector3[];
}

// Scales specific skeleton bones directly, per-instance, right before that
// instance's pose is baked — ported verbatim from the original's applyProportions().
export function applyProportions(bones: ProportionBones, variation: Variation) {
  const { head, belly, chest, arms, legs, baseScales } = bones;
  const allBones = [head, belly, chest, ...arms, ...legs];
  for (let i = 0; i < allBones.length; i++) allBones[i].scale.copy(baseScales[i]);

  head.scale.multiplyScalar(variation.headScale);
  belly.scale.x *= variation.bellyWidth;
  belly.scale.z *= variation.bellyWidth;
  chest.scale.x *= variation.chestWidth;
  chest.scale.z *= variation.chestWidth;

  for (const bone of arms) bone.scale.y *= variation.armLength;
  for (const bone of legs) bone.scale.y *= variation.legLength;
}

// Scratch vectors reused across the per-frame/per-instance foot lookup (no
// allocation in the hot loop).
const leftFootScratch = new Vector3();
const rightFootScratch = new Vector3();

// The reference skeleton's current foot depth (mesh-local Z), used both once at
// setup (to compute `groundFoot`) and every instance every frame (to re-ground that
// instance's feet after its own proportions/pose are applied).
export function getFootCoordinate(referenceMesh: Mesh, footBones: [Bone, Bone]) {
  footBones[0].getWorldPosition(leftFootScratch);
  footBones[1].getWorldPosition(rightFootScratch);
  referenceMesh.worldToLocal(leftFootScratch);
  referenceMesh.worldToLocal(rightFootScratch);
  return Math.max(leftFootScratch.z, rightFootScratch.z);
}

// Scratch object reused across the per-frame instance-matrix bake (no allocation).
const dummyTransform = new Object3D();

// Bakes instance `index`'s root transform (position grounds the feet at `groundFoot`,
// scale carries the body-type proportions) into `instanceMatrices` — ported verbatim
// from the original's updateInstanceMatrix().
export function updateInstanceMatrix(
  instanceMatrices: StorageBufferAttribute,
  index: number,
  variation: Variation,
  groundFoot: number,
  referenceMesh: Mesh,
  footBones: [Bone, Bone],
) {
  const foot = getFootCoordinate(referenceMesh, footBones);

  dummyTransform.position.set(variation.x, variation.y, groundFoot - foot * variation.height * variation.size);
  dummyTransform.scale.set(variation.width, variation.depth, variation.height).multiplyScalar(variation.size);
  dummyTransform.updateMatrix();
  dummyTransform.matrix.toArray(instanceMatrices.array, index * 16);
}

// Packs each vertex's rest position/normal AND its belly-morph target position into
// ONE StorageBufferAttribute (3 vec4s/vertex: position, normal, bellyPosition) — the
// compute kernel blends rest -> belly per-instance via a scalar weight. Ported
// verbatim from the original's createSourceVertexAttribute().
export function createSourceVertexAttribute(geometry: BufferGeometry) {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const bellyPosition = position.clone();
  const data = new Float32Array(position.count * 12);

  for (let i = 0; i < position.count; i++) {
    const amount = Math.max(0, 1 - Math.abs(position.getY(i) - 0.94) / 0.3) * 0.8;

    bellyPosition.setXYZ(i, position.getX(i) * amount, 0, position.getZ(i) * amount);

    const offset = i * 12;
    data[offset + 0] = position.getX(i);
    data[offset + 1] = position.getY(i);
    data[offset + 2] = position.getZ(i);
    data[offset + 4] = normal.getX(i);
    data[offset + 5] = normal.getY(i);
    data[offset + 6] = normal.getZ(i);
    data[offset + 8] = bellyPosition.getX(i);
    data[offset + 9] = bellyPosition.getY(i);
    data[offset + 10] = bellyPosition.getZ(i);
  }

  return new StorageBufferAttribute(data, 4);
}

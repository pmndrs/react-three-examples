// Herd — the compute-instanced skinning rig: loads Michelle once, then computes 30
// independently-posed, independently-proportioned instances of her from ONE shared
// skeleton. Per frame: the shared AnimationMixer is scrubbed to each instance's own
// clip phase, that instance's body-proportion bone scales are applied (`rig.ts`), and
// the resulting bone matrices + root transform are baked into two GPU storage
// buffers. One compute kernel per skinned sub-mesh (Michelle.glb ships several) then
// skins EVERY (instance, vertex) pair on the GPU and writes the result into a plain
// `attributeArray` that `positionNode`/`normalNode` read directly — replacing the
// standard one-skeleton skinning pipeline, which has no way to pose the same
// geometry differently per instance.
//
// This is a showcased, heavily imperative escape hatch (matches `compute-geometry`'s
// `JellyHead` and `skinning-instancing`'s manual-instancing pattern): the compute
// graph, the storage buffers and the per-frame instance loop ARE the demo, so they
// stay visible here rather than hidden behind a helper.
import { useEffect, useMemo } from 'react';
import {
  Fn,
  add,
  attributeArray,
  instanceIndex,
  storage,
  transformNormal,
  transformNormalToView,
  uint,
  uniform,
  vec4,
  vertexIndex,
} from 'three/tsl';
import { Mesh, StorageBufferAttribute } from 'three/webgpu';
import type { Bone, Material, Skeleton, SkinnedMesh, StorageBufferNode } from 'three/webgpu';
import { useFrame, useThree } from '@react-three/fiber/webgpu';
import { useAnimations, useGLTF } from '@react-three/drei/webgpu';
import {
  INSTANCE_COUNT,
  applyProportions,
  buildVariations,
  createSourceVertexAttribute,
  getFootCoordinate,
  updateInstanceMatrix,
  type ProportionBones,
} from './rig';

const MICHELLE_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/Michelle.glb';

interface SkeletonState {
  skeleton: Skeleton;
  boneCount: number;
  boneMatrices: StorageBufferAttribute;
  boneMatricesNode: StorageBufferNode<'mat4'>;
}

export function Herd() {
  const renderer = useThree((s) => s.renderer);
  const { scene, animations } = useGLTF(MICHELLE_URL);
  const { actions, mixer } = useAnimations(animations, scene);

  useEffect(() => {
    // Play BY NAME (corpus rule) — the mixer only advances actions that are
    // playing, even though every frame explicitly scrubs it with `setTime` below.
    const name = animations[0]?.name;
    if (name) actions[name]?.play();
  }, [actions, animations]);

  // Everything below closes over the SUSPENDED `scene` (plain useMemo, not
  // useNodes — same rationale as compute-geometry's JellyHead: nothing here needs
  // the fiber store, only the loaded model).
  const rig = useMemo(() => {
    const object = scene;
    const duration = animations[0]?.duration ?? 0;

    const skinnedMeshes: SkinnedMesh[] = [];
    object.traverse((child) => {
      if ((child as SkinnedMesh).isSkinnedMesh) skinnedMeshes.push(child as SkinnedMesh);
    });

    const referenceMesh = skinnedMeshes[0];
    const skeleton = referenceMesh.skeleton;
    const getBone = (name: string) => skeleton.bones.find((bone) => bone.name.endsWith(name)) as Bone;

    const proportionTargets = [
      getBone('Head'),
      getBone('Spine'),
      getBone('Spine2'),
      getBone('LeftArm'),
      getBone('RightArm'),
      getBone('LeftForeArm'),
      getBone('RightForeArm'),
      getBone('LeftUpLeg'),
      getBone('RightUpLeg'),
      getBone('LeftLeg'),
      getBone('RightLeg'),
    ];
    const proportionBones: ProportionBones = {
      head: proportionTargets[0],
      belly: proportionTargets[1],
      chest: proportionTargets[2],
      arms: proportionTargets.slice(3, 7),
      legs: proportionTargets.slice(7),
      baseScales: proportionTargets.map((bone) => bone.scale.clone()),
    };
    const footBones: [Bone, Bone] = [getBone('LeftFoot'), getBone('RightFoot')];

    const variations = buildVariations(INSTANCE_COUNT);
    const timeOffsets = variations.map((_, i) => (duration * i) / INSTANCE_COUNT);

    const bellyWeights = new StorageBufferAttribute(INSTANCE_COUNT, 1);
    variations.forEach((v, i) => {
      bellyWeights.array[i] = v.belly;
    });
    bellyWeights.needsUpdate = true;
    const bellyWeightsNode = storage(bellyWeights, 'float', INSTANCE_COUNT).toReadOnly();

    const instanceMatrices = new StorageBufferAttribute(INSTANCE_COUNT, 16);
    const instanceMatricesNode = storage(instanceMatrices, 'mat4', INSTANCE_COUNT).toReadOnly();

    // Seed the reference skeleton once so the foot-grounding math below has a real
    // pose to measure — matches the original's synchronous updateMatrixWorld /
    // skeleton.update() before it ever enters the render loop.
    object.updateMatrixWorld(true);
    skeleton.update();
    const groundFoot = getFootCoordinate(referenceMesh, footBones);

    // One bone-matrix storage buffer PER SKELETON, shared by every skinned
    // sub-mesh that uses it (Michelle.glb has several) — mirrors the original's
    // getSkeletonState cache rather than wastefully rebuilding one buffer per mesh.
    const skeletonStates = new Map<Skeleton, SkeletonState>();
    const getSkeletonState = (skel: Skeleton): SkeletonState => {
      let state = skeletonStates.get(skel);
      if (!state) {
        const boneCount = skel.bones.length;
        const boneMatrices = new StorageBufferAttribute(INSTANCE_COUNT * boneCount, 16);
        state = {
          skeleton: skel,
          boneCount,
          boneMatrices,
          boneMatricesNode: storage(boneMatrices, 'mat4', boneMatrices.count).toReadOnly(),
        };
        skeletonStates.set(skel, state);
      }
      return state;
    };

    const computedMeshes = skinnedMeshes.map((source) => {
      const geometry = source.geometry.clone();
      // Duck-typed `.positionNode`/`.normalNode`: the loaded material is a classic
      // MeshStandardMaterial (GLTFLoader never produces NodeMaterial instances),
      // but the WebGPU renderer's NodeLibrary auto-wraps ANY material into an
      // equivalent NodeMaterial and copies over every own-enumerable property —
      // including these two, if set before first use (three's
      // NodeLibrary.fromMaterial, verified in
      // src/renderers/common/nodes/NodeLibrary.js). Same technique the original
      // relies on; not declared on the classic Material type (UPSTREAM.md B11
      // family).
      const material = (source.material as Material).clone() as Material & {
        positionNode?: unknown;
        normalNode?: unknown;
      };
      const vertexCount = geometry.getAttribute('position').count;
      const skeletonState = getSkeletonState(source.skeleton);

      const sourceVertices = storage(createSourceVertexAttribute(geometry), 'vec4', vertexCount * 3).toReadOnly();
      const skinIndices = storage(
        new StorageBufferAttribute(new Uint32Array(geometry.getAttribute('skinIndex').array), 4),
        'uvec4',
        vertexCount,
      ).toReadOnly();
      const skinWeights = storage(
        new StorageBufferAttribute(new Float32Array(geometry.getAttribute('skinWeight').array), 4),
        'vec4',
        vertexCount,
      ).toReadOnly();
      const bindMatrix = uniform(source.bindMatrix, 'mat4');
      const bindMatrixInverse = uniform(source.bindMatrixInverse, 'mat4');
      const vertices = attributeArray(INSTANCE_COUNT * vertexCount * 2, 'vec4');

      const computeSkinning = Fn(() => {
        const sourceVertex = instanceIndex.mod(uint(vertexCount));
        const meshInstance = instanceIndex.div(uint(vertexCount));
        const sourceOffset = sourceVertex.mul(uint(3));
        const targetOffset = instanceIndex.mul(uint(2));
        const boneOffset = meshInstance.mul(uint(skeletonState.boneCount));
        const skinIndex = skinIndices.element(sourceVertex);
        const skinWeight = skinWeights.element(sourceVertex);
        const morphPosition = sourceVertices
          .element(sourceOffset)
          .xyz.add(sourceVertices.element(sourceOffset.add(uint(2))).xyz.mul(bellyWeightsNode.element(meshInstance)));
        const skinVertex = bindMatrix.mul(morphPosition);
        const boneMatX = skeletonState.boneMatricesNode.element(boneOffset.add(skinIndex.x));
        const boneMatY = skeletonState.boneMatricesNode.element(boneOffset.add(skinIndex.y));
        const boneMatZ = skeletonState.boneMatricesNode.element(boneOffset.add(skinIndex.z));
        const boneMatW = skeletonState.boneMatricesNode.element(boneOffset.add(skinIndex.w));
        const skinMatrix = add(
          skinWeight.x.mul(boneMatX),
          skinWeight.y.mul(boneMatY),
          skinWeight.z.mul(boneMatZ),
          skinWeight.w.mul(boneMatW),
        );
        const skinPosition = bindMatrixInverse.mul(
          add(
            boneMatX.mul(skinWeight.x).mul(skinVertex),
            boneMatY.mul(skinWeight.y).mul(skinVertex),
            boneMatZ.mul(skinWeight.z).mul(skinVertex),
            boneMatW.mul(skinWeight.w).mul(skinVertex),
          ),
        ).xyz;
        const skinNormal = bindMatrixInverse
          .mul(skinMatrix)
          .mul(bindMatrix)
          .transformDirection(sourceVertices.element(sourceOffset.add(uint(1))).xyz).xyz;
        const instanceMatrix = instanceMatricesNode.element(meshInstance);

        vertices.element(targetOffset).assign(vec4(instanceMatrix.mul(skinPosition).xyz, 1));
        vertices.element(targetOffset.add(uint(1))).assign(vec4(transformNormal(skinNormal, instanceMatrix), 0));
      })()
        .compute(INSTANCE_COUNT * vertexCount)
        .setName('Compute Instanced Skinning');

      const meshVertex = instanceIndex.mul(uint(vertexCount)).add(vertexIndex).mul(uint(2));
      material.positionNode = vertices.element(meshVertex).xyz;
      material.normalNode = transformNormalToView(vertices.element(meshVertex.add(uint(1))).xyz).toVarying();

      const mesh = new Mesh(geometry, material);
      mesh.count = INSTANCE_COUNT;
      mesh.castShadow = true;
      mesh.frustumCulled = false;

      return { source, mesh, computeSkinning };
    });

    return {
      object,
      referenceMesh,
      proportionBones,
      footBones,
      variations,
      timeOffsets,
      groundFoot,
      skeletonStates,
      instanceMatrices,
      computedMeshes,
    };
  }, [scene, animations]);

  // Symmetric connect/disconnect (AGENTS.md: StrictMode mounts, unmounts, then
  // remounts in dev — a `useMemo`-only mutation of the shared gltf scene graph has
  // no cleanup hook, so the FIRST (discarded) pass's computed meshes and the
  // SECOND (kept) pass's can transiently coexist, wired to two independent sets of
  // GPU storage buffers/compute kernels for the same shared `source` skeleton. That
  // left the renderer's node/pipeline caches pointing at the wrong instance — the
  // symptom was a totally invisible herd on the dev server (StrictMode) that
  // rendered correctly in a production build (no double-mount). Proper cleanup
  // here — fully detaching the FIRST pass's meshes and restoring `source.visible`
  // before the SECOND pass ever attaches its own — removes the transient overlap
  // entirely.
  useEffect(() => {
    for (const { source, mesh } of rig.computedMeshes) {
      source.visible = false;
      source.parent?.add(mesh);
    }
    return () => {
      for (const { source, mesh } of rig.computedMeshes) {
        mesh.parent?.remove(mesh);
        source.visible = true;
      }
    };
  }, [rig]);

  useFrame(
    ({ elapsed }) => {
      const {
        object,
        referenceMesh,
        proportionBones,
        footBones,
        variations,
        timeOffsets,
        groundFoot,
        skeletonStates,
        instanceMatrices,
        computedMeshes,
      } = rig;

      for (let i = 0; i < timeOffsets.length; i++) {
        mixer.setTime(elapsed + timeOffsets[i]);
        applyProportions(proportionBones, variations[i]);
        object.updateMatrixWorld(true);

        for (const state of skeletonStates.values()) {
          state.skeleton.update();
          if (state.skeleton.boneMatrices) {
            state.boneMatrices.array.set(state.skeleton.boneMatrices, i * state.boneCount * 16);
          }
        }

        updateInstanceMatrix(instanceMatrices, i, variations[i], groundFoot, referenceMesh, footBones);
      }

      for (const state of skeletonStates.values()) state.boneMatrices.needsUpdate = true;
      instanceMatrices.needsUpdate = true;

      for (const { computeSkinning } of computedMeshes) renderer.compute(computeSkinning);
    },
    { phase: 'update' },
  );

  return <primitive object={rig.object} />;
}

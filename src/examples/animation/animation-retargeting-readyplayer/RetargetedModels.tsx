// The two characters: the Mixamo source plays its own native clip; the readyplayer.me
// target plays the SAME clip retargeted onto its differently-named rig via
// `SkeletonUtils.retargetClip`. See animation-retargeting-readyplayer.tsx header
// DEMONSTRATES/DIVERGENCE for why the retarget bake lives in a `useMemo`.
import { useEffect, useMemo } from 'react';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { Skeleton, SkeletonHelper } from 'three/webgpu';
import type { Bone, Mesh, Object3D, SkinnedMesh } from 'three/webgpu';
import { useAnimations, useFBX, useGLTF } from '@react-three/drei/webgpu';
import { useControls } from 'leva';

const MIXAMO_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/fbx/mixamo.fbx';
const READYPLAYER_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/readyplayer.me.glb';

// Mixamo uses centimeters; three.js (and readyplayer.me's own export) uses meters.
const SOURCE_SCALE = 0.01;

// Traverse for the first SkinnedMesh rather than the original's hardcoded
// `scene.children[0].children[1]` — every skinned mesh on the readyplayer.me rig
// shares the same skeleton, so which one `retargetClip` reads bones from doesn't
// matter (same divergence as animation-retargeting/RetargetedModels.tsx).
function findSkinnedMesh(root: Object3D): SkinnedMesh {
  let found: SkinnedMesh | undefined;
  root.traverse((child) => {
    if (!found && (child as Mesh).isMesh && (child as SkinnedMesh).isSkinnedMesh) {
      found = child as SkinnedMesh;
    }
  });
  if (!found) throw new Error('animation-retargeting-readyplayer: no SkinnedMesh found in target model');
  return found;
}

export function RetargetedModels() {
  const { showHelpers } = useControls('animation-retargeting-readyplayer', { showHelpers: false });

  // useFBX returns the raw Group with `.animations` attached (FBXLoader convention);
  // Object3D.animations is a standard, already-typed field — no cast needed.
  const sourceModel = useFBX(MIXAMO_URL);
  const { scene: targetScene } = useGLTF(READYPLAYER_URL);

  // The one-time, expensive retargeting bake — see animation-retargeting's own
  // RetargetedModels.tsx for why this stays a `useMemo` escape hatch.
  const { sourceHelper, targetHelper, targetSkin, retargetedClip } = useMemo(() => {
    const sourceClip = sourceModel.animations[0];

    const sourceHelper = new SkeletonHelper(sourceModel);
    const sourceSkeleton = new Skeleton(sourceHelper.bones);

    const targetHelper = new SkeletonHelper(targetScene);
    const targetSkin = findSkinnedMesh(targetScene);

    // Mixamo bone names are `mixamorig<TargetBoneName>` — a naming rule, so a
    // function reads more directly than the sibling example's per-bone lookup table.
    const retargetOptions: SkeletonUtils.RetargetClipOptions = {
      hip: 'mixamorigHips',
      scale: SOURCE_SCALE,
      getBoneName: (bone: Bone) => `mixamorig${bone.name}`,
    };

    const retargetedClip = SkeletonUtils.retargetClip(targetSkin, sourceSkeleton, sourceClip, retargetOptions);

    return { sourceHelper, targetHelper, targetSkin, retargetedClip };
  }, [sourceModel, targetScene]);

  // Source plays its own native clip (mixamo.fbx ships exactly one).
  const { actions: sourceActions } = useAnimations(sourceModel.animations, sourceModel);
  useEffect(() => {
    Object.values(sourceActions)[0]?.play();
  }, [sourceActions]);

  // Target plays the retargeted clip, applied to the SkinnedMesh itself — required,
  // since `retargetClip` writes track paths relative to `targetSkin.skeleton.bones`.
  const { actions: targetActions } = useAnimations([retargetedClip], targetSkin);
  useEffect(() => {
    targetActions[retargetedClip.name]?.play();
  }, [targetActions, retargetedClip]);

  return (
    <>
      <primitive object={sourceModel} position-x={-0.9} scale={SOURCE_SCALE} />
      <primitive object={targetScene} position-x={0.9} />
      {showHelpers && (
        <>
          <primitive object={sourceHelper} />
          <primitive object={targetHelper} />
        </>
      )}
    </>
  );
}

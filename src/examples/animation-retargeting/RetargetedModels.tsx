// The two characters: Michelle (source) plays her own native clip; Soldier (target)
// plays the SAME clip retargeted onto its differently-named, differently-rotated rig
// via `SkeletonUtils.retargetClip`. See animation-retargeting.tsx header
// DEMONSTRATES/DIVERGENCE for why the retarget bake lives in a `useMemo`.
import { useEffect, useMemo } from 'react'
import { useAnimations, useGLTF } from '@react-three/drei/webgpu'
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js'
import type { RetargetClipOptions } from 'three/addons/utils/SkeletonUtils.js'
import { Euler, MathUtils, Matrix4, Skeleton, SkeletonHelper } from 'three/webgpu'
import type { Mesh, Object3D, SkinnedMesh } from 'three/webgpu'

const MICHELLE_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/Michelle.glb'
const SOLDIER_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/Soldier.glb'

// Soldier.glb is authored ~100x too large relative to Michelle. Set declaratively via
// the `scale` prop below (instead of the original's imperative `scale.setScalar`) —
// the retarget `scale` option (which compensates the baked hip translation for this
// same factor) must stay the reciprocal of this constant.
const TARGET_SCALE = 0.01

// Traverse for the first SkinnedMesh rather than the original's hardcoded
// `scene.children[0].children[0]` — Soldier.glb's structure happens to match, but
// traversal doesn't depend on knowing it (same divergence as portal/PortalModels.tsx).
function findSkinnedMesh(root: Object3D): SkinnedMesh {
  let found: SkinnedMesh | undefined
  root.traverse((child) => {
    if (!found && (child as Mesh).isMesh && (child as SkinnedMesh).isSkinnedMesh) {
      found = child as SkinnedMesh
    }
  })
  if (!found) throw new Error('animation-retargeting: no SkinnedMesh found in target model')
  return found
}

export interface RetargetedModelsProps {
  showHelpers: boolean
}

export function RetargetedModels({ showHelpers }: RetargetedModelsProps) {
  const { scene: sourceScene, animations: sourceAnimations } = useGLTF(MICHELLE_URL)
  const { scene: targetScene } = useGLTF(SOLDIER_URL)

  // The one-time, expensive retargeting bake. `sourceSkeleton` is built from a
  // `SkeletonHelper` (every bone in the scene graph) rather than the SkinnedMesh's own
  // `.skeleton` — matches the original's `getSource()`, which relies on this to look
  // bones up by name regardless of which bones the geometry's skin indices reference.
  // Runs once per model pair (AGENTS.md useMemo-for-imperative-setup pattern, same as
  // reflection/ReflectiveFloor.tsx).
  const { sourceHelper, targetHelper, targetSkin, retargetedClip } = useMemo(() => {
    const sourceClip = sourceAnimations[0]

    const sourceHelper = new SkeletonHelper(sourceScene)
    const sourceSkeleton = new Skeleton(sourceHelper.bones)

    const targetHelper = new SkeletonHelper(targetScene)
    const targetSkin = findSkinnedMesh(targetScene)

    const rotateCW45 = new Matrix4().makeRotationY(MathUtils.degToRad(45))
    const rotateCCW180 = new Matrix4().makeRotationY(MathUtils.degToRad(-180))
    const rotateCW180 = new Matrix4().makeRotationY(MathUtils.degToRad(180))
    const rotateFoot = new Matrix4().makeRotationFromEuler(
      new Euler(MathUtils.degToRad(45), MathUtils.degToRad(180), MathUtils.degToRad(0)),
    )

    // `localOffsets` isn't declared on @types/three's `RetargetClipOptions` even
    // though the runtime reads `options.localOffsets[boneName]` (checked against
    // reference/three.js/examples/jsm/utils/SkeletonUtils.js) — typed via an
    // intersection rather than a full cast. Not a fiber/drei gap (it's @types/three),
    // so no UPSTREAM.md entry — same convention as reflection.tsx's fogNode note.
    const retargetOptions: RetargetClipOptions & { localOffsets: Record<string, Matrix4> } = {
      // source's hip bone name
      hip: 'mixamorigHips',
      // preserve the target's original scale
      scale: 1 / TARGET_SCALE,
      // per-bone rest-pose rotation offsets between the two rigs
      localOffsets: {
        mixamorigLeftShoulder: rotateCW45,
        mixamorigRightShoulder: rotateCCW180,
        mixamorigLeftArm: rotateCW45,
        mixamorigRightArm: rotateCCW180,
        mixamorigLeftForeArm: rotateCW45,
        mixamorigRightForeArm: rotateCCW180,
        mixamorigLeftHand: rotateCW45,
        mixamorigRightHand: rotateCCW180,
        mixamorigLeftUpLeg: rotateCW180,
        mixamorigRightUpLeg: rotateCW180,
        mixamorigLeftLeg: rotateCW180,
        mixamorigRightLeg: rotateCW180,
        mixamorigLeftFoot: rotateFoot,
        mixamorigRightFoot: rotateFoot,
        mixamorigLeftToeBase: rotateCW180,
        mixamorigRightToeBase: rotateCW180,
      },
      // target bone name -> source bone name (identical here — both rigs are Mixamo)
      names: {
        mixamorigHips: 'mixamorigHips',
        mixamorigSpine: 'mixamorigSpine',
        mixamorigSpine2: 'mixamorigSpine2',
        mixamorigHead: 'mixamorigHead',
        mixamorigLeftShoulder: 'mixamorigLeftShoulder',
        mixamorigRightShoulder: 'mixamorigRightShoulder',
        mixamorigLeftArm: 'mixamorigLeftArm',
        mixamorigRightArm: 'mixamorigRightArm',
        mixamorigLeftForeArm: 'mixamorigLeftForeArm',
        mixamorigRightForeArm: 'mixamorigRightForeArm',
        mixamorigLeftHand: 'mixamorigLeftHand',
        mixamorigRightHand: 'mixamorigRightHand',
        mixamorigLeftUpLeg: 'mixamorigLeftUpLeg',
        mixamorigRightUpLeg: 'mixamorigRightUpLeg',
        mixamorigLeftLeg: 'mixamorigLeftLeg',
        mixamorigRightLeg: 'mixamorigRightLeg',
        mixamorigLeftFoot: 'mixamorigLeftFoot',
        mixamorigRightFoot: 'mixamorigRightFoot',
        mixamorigLeftToeBase: 'mixamorigLeftToeBase',
        mixamorigRightToeBase: 'mixamorigRightToeBase',
      },
    }

    const retargetedClip = SkeletonUtils.retargetClip(targetSkin, sourceSkeleton, sourceClip, retargetOptions)

    return { sourceHelper, targetHelper, targetSkin, retargetedClip }
  }, [sourceScene, targetScene, sourceAnimations])

  // Source plays its own native clip. Michelle.glb ships exactly one clip — same
  // no-ambiguity `Object.values` idiom as skinning-instancing.tsx/backdrop/Michelle.tsx
  // (contrast with Soldier.glb, which ships a rest-pose clip and must be played by name).
  const { actions: sourceActions } = useAnimations(sourceAnimations, sourceScene)
  useEffect(() => {
    Object.values(sourceActions)[0]?.play()
  }, [sourceActions])

  // Target plays the retargeted clip, applied directly to the SkinnedMesh (not the
  // scene root) — required, since `retargetClip` writes track paths relative to
  // `targetSkin.skeleton.bones`, matching the original's explicit comment on this.
  const { actions: targetActions } = useAnimations([retargetedClip], targetSkin)
  useEffect(() => {
    targetActions[retargetedClip.name]?.play()
  }, [targetActions, retargetedClip])

  return (
    <>
      <primitive object={sourceScene} position-x={-0.8} rotation-y={Math.PI / 2} />
      <primitive object={targetScene} position={[0.7, 0, -0.1]} rotation-y={-Math.PI / 2} scale={TARGET_SCALE} />
      {showHelpers && (
        <>
          <primitive object={sourceHelper} />
          <primitive object={targetHelper} />
        </>
      )}
    </>
  )
}

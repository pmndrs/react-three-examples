/**
 * animation-skinning-ik
 * Kira holds a mirror ball in her left hand. Drag the gizmo and a CCD inverse-kinematics
 * solver bends her forearm and upper arm (within joint limits) so the hand follows;
 * her head tracks the ball.
 * Original: https://threejs.org/examples/#webgl_animation_skinning_ik
 *
 * DEMONSTRATES
 * - `CCDIKSolver` + `CCDIKHelper` (three/addons) on a `useGLTF` skinned mesh, solved every
 *   frame in `useFrame` — an intentionally imperative subject, kept in the one component
 *   that owns the rig
 * - drei `<TransformControls object={…}>` as the IK target handle, with camera-controls
 *   suspended for the drag via `DemoHelpers`' `controlsRef`
 * - Rig surgery on a Suspense-cached GLTF (reparenting the ball into the hand, hoisting
 *   the root bone, swapping the ball's material) done in a layout effect with a
 *   symmetric cleanup, so StrictMode and navigation never see it twice
 * - drei `useCubeCamera` for the live reflection: the ball is hidden, the cube camera
 *   moved to its world position and re-rendered, every frame
 * - leva's `button` firing a one-shot solver update through a nonce effect
 *
 * DIVERGENCE from original
 * - The gizmo is mounted by hand (`<primitive object={gizmo.getHelper()}>`): drei's
 *   `<TransformControls>` predates r169's split of the controls from their helper and
 *   only renders the invisible controls object (UPSTREAM B46)
 */
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { MeshBasicNodeMaterial, NoToneMapping, Vector3 } from 'three/webgpu';
import type { Mesh, Object3D, SkinnedMesh } from 'three/webgpu';
import { CCDIKHelper, CCDIKSolver, type IK } from 'three/addons/animation/CCDIKSolver.js';
import { Canvas, useFrame } from '@react-three/fiber/webgpu';
import { TransformControls, useCubeCamera, useGLTF } from '@react-three/drei/webgpu';
import type CameraControlsImpl from 'camera-controls';
import { button, useControls } from 'leva';
import { DemoHelpers } from '../../utils/DemoHelpers';

const KIRA_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/kira.glb';

// Bone indices into `Kira_Shirt_left`'s skeleton. The chain runs hand <- lowerarm <-
// upperarm, each link clamped to a plausible joint range (radians, per axis).
const IKS: IK[] = [
  {
    target: 22, // target_hand_l
    effector: 6, // hand_l
    links: [
      { index: 5, rotationMin: new Vector3(1.2, -1.8, -0.4), rotationMax: new Vector3(1.7, -1.1, 0.3) }, // lowerarm_l
      { index: 4, rotationMin: new Vector3(0.1, -0.7, -1.8), rotationMax: new Vector3(1.1, 0, -1.4) }, // Upperarm_l
    ],
  },
];

const _worldPosition = new Vector3();
const _target = new Vector3();

interface KiraProps {
  controlsRef: React.RefObject<CameraControlsImpl | null>;
}

function Kira({ controlsRef }: KiraProps) {
  const { scene } = useGLTF(KIRA_URL, { draco: true });
  const {
    fbo,
    camera: cubeCamera,
    update: updateCubeCamera,
  } = useCubeCamera({ resolution: 1024, near: 0.05, far: 50 });
  const [manualUpdateNonce, setManualUpdateNonce] = useState(0);
  const [gizmo, setGizmo] = useState<React.ComponentRef<typeof TransformControls> | null>(null);
  const { followSphere, turnHead, ikSolver } = useControls('IK', {
    followSphere: false,
    turnHead: true,
    ikSolver: { value: true, label: 'IK auto update' },
    'IK manual update()': button(() => setManualUpdateNonce((n) => n + 1)),
  });

  const rig = useMemo(() => {
    const get = (name: string) => scene.getObjectByName(name) as Object3D;
    return {
      head: get('head'),
      hand: get('hand_l'),
      targetHand: get('target_hand_l'),
      sphere: get('boule') as Mesh,
      kira: get('Kira_Shirt_left') as SkinnedMesh,
    };
  }, [scene]);

  // Solver and helper read the same bone table; the helper is rendered below.
  const ik = useMemo(
    () => ({ solver: new CCDIKSolver(rig.kira, IKS), helper: new CCDIKHelper(rig.kira, IKS, 0.01) }),
    [rig.kira],
  );

  // The ball's material is replaced on an existing GLTF mesh — no JSX slot to put it in.
  const mirrorMaterial = useMemo(() => new MeshBasicNodeMaterial({ envMap: fbo.texture }), [fbo]);

  // Rig surgery, undone on cleanup because the GLTF is cached across mounts.
  useLayoutEffect(() => {
    const { hand, sphere, kira } = rig;
    const sphereParent = sphere.parent!;
    const rootBone = kira.skeleton.bones[0];
    const boneParent = rootBone.parent!;
    const originalMaterial = sphere.material;

    hand.attach(sphere); // keeps its world transform, now rides with the hand
    kira.add(rootBone); // the solver works in the mesh's local space
    sphere.material = mirrorMaterial;
    return () => {
      sphereParent.attach(sphere);
      boneParent.add(rootBone);
      sphere.material = originalMaterial;
    };
  }, [rig, mirrorMaterial]);

  // Orbit around where the ball starts (a plain effect: the controls instance exists
  // once every layout effect has run).
  useEffect(() => {
    const target = rig.sphere.getWorldPosition(new Vector3());
    controlsRef.current?.setTarget(target.x, target.y, target.z, false);
  }, [rig, controlsRef]);

  const updateIK = () => {
    ik.solver.update();
    // Bones moved the skin; refresh the culling sphere so the mesh can't pop out of view.
    scene.traverse((object) => {
      if ((object as SkinnedMesh).isSkinnedMesh) (object as SkinnedMesh).computeBoundingSphere();
    });
  };

  useEffect(() => {
    if (manualUpdateNonce > 0) updateIK();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once per button press
  }, [manualUpdateNonce]);

  useFrame(() => {
    const { head, sphere } = rig;
    const controls = controlsRef.current;

    // Live reflection: the ball must not see itself.
    sphere.visible = false;
    sphere.getWorldPosition(cubeCamera.position);
    updateCubeCamera();
    sphere.visible = true;

    sphere.getWorldPosition(_worldPosition);

    if (followSphere && controls) {
      controls.getTarget(_target).lerp(_worldPosition, 0.1);
      controls.setTarget(_target.x, _target.y, _target.z, false);
    }

    if (turnHead) {
      head.lookAt(_worldPosition);
      head.rotation.y += Math.PI; // the head bone's forward axis points backwards
    }

    if (ikSolver) updateIK();
  });

  const beginDrag = () => {
    if (controlsRef.current) controlsRef.current.enabled = false;
  };
  const endDrag = () => {
    if (controlsRef.current) controlsRef.current.enabled = true;
  };

  return (
    <>
      <primitive object={scene} />
      <primitive object={ik.helper} />
      <primitive object={cubeCamera} />
      <TransformControls
        ref={setGizmo}
        object={rig.targetHand}
        size={0.75}
        showX={false}
        space="world"
        onMouseDown={beginDrag}
        onMouseUp={endDrag}
      />
      {/* TODO(drei-gap): since r169 the visible gizmo is `getHelper()`, which drei never mounts. */}
      {gizmo && <primitive object={gizmo.getHelper()} />}
    </>
  );
}

export default function AnimationSkinningIK() {
  const controlsRef = useRef<CameraControlsImpl>(null);

  return (
    <Canvas
      renderer={{ toneMapping: NoToneMapping }}
      background="#ffffff"
      camera={{ position: [0.97, 1.1, 0.73], fov: 55, near: 0.001, far: 5000 }}>
      <fogExp2 attach="fog" args={['#ffffff', 0.17]} />
      <ambientLight intensity={8} />
      <Suspense fallback={null}>
        <Kira controlsRef={controlsRef} />
      </Suspense>
      {/* Grid off: the room has its own floor. */}
      <DemoHelpers grid={false} minDistance={0.2} maxDistance={1.5} controlsRef={controlsRef} />
    </Canvas>
  );
}

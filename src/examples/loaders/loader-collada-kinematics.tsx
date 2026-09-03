/**
 * loader-collada-kinematics
 * An ABB industrial robot arm from a COLLADA file that carries a kinematics model. Every
 * one to five seconds each movable joint eases toward a new random angle inside the limits
 * the file declares, while the camera slowly orbits the base.
 * Original: https://threejs.org/examples/#webgl_loader_collada_kinematics
 *
 * DEMONSTRATES
 * - `useLoader(ColladaLoader, …)` returning more than a scene: `collada.kinematics` is a
 *   joint table (`limits`, `zeroPosition`, `static`) plus `setJointValue()`, which rebuilds
 *   the joint node's matrix from the file's transform stack
 * - Joint animation as one `useFrame`: a from/to pose pair and a quadratic ease-out, with
 *   a fresh random target pose picked whenever the previous one lands — the original's
 *   TWEEN.js + `setTimeout` chain in a dozen lines
 * - The original's hand-orbited camera is `DemoHelpers autoRotate` at the same period
 *
 * DIVERGENCE from original
 * - `@types/three` types `ColladaKinematics.joints` / `setJointValue` as `unknown`, so the
 *   shape the loader actually returns is declared locally and cast onto once
 */
import { Suspense, useMemo } from 'react';
import { MathUtils, NoToneMapping } from 'three/webgpu';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';
import { Canvas, useFrame, useLoader } from '@react-three/fiber/webgpu';
import { DemoHelpers } from '../../utils/DemoHelpers';

const MODEL_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/collada/abb_irb52_7_120.dae';

// What `ColladaLoader` actually returns in `kinematics` (see loaders/collada/ColladaComposer.js).
interface KinematicsJoint {
  static: boolean;
  zeroPosition: number;
  limits: { min: number; max: number };
}
interface Kinematics {
  joints: Record<string, KinematicsJoint>;
  setJointValue(joint: string, value: number): void;
}

const easeOutQuad = (t: number) => t * (2 - t);

function RobotArm() {
  const collada = useLoader(ColladaLoader, MODEL_URL);
  // The loader is typed `Loader<Collada | null>`: it resolves null for an unparsable document.
  if (!collada) throw new Error(`ColladaLoader could not parse ${MODEL_URL}`);
  const kinematics = collada.kinematics as Kinematics;

  // The movable joints, and the pose the arm is easing between. Starts "expired"
  // (duration 0) so the first frame picks the first target.
  const pose = useMemo(() => {
    const joints = Object.entries(kinematics.joints).filter(([, joint]) => !joint.static);
    const zero = joints.map(([, joint]) => joint.zeroPosition);
    return { joints, from: zero, to: zero, start: 0, duration: 0 };
  }, [kinematics]);

  useFrame(({ elapsed }) => {
    if (elapsed >= pose.start + pose.duration) {
      pose.from = pose.to;
      pose.to = pose.joints.map(([, joint]) => MathUtils.randInt(joint.limits.min, joint.limits.max));
      pose.start = elapsed;
      pose.duration = MathUtils.randInt(1, 5);
    }
    const k = easeOutQuad(Math.min((elapsed - pose.start) / pose.duration, 1));
    pose.joints.forEach(([name], i) => kinematics.setJointValue(name, MathUtils.lerp(pose.from[i], pose.to[i], k)));
  });

  return <primitive object={collada.scene} scale={10} />;
}

export default function LoaderColladaKinematics() {
  return (
    <Canvas renderer={{ toneMapping: NoToneMapping }} camera={{ position: [20, 10, 0], fov: 45, near: 1, far: 2000 }}>
      <hemisphereLight color="#fff7f7" groundColor="#494966" intensity={3} />
      <Suspense fallback={null}>
        <RobotArm />
      </Suspense>
      {/* One orbit a minute, matching the original's `Date.now() * 0.0001` sweep. */}
      <DemoHelpers target={[0, 5, 0]} autoRotate autoRotateSpeed={1} />
    </Canvas>
  );
}

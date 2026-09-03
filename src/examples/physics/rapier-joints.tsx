/**
 * rapier-joints
 * Three capsule links hang in a chain from a fixed red pivot, each pinned to the one
 * before it by a spherical joint, and swing until the damping settles them.
 * Original: https://threejs.org/examples/#physics_rapier_joints
 *
 * DEMONSTRATES
 * - `useSphericalJoint(bodyA, bodyB, [anchorA, anchorB])` — one hook per link in place of
 *   `JointData.spherical` + `createImpulseJoint`
 * - Chaining through refs: `<Link>` takes the body it hangs from as a ref prop and
 *   exposes its own for the next link (React 19 ref-as-prop, no forwardRef)
 * - `rotation` on the `<RigidBody>` so collider, mesh and joint anchors all share the body
 *   frame — the original rotates the mesh and lets `addMesh` copy the quaternion across
 * - `<CapsuleCollider>` and `angularDamping` as props; `debug` is the RapierHelper outline
 */
import { Suspense, useRef, type RefObject } from 'react';
import { NoToneMapping } from 'three/webgpu';
import { Canvas } from '@react-three/fiber/webgpu';
import { CapsuleCollider, Physics, RigidBody, useSphericalJoint, type RapierRigidBody } from '@react-three/rapier';
import { useControls } from 'leva';

import { DemoHelpers } from '../../utils/DemoHelpers';

//* Chain =========================================================

type Anchor = [number, number, number];
type LinkProps = {
  /** World x of the link's left end. */
  x: number;
  /** The body this link hangs from, and where on it (in that body's frame). */
  hangsFrom: RefObject<RapierRigidBody>;
  anchor: Anchor;
  ref: RefObject<RapierRigidBody>;
};

function Link({ x, hangsFrom, anchor, ref }: LinkProps) {
  // The joint's own end sits at the capsule's top in body space — which is its left end
  // once the body is rotated onto its side.
  useSphericalJoint(hangsFrom, ref, [anchor, [0, 1.15, 0]]);

  return (
    <RigidBody
      ref={ref}
      position={[x + 0.9, 5.8, 0]}
      rotation={[0, 0, Math.PI / 2]}
      colliders={false}
      mass={1}
      restitution={0.5}
      angularDamping={10}>
      <CapsuleCollider args={[0.9, 0.25]} />
      <mesh castShadow>
        <capsuleGeometry args={[0.25, 1.8]} />
        <meshStandardNodeMaterial color="#cccc00" />
      </mesh>
    </RigidBody>
  );
}

function Chain() {
  // `null!`: the joint hooks type their refs as `RefObject<RapierRigidBody>` (never null),
  // which React 19's `useRef(null)` no longer produces — a @react-three/rapier types gap.
  const pivotRef = useRef<RapierRigidBody>(null!);
  const linkRefs = [useRef<RapierRigidBody>(null!), useRef<RapierRigidBody>(null!), useRef<RapierRigidBody>(null!)];
  const bodies = [pivotRef, ...linkRefs];

  return (
    <>
      <RigidBody ref={pivotRef} type="fixed" position={[0, 6, 0]} colliders="ball">
        <mesh>
          <sphereGeometry args={[0.5]} />
          <meshStandardNodeMaterial color="#ff0000" />
        </mesh>
      </RigidBody>
      {/* The first link hangs off the bottom of the pivot sphere; the rest off the
          previous capsule's far end. */}
      {linkRefs.map((ref, i) => (
        <Link key={i} ref={ref} hangsFrom={bodies[i]} x={i * 2} anchor={i === 0 ? [0, -0.5, 0] : [0, -1.15, 0]} />
      ))}
    </>
  );
}

//* Scene =========================================================

function World() {
  const { colliders } = useControls('Rapier', { colliders: true });

  return (
    <Physics debug={colliders}>
      <Chain />
    </Physics>
  );
}

export default function RapierJoints() {
  return (
    <Canvas
      renderer={{ toneMapping: NoToneMapping }}
      shadows
      background="#bfd1e5"
      camera={{ fov: 60, position: [0, 3, 10], near: 0.1, far: 100 }}>
      <hemisphereLight args={['#555555', '#ffffff']} />
      <directionalLight
        position={[0, 12.5, 12.5]}
        intensity={4}
        castShadow
        shadow-radius={3}
        shadow-blurSamples={8}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
        shadow-camera-near={1}
        shadow-camera-far={50}
      />

      <Suspense>
        <World />
      </Suspense>

      <DemoHelpers target={[0, 2, 0]} />
    </Canvas>
  );
}

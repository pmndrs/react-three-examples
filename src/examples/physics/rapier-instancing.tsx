/**
 * rapier-instancing
 * 400 boxes and 400 spheres — two InstancedMeshes, every instance its own rigid body.
 * Each frame one box and one sphere are dropped back in above the centre, so the pile
 * never settles; the Shake button throws the whole lot into the air.
 * Original: https://threejs.org/examples/#physics_rapier_instancing
 *
 * DEMONSTRATES
 * - `<InstancedRigidBodies>` turns one `<instancedMesh>` into N bodies and writes every
 *   instance matrix back after each step — the original's body array and matrix copy
 *   loop are gone
 * - One `<Pile>` rendered twice with DATA (geometry and collider kind) — no controls
 *   duplicated per instance
 * - Its ref IS the body array, so the parent's Shake button (leva `button()`, the
 *   original's HTML button) reaches every body of both piles
 * - The per-frame teleport goes through the body API from `useFrame` — physics state is
 *   never React state
 * - Per-instance colours set once through the mesh ref; a `<CuboidCollider>` with no mesh
 *   for the invisible floor, and `<shadowNodeMaterial>` on the plane that catches shadows
 */
import { Suspense, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Color, NoToneMapping, type InstancedMesh } from 'three/webgpu';
import { Canvas, useFrame } from '@react-three/fiber/webgpu';
import {
  CuboidCollider,
  InstancedRigidBodies,
  Physics,
  RigidBody,
  type InstancedRigidBodiesProps,
  type RapierRigidBody,
} from '@react-three/rapier';
import { button, useControls } from 'leva';

import { DemoHelpers } from '../../utils/DemoHelpers';

const COUNT = 400;
const ZERO = { x: 0, y: 0, z: 0 };

//* Piles =========================================================

type Bodies = (RapierRigidBody | null)[];
type PileProps = Pick<InstancedRigidBodiesProps, 'colliders'> & { geometry: ReactNode; ref: RefObject<Bodies | null> };

function Pile({ colliders, geometry, ref }: PileProps) {
  const meshRef = useRef<InstancedMesh>(null);
  const [instances] = useState(() =>
    Array.from({ length: COUNT }, (_, key) => ({
      key,
      position: [Math.random() - 0.5, Math.random() * 2, Math.random() - 0.5] as [number, number, number],
    })),
  );

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const color = new Color();
    for (let i = 0; i < COUNT; i++) mesh.setColorAt(i, color.setHex(0xffffff * Math.random()));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, []);

  // One random instance a frame goes back above the centre with its velocity cleared —
  // the original's 60 Hz interval, on the frame loop instead.
  useFrame(() => {
    const body = ref.current?.[Math.floor(Math.random() * COUNT)];
    if (!body) return;
    body.setTranslation({ x: 0, y: Math.random() + 1, z: 0 }, true);
    body.setLinvel(ZERO, true);
    body.setAngvel(ZERO, true);
  });

  return (
    <InstancedRigidBodies ref={ref} instances={instances} colliders={colliders}>
      <instancedMesh ref={meshRef} args={[undefined, undefined, COUNT]} castShadow receiveShadow>
        {geometry}
        <meshLambertNodeMaterial />
      </instancedMesh>
    </InstancedRigidBodies>
  );
}

function Piles() {
  const boxesRef = useRef<Bodies>(null);
  const spheresRef = useRef<Bodies>(null);

  useControls({
    shake: button(() => {
      for (const body of [...(boxesRef.current ?? []), ...(spheresRef.current ?? [])]) {
        body?.applyImpulse({ x: (Math.random() - 0.5) * 5, y: Math.random() * 5, z: (Math.random() - 0.5) * 5 }, true);
      }
    }),
  });

  return (
    <>
      <Pile ref={boxesRef} colliders="cuboid" geometry={<boxGeometry args={[0.075, 0.075, 0.075]} />} />
      <Pile ref={spheresRef} colliders="ball" geometry={<icosahedronGeometry args={[0.05, 4]} />} />
    </>
  );
}

//* Scene =========================================================

export default function RapierInstancing() {
  return (
    <Canvas
      renderer={{ toneMapping: NoToneMapping }}
      shadows
      background="#666666"
      camera={{ fov: 50, position: [-1, 1.5, 2], near: 0.1, far: 100 }}>
      <hemisphereLight />
      <directionalLight position={[5, 5, 5]} intensity={3} castShadow shadow-camera-zoom={2} />

      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[10, 10]} />
        <shadowNodeMaterial color="#444444" />
      </mesh>

      <Suspense>
        <Physics>
          {/* The floor is a collider only — the original's invisible box mesh. */}
          <RigidBody type="fixed">
            <CuboidCollider args={[5, 2.5, 5]} position={[0, -2.5, 0]} />
          </RigidBody>
          <Piles />
        </Physics>
      </Suspense>

      <DemoHelpers grid={false} target={[0, 0.5, 0]} />
    </Canvas>
  );
}

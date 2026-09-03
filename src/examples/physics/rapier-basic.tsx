/**
 * rapier-basic
 * A new box, sphere or rounded cube drops onto the floor every second and joins the
 * pile; whatever tumbles off the edge is removed once it falls out of sight. The green
 * outlines are the physics colliders drawn over the meshes.
 * Original: https://threejs.org/examples/#physics_rapier_basic
 *
 * DEMONSTRATES
 * - `@react-three/rapier` on fiber v10: `<Physics>` owns the world and steps it from
 *   the frame loop; `<RigidBody>` wraps a mesh and infers the collider from its geometry
 * - A body that removes ITSELF — each `<FallingBody>` watches its own translation in
 *   `useFrame` and asks the spawner to drop it, instead of the original's per-frame
 *   scene traversal
 * - `<RoundCuboidCollider>` where the shape can't be inferred (the original hand-picks a
 *   `roundCuboid` for RoundedBoxGeometry), with mass and restitution still declared
 *   once on the body
 * - The spawn list is React state (a body is born and dies), while every body's motion
 *   is physics state the loop owns — React never sees a position
 * - `debug` on `<Physics>` is the original's RapierHelper collider outline
 */
import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { NoToneMapping, RepeatWrapping } from 'three/webgpu';
import { Canvas, useFrame, useTexture } from '@react-three/fiber/webgpu';
import {
  Physics,
  RigidBody,
  RoundCuboidCollider,
  type RapierRigidBody,
  type RigidBodyProps,
} from '@react-three/rapier';
import { useControls } from 'leva';

import '../../assets/RoundedBoxGeometry';
import { DemoHelpers } from '../../utils/DemoHelpers';

const ASSETS = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/';

//* Bodies ========================================================

// The three shapes the original picks from. Box and sphere colliders are inferred from
// the geometry; the rounded box gets an explicit round cuboid (half-extent minus the
// corner radius, then the radius) — exactly what the original builds by hand.
type ShapeSpec = Pick<RigidBodyProps, 'colliders'> & { geometry: ReactNode; collider?: ReactNode };

const SHAPES: Record<'box' | 'sphere' | 'rounded', ShapeSpec> = {
  box: { colliders: 'cuboid', geometry: <boxGeometry /> },
  sphere: { colliders: 'ball', geometry: <sphereGeometry args={[0.5]} /> },
  rounded: {
    colliders: false,
    geometry: <roundedBoxGeometry args={[1, 1, 1, 2, 0.25]} />,
    collider: <RoundCuboidCollider args={[0.25, 0.25, 0.25, 0.25]} />,
  },
};

type Shape = keyof typeof SHAPES;
type BodySpec = { id: number; shape: Shape; color: number; position: [number, number, number] };

let nextId = 0;
function spawn(): BodySpec {
  const shapes = Object.keys(SHAPES) as Shape[];
  return {
    id: nextId++,
    shape: shapes[Math.floor(Math.random() * shapes.length)],
    color: Math.floor(Math.random() * 0xffffff),
    position: [Math.random() * 2 - 1, Math.random() * 3 + 6, Math.random() * 2 - 1],
  };
}

function FallingBody({ id, shape, color, position, onFall }: BodySpec & { onFall: (id: number) => void }) {
  const bodyRef = useRef<RapierRigidBody>(null);
  const { colliders, geometry, collider } = SHAPES[shape];

  // Off the floor and out of sight: ask to be unmounted. Reading the body here, not
  // the mesh — the mesh only mirrors the body after each physics step.
  useFrame(() => {
    if (bodyRef.current && bodyRef.current.translation().y < -10) onFall(id);
  });

  return (
    <RigidBody ref={bodyRef} position={position} colliders={colliders} mass={1} restitution={0.5}>
      {collider}
      <mesh castShadow>
        {geometry}
        <meshStandardNodeMaterial color={color} />
      </mesh>
    </RigidBody>
  );
}

function Spawner() {
  const [bodies, setBodies] = useState(() => [spawn()]);

  useEffect(() => {
    const timer = setInterval(() => setBodies((list) => [...list, spawn()]), 1000);
    return () => clearInterval(timer);
  }, []);

  const remove = useCallback((id: number) => setBodies((list) => list.filter((body) => body.id !== id)), []);

  return bodies.map((body) => <FallingBody key={body.id} {...body} onFall={remove} />);
}

//* Scene =========================================================

function Floor() {
  const grid = useTexture(`${ASSETS}textures/grid.png`, (texture) => {
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.repeat.set(20, 20);
  });

  return (
    <RigidBody type="fixed" colliders="cuboid">
      <mesh position-y={-0.25} receiveShadow>
        <boxGeometry args={[10, 0.5, 10]} />
        <meshStandardNodeMaterial map={grid} />
      </mesh>
    </RigidBody>
  );
}

function World() {
  const { colliders } = useControls('Rapier', { colliders: true });

  return (
    <Physics debug={colliders}>
      <Floor />
      <Spawner />
    </Physics>
  );
}

export default function RapierBasic() {
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

      {/* <Physics> suspends while the rapier WASM initialises. */}
      <Suspense>
        <World />
      </Suspense>

      {/* The floor's grid texture is the ground reference here. */}
      <DemoHelpers grid={false} target={[0, 2, 0]} />
    </Canvas>
  );
}

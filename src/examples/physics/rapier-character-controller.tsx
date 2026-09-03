/**
 * rapier-character-controller
 * A blue capsule you steer with WASD or the arrow keys across a floor scattered with
 * fixed red boxes and pushable green balls. It is a kinematic character controller: it
 * climbs small steps, slides along walls and shoves the balls out of its way.
 * Original: https://threejs.org/examples/#physics_rapier_character_controller
 *
 * DEMONSTRATES
 * - Rapier's `KinematicCharacterController` driving a `kinematicPosition` `<RigidBody>`:
 *   `computeColliderMovement`, then `setNextKinematicTranslation` — and the library
 *   moves the mesh, so there is no sync line
 * - `useBeforePhysicsStep` for the move: once per fixed 1/60 step, not once per frame
 * - drei `<KeyboardControls>` with `useKeyboardControls().get()` read inside the step —
 *   key state never touches React
 * - `useRapier()` for the world when a resource has no component: the controller is
 *   created in an effect with a symmetric remove
 * - Ten obstacles from one data array — `type="fixed"` red boxes, dynamic green balls
 * - `debug` on `<Physics>` is the original's RapierHelper outline
 */
import { Suspense, useEffect, useRef, useState } from 'react';
import { NoToneMapping, RepeatWrapping } from 'three/webgpu';
import { Canvas, useTexture } from '@react-three/fiber/webgpu';
import { KeyboardControls, useKeyboardControls } from '@react-three/drei/webgpu';
import {
  CapsuleCollider,
  Physics,
  RigidBody,
  useBeforePhysicsStep,
  useRapier,
  type RapierCollider,
  type RapierContext,
  type RapierRigidBody,
} from '@react-three/rapier';
import { useControls } from 'leva';

import { DemoHelpers } from '../../utils/DemoHelpers';

const ASSETS = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/';

const KEYS = [
  { name: 'forward', keys: ['KeyW', 'ArrowUp'] },
  { name: 'backward', keys: ['KeyS', 'ArrowDown'] },
  { name: 'left', keys: ['KeyA', 'ArrowLeft'] },
  { name: 'right', keys: ['KeyD', 'ArrowRight'] },
];
type Key = (typeof KEYS)[number]['name'];

//* Player ========================================================

type CharacterController = ReturnType<RapierContext['world']['createCharacterController']>;

function Player() {
  const { world } = useRapier();
  const bodyRef = useRef<RapierRigidBody>(null);
  const colliderRef = useRef<RapierCollider>(null);
  const controllerRef = useRef<CharacterController>(null);
  const [, getKeys] = useKeyboardControls<Key>();

  useEffect(() => {
    const controller = world.createCharacterController(0.01);
    controller.setApplyImpulsesToDynamicBodies(true);
    controller.setCharacterMass(3);
    controllerRef.current = controller;
    return () => {
      world.removeCharacterController(controller);
      controllerRef.current = null;
    };
  }, [world]);

  useBeforePhysicsStep(() => {
    const body = bodyRef.current;
    const collider = colliderRef.current;
    const controller = controllerRef.current;
    if (!body || !collider || !controller) return;

    const { forward, backward, left, right } = getKeys();
    const speed = 2.5 / 60;
    const wanted = { x: (Number(right) - Number(left)) * speed, y: 0, z: (Number(backward) - Number(forward)) * speed };

    // The controller clips the wanted move against the world (steps, slopes, walls)
    // and hands back what is actually possible.
    controller.computeColliderMovement(collider, wanted);
    const move = controller.computedMovement();
    const { x, y, z } = body.translation();
    body.setNextKinematicTranslation({ x: x + move.x, y: y + move.y, z: z + move.z });
  });

  return (
    <RigidBody ref={bodyRef} type="kinematicPosition" position={[0, 0.8, 0]} colliders={false}>
      <CapsuleCollider ref={colliderRef} args={[0.5, 0.3]} />
      <mesh castShadow>
        <capsuleGeometry args={[0.3, 1, 8, 8]} />
        <meshStandardNodeMaterial color="#0000ff" />
      </mesh>
    </RigidBody>
  );
}

//* Scene =========================================================

const random = (min: number, max: number) => Math.random() * (max - min) + min;

function Obstacles() {
  const [obstacles] = useState(() =>
    Array.from({ length: 10 }, (_, id) => ({
      id,
      fixed: Math.random() > 0.7,
      position: [random(-10, 10), 0.5, random(-10, 10)] as [number, number, number],
    })),
  );

  return obstacles.map(({ id, fixed, position }) =>
    fixed ? (
      <RigidBody key={id} type="fixed" position={position} colliders="cuboid">
        <mesh castShadow>
          <boxGeometry />
          <meshStandardNodeMaterial color="#ff0000" />
        </mesh>
      </RigidBody>
    ) : (
      <RigidBody key={id} position={position} colliders="ball" mass={0.5} restitution={0.3}>
        <mesh castShadow>
          <sphereGeometry args={[0.25]} />
          <meshStandardNodeMaterial color="#00ff00" />
        </mesh>
      </RigidBody>
    ),
  );
}

function Ground() {
  const grid = useTexture(`${ASSETS}textures/grid.png`, (texture) => {
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.repeat.set(20, 20);
  });

  return (
    <RigidBody type="fixed" colliders="cuboid">
      <mesh position-y={-0.25} receiveShadow>
        <boxGeometry args={[20, 0.5, 20]} />
        <meshStandardNodeMaterial map={grid} />
      </mesh>
    </RigidBody>
  );
}

function World() {
  const { colliders } = useControls('Rapier', { colliders: true });

  return (
    <Physics debug={colliders}>
      <Ground />
      <Obstacles />
      <Player />
    </Physics>
  );
}

export default function RapierCharacterController() {
  return (
    <KeyboardControls map={KEYS}>
      <Canvas
        renderer={{ toneMapping: NoToneMapping }}
        shadows
        background="#bfd1e5"
        camera={{ fov: 60, position: [2, 5, 15], near: 0.1, far: 100 }}>
        <hemisphereLight args={['#555555', '#ffffff']} />
        <directionalLight
          position={[0, 12.5, 12.5]}
          intensity={3}
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

        <DemoHelpers grid={false} target={[0, 2, 0]} />
      </Canvas>
    </KeyboardControls>
  );
}

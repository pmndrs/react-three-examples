// The player and the balls: one substepped frame loop owns both, since the player
// shoves balls and balls shove the player. The camera IS the player — its position is
// written from the capsule every frame and PointerLockControls owns its rotation.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Matrix4, type InstancedMesh } from 'three/webgpu';
import type { Octree } from 'three/addons/math/Octree.js';
import { useFrame, useThree } from '@react-three/fiber/webgpu';
import { useKeyboardControls } from '@react-three/drei/webgpu';

import {
  NUM_SPHERES,
  SPHERE_RADIUS,
  STEPS_PER_FRAME,
  applyControls,
  createBalls,
  createPlayer,
  teleportIfOutOfBounds,
  throwBall,
  updateBalls,
  updatePlayer,
  type Keys,
} from './physics';

export function Simulation({ world }: { world: Octree }) {
  const camera = useThree((state) => state.camera);
  const ballsRef = useRef<InstancedMesh>(null);
  const [, getKeys] = useKeyboardControls<keyof Keys>();

  const [player] = useState(createPlayer);
  const [balls] = useState(createBalls);
  const [scratch] = useState(() => ({ matrix: new Matrix4(), nextBall: 0, mouseDownAt: 0 }));

  // Under pointer lock there is no pointer to raycast with, so R3F's mesh events can't
  // carry this — the original's document listeners stay. Mousedown starts the hold
  // timer; mouseup throws (only once locked, so the locking click itself doesn't).
  useEffect(() => {
    const onMouseDown = () => (scratch.mouseDownAt = performance.now());
    const onMouseUp = () => {
      if (document.pointerLockElement === null) return;
      throwBall(balls[scratch.nextBall], player, camera, performance.now() - scratch.mouseDownAt);
      scratch.nextBall = (scratch.nextBall + 1) % balls.length;
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [balls, player, camera, scratch]);

  const syncBalls = () => {
    const mesh = ballsRef.current;
    if (!mesh) return;
    for (let i = 0; i < balls.length; i++) mesh.setMatrixAt(i, scratch.matrix.setPosition(balls[i].collider.center));
    mesh.instanceMatrix.needsUpdate = true;
  };

  // Park the unthrown balls out of sight before the first frame draws them at the origin.
  useLayoutEffect(syncBalls, []); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame(({ delta }) => {
    const dt = Math.min(0.05, delta) / STEPS_PER_FRAME;
    const keys = getKeys();

    for (let i = 0; i < STEPS_PER_FRAME; i++) {
      applyControls(player, camera, keys, dt);
      updatePlayer(player, world, dt);
      updateBalls(balls, player, world, dt);
      if (teleportIfOutOfBounds(player)) camera.rotation.set(0, 0, 0);
    }

    camera.position.copy(player.collider.end);
    syncBalls();
  });

  // Balls end up all over the level, so the instance bounding sphere (built once, from
  // where they START) must not be used to cull them.
  return (
    <instancedMesh
      ref={ballsRef}
      args={[undefined, undefined, NUM_SPHERES]}
      castShadow
      receiveShadow
      frustumCulled={false}>
      <icosahedronGeometry args={[SPHERE_RADIUS, 5]} />
      <meshLambertNodeMaterial color="#dede8d" />
    </instancedMesh>
  );
}

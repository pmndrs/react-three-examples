// The scene half: wall meshes and one InstancedMesh of balls, both built from the same
// layout the physics world used, plus the pointer light and the frame loop that steps
// the simulation and copies body transforms onto the instances.
import { useLayoutEffect, useRef, useState } from 'react';
import { Color, InstancedMesh, Object3D, PointLight, Ray, Vector3 } from 'three/webgpu';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber/webgpu';
import { Vec3 } from '@perplexdotgg/bounce';

import { BALL_RADIUS, BOX_DEPTH, BOX_HEIGHT, CAM_DISTANCE, createWorld, randomSpot, roomWalls } from './physics';

const EASE_SPEED = 8;
const PUSH_RADIUS = 1.5;
const PUSH_STRENGTH = 15;
const RESPAWN_PER_FRAME = 5;
/** How long after the last pointer event the "pointer is moving" push stays alive. */
const MOVE_WINDOW_MS = 50;

const BALL_COLORS = ['#ff4444', '#44ff44', '#4488ff', '#ffaa00', '#ff44ff', '#44ffff', '#ffff44', '#ff8844', '#8844ff', '#44ff88']; // prettier-ignore

export function BallPool() {
  const { width, height } = useThree((state) => state.size);
  // The original's getBoxWidth() algebra cancels: at the fitted camera distance the
  // room's width is just aspect * height. Re-keying on it IS its rebuildScene() —
  // React remounts the pool (world, bodies, meshes) when the viewport changes shape.
  const roomWidth = (width / height) * BOX_HEIGHT;
  return <Room key={roomWidth} width={roomWidth} />;
}

function Room({ width }: { width: number }) {
  const [{ world, bodies }] = useState(() => createWorld(width));
  const ballsRef = useRef<InstancedMesh>(null);
  const lightRef = useRef<PointLight>(null);

  // Pointer state the FRAME LOOP owns: events write the targets, the loop eases the
  // live values toward them. Plain mutable objects, so a re-render can't snap them back.
  const [pointer] = useState(() => ({
    ray: new Ray(new Vector3(0, BOX_HEIGHT / 2, CAM_DISTANCE), new Vector3(0, 0, -1)),
    rayTarget: new Ray(new Vector3(0, BOX_HEIGHT / 2, CAM_DISTANCE), new Vector3(0, 0, -1)),
    lightTarget: new Vector3(0, BOX_HEIGHT / 2, BOX_DEPTH / 2),
    movingUntil: 0,
    down: false,
  }));
  const [scratch] = useState(() => ({
    dummy: new Object3D(),
    ballPos: new Vector3(),
    closest: new Vector3(),
    pushDir: new Vector3(),
    impulse: new Vec3(),
  }));

  useLayoutEffect(() => {
    const balls = ballsRef.current;
    if (!balls) return;
    const color = new Color();
    for (let i = 0; i < bodies.length; i++) balls.setColorAt(i, color.set(BALL_COLORS[i % BALL_COLORS.length]));
    if (balls.instanceColor) balls.instanceColor.needsUpdate = true;
  }, [bodies]);

  useFrame(
    ({ delta }) => {
      const balls = ballsRef.current;
      const light = lightRef.current;
      if (!balls || !light) return;

      const dt = Math.min(delta, 1 / 30);
      const ease = 1 - Math.exp(-EASE_SPEED * dt);
      pointer.ray.origin.lerp(pointer.rayTarget.origin, ease);
      pointer.ray.direction.lerp(pointer.rayTarget.direction, ease);
      light.position.lerp(pointer.lightTarget, ease);

      // Hold the button to rain fresh balls in from the ceiling.
      if (pointer.down) {
        for (let i = 0; i < RESPAWN_PER_FRAME; i++) {
          const body = bodies[Math.floor(Math.random() * bodies.length)];
          body.position.set(randomSpot(width, BOX_HEIGHT - BALL_RADIUS - Math.random()));
          body.linearVelocity.set([0, 0, 0]);
          body.angularVelocity.set([0, 0, 0]);
          body.commitChanges();
        }
      }

      // While the pointer is moving, shove every ball near the camera ray away from it.
      if (performance.now() < pointer.movingUntil) {
        for (const body of bodies) {
          scratch.ballPos.set(body.position.x, body.position.y, body.position.z);
          pointer.ray.closestPointToPoint(scratch.ballPos, scratch.closest);
          const dist = scratch.closest.distanceTo(scratch.ballPos);
          if (dist >= PUSH_RADIUS) continue;

          scratch.pushDir.subVectors(scratch.ballPos, scratch.closest);
          if (scratch.pushDir.lengthSq() < 0.001) scratch.pushDir.set(0, 1, 0);
          scratch.pushDir.normalize().multiplyScalar(PUSH_STRENGTH * (1 - dist / PUSH_RADIUS));
          body.applyLinearImpulse(scratch.impulse.set(scratch.pushDir));
        }
      }

      world.advanceTime(1 / 60, dt);

      for (let i = 0; i < bodies.length; i++) {
        const { position, orientation } = bodies[i];
        scratch.dummy.position.set(position.x, position.y, position.z);
        scratch.dummy.quaternion.set(orientation.x, orientation.y, orientation.z, orientation.w);
        scratch.dummy.updateMatrix();
        balls.setMatrixAt(i, scratch.dummy.matrix);
      }
      balls.instanceMatrix.needsUpdate = true;
    },
    { phase: 'update' },
  );

  const onPointerMove = (event: ThreeEvent<PointerEvent>) => {
    // R3F already raycast for us: `event.ray` is the camera ray the impulses use and
    // `event.point` is its hit on this plane — which sits exactly where the original
    // intersected its hand-built front `Plane`.
    pointer.rayTarget.copy(event.ray);
    pointer.lightTarget.copy(event.point);
    pointer.movingUntil = performance.now() + MOVE_WINDOW_MS;
  };

  return (
    <>
      {/* The only direct light in the scene. Everything lit off-axis is GI. */}
      <pointLight
        ref={lightRef}
        intensity={80}
        position={[0, BOX_HEIGHT / 2, BOX_DEPTH / 2]}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-radius={20}
      />

      {roomWalls(width).map(
        (wall) =>
          wall.color && (
            <mesh key={wall.position.join()} position={wall.position} receiveShadow>
              <boxGeometry args={wall.size} />
              <meshPhysicalMaterial color={wall.color} roughness={0.7} metalness={0} />
            </mesh>
          ),
      )}

      <instancedMesh ref={ballsRef} args={[undefined, undefined, bodies.length]} castShadow receiveShadow>
        <sphereGeometry args={[BALL_RADIUS, 32, 16]} />
        <meshPhysicalMaterial roughness={0.3} metalness={0.1} />
      </instancedMesh>

      {/* Pointer plane, standing in the room's open front. Material-invisible rather
          than mesh-invisible, so it still raycasts but never reaches the G-buffer. */}
      <mesh
        position-z={BOX_DEPTH / 2}
        onPointerMove={onPointerMove}
        onPointerDown={() => (pointer.down = true)}
        onPointerUp={() => (pointer.down = false)}
        onPointerLeave={() => (pointer.down = false)}>
        <planeGeometry args={[width * 4, BOX_HEIGHT * 4]} />
        <meshBasicMaterial visible={false} />
      </mesh>
    </>
  );
}

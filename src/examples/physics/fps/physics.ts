// The simulation half, with no React in it: a capsule player and a pool of ball
// colliders stepped against a static Octree. Every function here mutates the state it
// is handed — the frame loop owns these objects, React never reads them.
import { Sphere, Vector3, type Camera } from 'three/webgpu';
import { Capsule } from 'three/addons/math/Capsule.js';
import type { Octree } from 'three/addons/math/Octree.js';

export const GRAVITY = 30;
export const NUM_SPHERES = 100;
export const SPHERE_RADIUS = 0.2;
// Collisions run in substeps so a fast ball can't pass through a wall between frames.
export const STEPS_PER_FRAME = 5;

export type Player = { collider: Capsule; velocity: Vector3; direction: Vector3; onFloor: boolean };
export type Ball = { collider: Sphere; velocity: Vector3 };
export type Keys = { forward: boolean; backward: boolean; left: boolean; right: boolean; jump: boolean };

const vector1 = new Vector3();
const vector2 = new Vector3();
const vector3 = new Vector3();

export function createPlayer(): Player {
  return {
    collider: new Capsule(new Vector3(0, 0.35, 0), new Vector3(0, 1, 0), 0.35),
    velocity: new Vector3(),
    direction: new Vector3(),
    onFloor: false,
  };
}

// Unthrown balls wait far below the world.
export function createBalls(): Ball[] {
  return Array.from({ length: NUM_SPHERES }, () => ({
    collider: new Sphere(new Vector3(0, -100, 0), SPHERE_RADIUS),
    velocity: new Vector3(),
  }));
}

//* Player ========================================================

function forwardVector(player: Player, camera: Camera) {
  camera.getWorldDirection(player.direction);
  player.direction.y = 0;
  return player.direction.normalize();
}

function sideVector(player: Player, camera: Camera) {
  return forwardVector(player, camera).cross(camera.up);
}

export function applyControls(player: Player, camera: Camera, keys: Keys, dt: number) {
  // A bit of air control, much less than on the ground.
  const speedDelta = dt * (player.onFloor ? 25 : 8);
  if (keys.forward) player.velocity.add(forwardVector(player, camera).multiplyScalar(speedDelta));
  if (keys.backward) player.velocity.add(forwardVector(player, camera).multiplyScalar(-speedDelta));
  if (keys.left) player.velocity.add(sideVector(player, camera).multiplyScalar(-speedDelta));
  if (keys.right) player.velocity.add(sideVector(player, camera).multiplyScalar(speedDelta));
  if (player.onFloor && keys.jump) player.velocity.y = 15;
}

function playerCollisions(player: Player, world: Octree) {
  const result = world.capsuleIntersect(player.collider);
  player.onFloor = false;
  if (!result) return;

  // Anything up to ~81° counts as floor; sheer walls just deflect.
  player.onFloor = result.normal.y >= 0.15;
  if (!player.onFloor) player.velocity.addScaledVector(result.normal, -result.normal.dot(player.velocity));
  if (result.depth >= 1e-10) player.collider.translate(result.normal.multiplyScalar(result.depth));
}

export function updatePlayer(player: Player, world: Octree, dt: number) {
  let damping = Math.exp(-4 * dt) - 1;
  if (!player.onFloor) {
    player.velocity.y -= GRAVITY * dt;
    damping *= 0.1; // small air resistance
  }
  player.velocity.addScaledVector(player.velocity, damping);
  player.collider.translate(vector1.copy(player.velocity).multiplyScalar(dt));
  playerCollisions(player, world);
}

/** Fell out of the world: back to the start. Returns true so the caller can reset the view. */
export function teleportIfOutOfBounds(player: Player) {
  if (player.collider.end.y > -25) return false;
  player.collider.start.set(0, 0.35, 0);
  player.collider.end.set(0, 1, 0);
  player.collider.radius = 0.35;
  return true;
}

//* Balls =========================================================

export function throwBall(ball: Ball, player: Player, camera: Camera, heldMs: number) {
  camera.getWorldDirection(player.direction);
  ball.collider.center.copy(player.collider.end).addScaledVector(player.direction, player.collider.radius * 1.5);

  // Harder the longer the button was held, plus a share of the player's own motion.
  const impulse = 15 + 30 * (1 - Math.exp(-heldMs * 0.001));
  ball.velocity.copy(player.direction).multiplyScalar(impulse);
  ball.velocity.addScaledVector(player.velocity, 2);
}

function playerBallCollision(player: Player, ball: Ball) {
  const center = vector1.addVectors(player.collider.start, player.collider.end).multiplyScalar(0.5);
  const ballCenter = ball.collider.center;
  const r = player.collider.radius + ball.collider.radius;
  const r2 = r * r;

  // Approximation: the player is three spheres.
  for (const point of [player.collider.start, player.collider.end, center]) {
    const d2 = point.distanceToSquared(ballCenter);
    if (d2 >= r2) continue;

    const normal = vector1.subVectors(point, ballCenter).normalize();
    const v1 = vector2.copy(normal).multiplyScalar(normal.dot(player.velocity));
    const v2 = vector3.copy(normal).multiplyScalar(normal.dot(ball.velocity));
    player.velocity.add(v2).sub(v1);
    ball.velocity.add(v1).sub(v2);

    const d = (r - Math.sqrt(d2)) / 2;
    ballCenter.addScaledVector(normal, -d);
  }
}

function ballCollisions(balls: Ball[]) {
  for (let i = 0; i < balls.length; i++) {
    const s1 = balls[i];
    for (let j = i + 1; j < balls.length; j++) {
      const s2 = balls[j];
      const d2 = s1.collider.center.distanceToSquared(s2.collider.center);
      const r = s1.collider.radius + s2.collider.radius;
      const r2 = r * r;
      if (d2 >= r2) continue;

      const normal = vector1.subVectors(s1.collider.center, s2.collider.center).normalize();
      const v1 = vector2.copy(normal).multiplyScalar(normal.dot(s1.velocity));
      const v2 = vector3.copy(normal).multiplyScalar(normal.dot(s2.velocity));
      s1.velocity.add(v2).sub(v1);
      s2.velocity.add(v1).sub(v2);

      const d = (r - Math.sqrt(d2)) / 2;
      s1.collider.center.addScaledVector(normal, d);
      s2.collider.center.addScaledVector(normal, -d);
    }
  }
}

export function updateBalls(balls: Ball[], player: Player, world: Octree, dt: number) {
  for (const ball of balls) {
    ball.collider.center.addScaledVector(ball.velocity, dt);

    const result = world.sphereIntersect(ball.collider);
    if (result) {
      ball.velocity.addScaledVector(result.normal, -result.normal.dot(ball.velocity) * 1.5);
      ball.collider.center.add(result.normal.multiplyScalar(result.depth));
    } else {
      ball.velocity.y -= GRAVITY * dt;
    }

    const damping = Math.exp(-1.5 * dt) - 1;
    ball.velocity.addScaledVector(ball.velocity, damping);

    playerBallCollision(player, ball);
  }

  ballCollisions(balls);
}

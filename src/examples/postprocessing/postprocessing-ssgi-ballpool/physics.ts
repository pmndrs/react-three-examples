// The simulation half of the demo: room dimensions, the wall layout, and the bounce
// world built from it. Vanilla by necessity — bounce is a plain imperative library —
// so it stays one visible block here instead of being smeared across effects.
import { World } from '@perplexdotgg/bounce';

export const BALL_RADIUS = 0.4;
export const BOX_HEIGHT = 6;
export const BOX_DEPTH = 8;
export const CAM_FOV = 45;
/** Dolly the camera back until the room's height exactly fills the frame. */
export const CAM_DISTANCE = BOX_HEIGHT / 2 / Math.tan(((CAM_FOV / 2) * Math.PI) / 180) + BOX_DEPTH / 2;

const FILL_RATIO = 0.4;
const PACKING = 0.6;
const WALL_THICKNESS = 0.5;

//* Room layout ====================================================
// One data array drives BOTH the collision boxes and the meshes. The wall with no
// color is the open front the camera looks through: a collider, never drawn.
export type Wall = { size: [number, number, number]; position: [number, number, number]; color?: string };

export function roomWalls(width: number): Wall[] {
  const [hw, hh, hd, t] = [width / 2, BOX_HEIGHT / 2, BOX_DEPTH / 2, WALL_THICKNESS];
  return [
    { size: [width, t, BOX_DEPTH], position: [0, -t / 2, 0], color: '#eeeeee' },
    { size: [width, t, BOX_DEPTH], position: [0, BOX_HEIGHT + t / 2, 0], color: '#eeeeee' },
    { size: [width, BOX_HEIGHT, t], position: [0, hh, -hd - t / 2], color: '#eeeeee' },
    { size: [width, BOX_HEIGHT, t], position: [0, hh, hd + t / 2] },
    { size: [t, BOX_HEIGHT, BOX_DEPTH], position: [-hw - t / 2, hh, 0], color: '#ff2222' },
    { size: [t, BOX_HEIGHT, BOX_DEPTH], position: [hw + t / 2, hh, 0], color: '#22ff22' },
  ];
}

//* World ==========================================================
export function createWorld(width: number) {
  const world = new World({
    gravity: [0, -9.81, 0],
    solveVelocityIterations: 6,
    solvePositionIterations: 2,
    linearDamping: 0.1,
    angularDamping: 0.1,
    restitution: 0.4,
    friction: 0.5,
  });

  for (const wall of roomWalls(width)) {
    const shape = world.createBox({ width: wall.size[0], height: wall.size[1], depth: wall.size[2] });
    world.createStaticBody({ shape, position: wall.position });
  }

  // Enough balls to fill FILL_RATIO of the room at PACKING density.
  const ballVolume = (4 / 3) * Math.PI * BALL_RADIUS ** 3;
  const count = Math.floor((width * BOX_HEIGHT * BOX_DEPTH * FILL_RATIO * PACKING) / ballVolume);

  const shape = world.createSphere({ radius: BALL_RADIUS });
  const bodies = Array.from({ length: count }, () =>
    world.createDynamicBody({
      shape, // one shape, N bodies — bounce shares it the way three shares a geometry
      position: randomSpot(width, BALL_RADIUS + Math.random() * (BOX_HEIGHT - BALL_RADIUS * 2)),
      mass: 1,
      restitution: 0.5,
      friction: 0.4,
    }),
  );

  return { world, bodies };
}

/** A random spot inside the room at the given height, inset by one ball radius. */
export function randomSpot(width: number, y: number): [number, number, number] {
  const hw = width / 2 - BALL_RADIUS - 0.1;
  const hd = BOX_DEPTH / 2 - BALL_RADIUS - 0.1;
  return [(Math.random() - 0.5) * 2 * hw, y, (Math.random() - 0.5) * 2 * hd];
}

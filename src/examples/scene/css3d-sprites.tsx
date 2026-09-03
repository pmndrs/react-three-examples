/**
 * css3d-sprites
 * 512 HTML sprites that flow between four formations — a rippling plane, a cube, a random
 * cloud and a sphere — every six seconds, each one breathing in size as it goes.
 * Original: https://threejs.org/examples/#css3d_sprites
 *
 * DEMONSTRATES
 * - drei's `<Html transform sprite>`: a DOM `<img>` billboarded in 3D like a `THREE.Sprite`.
 *   The original needs a second renderer (`CSS3DRenderer`) and a `CSS3DSprite` per image; here
 *   the 512 sprites are one `map` over a plain `<group>`
 * - The formation cycle as ONE `useFrame`: per-sprite tween state in a ref, TWEEN.js's
 *   `Exponential.InOut` easing written out, and the six-second clock that restarts the loop
 * - The frame loop mutates the `<Html>` groups directly (`group.children` ARE the sprites),
 *   the same shape as the original's `objects` loop
 *
 * DIVERGENCE from original
 * - Slug carries the `css3d-` prefix because `sprites` is already `webgpu_sprites`
 */
import { useMemo, useRef } from 'react';
import { NoToneMapping, Vector3 } from 'three/webgpu';
import type { Group } from 'three/webgpu';
import { Canvas, useFrame } from '@react-three/fiber/webgpu';
import { Html } from '@react-three/drei/webgpu';
import { DemoHelpers } from '../../utils/DemoHelpers';

const SPRITE_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/sprite.png';

const COUNT = 512;
const DURATION_MS = 2000;

//* Formations ====================================================

const random = () => Math.random() * 4000 - 2000;

function computeFormations() {
  const index = Array.from({ length: COUNT }, (_, i) => i);

  // Plane: a 16 x 32 grid rippled by two sine waves.
  const amountX = 16;
  const separationPlane = 150;
  const offsetX = ((amountX - 1) * separationPlane) / 2;
  const offsetZ = ((COUNT / amountX - 1) * separationPlane) / 2;
  const plane = index.map((i) => {
    const x = (i % amountX) * separationPlane;
    const z = Math.floor(i / amountX) * separationPlane;
    const y = (Math.sin(x * 0.5) + Math.sin(z * 0.5)) * 200;
    return new Vector3(x - offsetX, y, z - offsetZ);
  });

  // Cube: 8 x 8 x 8.
  const amount = 8;
  const separationCube = 150;
  const offset = ((amount - 1) * separationCube) / 2;
  const cube = index.map((i) => {
    const x = (i % amount) * separationCube;
    const y = Math.floor((i / amount) % amount) * separationCube;
    const z = Math.floor(i / (amount * amount)) * separationCube;
    return new Vector3(x - offset, y - offset, z - offset);
  });

  const cloud = index.map(() => new Vector3(random(), random(), random()));

  // Sphere: a Fibonacci-style spiral over the surface.
  const radius = 750;
  const sphere = index.map((i) => {
    const phi = Math.acos(-1 + (2 * i) / COUNT);
    const theta = Math.sqrt(COUNT * Math.PI) * phi;
    return new Vector3(
      radius * Math.cos(theta) * Math.sin(phi),
      radius * Math.sin(theta) * Math.sin(phi),
      radius * Math.cos(phi),
    );
  });

  return [plane, cube, cloud, sphere];
}

//* Tween =========================================================

// TWEEN.Easing.Exponential.InOut
const easeExpoInOut = (k: number) =>
  k <= 0 ? 0 : k >= 1 ? 1 : k < 0.5 ? 0.5 * 2 ** (20 * k - 10) : 1 - 0.5 * 2 ** (10 - 20 * k);

interface SpriteTween {
  from: Vector3;
  start: number;
  duration: number;
}

//* Scene =========================================================

function SpriteField() {
  const formations = useMemo(computeFormations, []);
  const spawn = useMemo(() => Array.from({ length: COUNT }, () => new Vector3(random(), random(), random())), []);

  const spritesRef = useRef<Group>(null);
  // Tween state allocated once; the loop only ever copies into it.
  const tweens = useMemo<SpriteTween[]>(
    () => Array.from({ length: COUNT }, () => ({ from: new Vector3(), start: 0, duration: 0 })),
    [],
  );
  const cycle = useRef({ formation: -1, nextAt: 0 });

  useFrame(() => {
    const sprites = spritesRef.current!.children;
    const now = performance.now();
    const state = cycle.current;

    // Every three durations, send every sprite towards the next formation with its own
    // random duration — the original's recursive `transition()`.
    if (now >= state.nextAt) {
      tweens.forEach((tween, i) => {
        tween.from.copy(sprites[i].position);
        tween.start = now;
        tween.duration = Math.random() * DURATION_MS + DURATION_MS;
      });
      state.formation = (state.formation + 1) % formations.length;
      state.nextAt = now + DURATION_MS * 3;
    }

    const targets = formations[state.formation];
    sprites.forEach((sprite, i) => {
      const tween = tweens[i];
      sprite.position.lerpVectors(tween.from, targets[i], easeExpoInOut((now - tween.start) / tween.duration));
      sprite.scale.setScalar(Math.sin((Math.floor(sprite.position.x) + now) * 0.002) * 0.3 + 1);
    });
  });

  return (
    <group ref={spritesRef}>
      {spawn.map((position, i) => (
        <Html key={i} transform sprite distanceFactor={400} position={position}>
          <img src={SPRITE_URL} />
        </Html>
      ))}
    </group>
  );
}

export default function Css3dSprites() {
  return (
    <Canvas
      // No renderer at all in the original, so no tone mapping: keep the page white, not ACES grey.
      renderer={{ toneMapping: NoToneMapping }}
      background="#ffffff"
      camera={{ position: [600, 400, 1500], fov: 75, near: 1, far: 5000 }}>
      <SpriteField />
      <DemoHelpers grid={false} />
    </Canvas>
  );
}

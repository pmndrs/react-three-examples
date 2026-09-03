/**
 * periodictable
 * The 118 elements as glowing HTML cards floating in 3D, tweened between four layouts:
 * the periodic table, a sphere, a double helix and a stack of 5x5 grids.
 * Original: https://threejs.org/examples/#css3d_periodictable
 *
 * DEMONSTRATES
 * - drei's `<Html transform>`: a DOM element placed by a real three.js world matrix — position
 *   AND rotation — under the scene camera's perspective. The original runs `CSS3DRenderer`, a
 *   whole second renderer kept in step with the camera by hand, plus one `CSS3DObject` per
 *   card; here a card is one component under a plain `<group>`
 * - `distanceFactor={400}` is CSS3DRenderer's unit scale: one world unit is one CSS pixel
 * - Four layouts computed once as position/rotation targets, and the tween is one `useFrame`
 *   over the card groups — per-card random duration and exponential easing, no tween library
 * - The WebGPU canvas draws nothing: the entire picture is DOM. The manifest marks the example
 *   `static` because the animation tier diffs canvas pixels, and these never change
 *
 * DIVERGENCE from original
 * - The four layout buttons become one leva select; TWEEN.js becomes a lerp with its
 *   `Exponential.InOut` curve written out
 */
import { useEffect, useMemo, useRef } from 'react';
import { MathUtils, Object3D, Vector3 } from 'three/webgpu';
import type { Euler, Group } from 'three/webgpu';
import { Canvas, useFrame } from '@react-three/fiber/webgpu';
import { Html } from '@react-three/drei/webgpu';
import { useControls } from 'leva';
import { DemoHelpers } from '../../../utils/DemoHelpers';
import { ELEMENTS } from './elements';

//* Layouts ======================================================

type Layout = 'table' | 'sphere' | 'helix' | 'grid';

interface Pose {
  position: Vector3;
  rotation: Euler;
}

// One pose per card per layout. A scratch Object3D does the `lookAt` maths for the curved
// layouts, exactly as the original's throwaway `Object3D` targets did.
function computeLayouts(): Record<Layout, Pose[]> {
  const count = ELEMENTS.length;
  const scratch = new Object3D();
  const vector = new Vector3();
  const pose = (): Pose => ({ position: scratch.position.clone(), rotation: scratch.rotation.clone() });

  return {
    table: ELEMENTS.map(([, , , column, row]) => {
      scratch.position.set(column * 140 - 1330, -(row * 180) + 990, 0);
      scratch.rotation.set(0, 0, 0);
      return pose();
    }),
    sphere: ELEMENTS.map((_, i) => {
      const phi = Math.acos(-1 + (2 * i) / count);
      const theta = Math.sqrt(count * Math.PI) * phi;
      scratch.position.setFromSphericalCoords(800, phi, theta);
      scratch.lookAt(vector.copy(scratch.position).multiplyScalar(2)); // face outward
      return pose();
    }),
    helix: ELEMENTS.map((_, i) => {
      const theta = i * 0.175 + Math.PI;
      const y = -(i * 8) + 450;
      scratch.position.setFromCylindricalCoords(900, theta, y);
      scratch.lookAt(vector.set(scratch.position.x * 2, scratch.position.y, scratch.position.z * 2));
      return pose();
    }),
    grid: ELEMENTS.map((_, i) => {
      scratch.position.set((i % 5) * 400 - 800, -(Math.floor(i / 5) % 5) * 400 + 800, Math.floor(i / 25) * 1000 - 2000);
      scratch.rotation.set(0, 0, 0);
      return pose();
    }),
  };
}

//* Tween =========================================================

const DURATION_MS = 2000;

// TWEEN.Easing.Exponential.InOut
const easeExpoInOut = (k: number) =>
  k <= 0 ? 0 : k >= 1 ? 1 : k < 0.5 ? 0.5 * 2 ** (20 * k - 10) : 1 - 0.5 * 2 ** (10 - 20 * k);

interface CardTween {
  from: Pose;
  start: number;
  duration: number;
}

//* Scene =========================================================

const random = (range: number) => Math.random() * range - range / 2;

function ElementCards() {
  const { layout } = useControls('Periodic Table', {
    layout: { value: 'table' as Layout, options: ['table', 'sphere', 'helix', 'grid'] satisfies Layout[] },
  });

  const layouts = useMemo(computeLayouts, []);
  // Every card starts somewhere in a 4000-unit cloud with its own translucent tint.
  const cards = useMemo(
    () =>
      ELEMENTS.map(() => ({
        spawn: [random(4000), random(4000), random(4000)] as [number, number, number],
        tint: `rgba(0,127,127,${Math.random() * 0.5 + 0.25})`,
      })),
    [],
  );

  const cardsRef = useRef<Group>(null);
  const tweens = useRef<CardTween[]>([]);

  // A layout change starts every card's tween from wherever it is right now — including the
  // very first one, from the spawn cloud into the table.
  useEffect(() => {
    const start = performance.now();
    tweens.current = cardsRef.current!.children.map((card) => ({
      from: { position: card.position.clone(), rotation: card.rotation.clone() },
      start,
      duration: Math.random() * DURATION_MS + DURATION_MS,
    }));
  }, [layout]);

  useFrame(() => {
    const now = performance.now();
    const poses = layouts[layout];
    cardsRef.current!.children.forEach((card, i) => {
      const tween = tweens.current[i];
      if (!tween) return;
      const k = easeExpoInOut((now - tween.start) / tween.duration);
      const { position, rotation } = poses[i];
      card.position.lerpVectors(tween.from.position, position, k);
      card.rotation.set(
        MathUtils.lerp(tween.from.rotation.x, rotation.x, k),
        MathUtils.lerp(tween.from.rotation.y, rotation.y, k),
        MathUtils.lerp(tween.from.rotation.z, rotation.z, k),
      );
    });
  });

  return (
    <group ref={cardsRef}>
      {ELEMENTS.map(([symbol, name, mass], i) => (
        <group key={symbol} position={cards[i].spawn}>
          <Html transform distanceFactor={400}>
            <ElementCard number={i + 1} symbol={symbol} name={name} mass={mass} tint={cards[i].tint} />
          </Html>
        </group>
      ))}
    </group>
  );
}

interface ElementCardProps {
  number: number;
  symbol: string;
  name: string;
  mass: string;
  tint: string;
}

// The original's `.element` card. Box glow and border brighten on hover (Tailwind, since
// inline styles cannot express `:hover`); everything else is inline.
function ElementCard({ number, symbol, name, mass, tint }: ElementCardProps) {
  return (
    <div
      className="border border-[rgba(127,255,255,0.25)] shadow-[0_0_12px_rgba(0,255,255,0.5)] hover:border-[rgba(127,255,255,0.75)] hover:shadow-[0_0_12px_rgba(0,255,255,0.75)]"
      style={{
        width: 120,
        height: 160,
        position: 'relative',
        backgroundColor: tint,
        fontFamily: 'Helvetica, sans-serif',
        textAlign: 'center',
        lineHeight: 'normal',
        cursor: 'default',
        color: 'rgba(127,255,255,0.75)',
        fontSize: 12,
      }}>
      <div style={{ position: 'absolute', top: 20, right: 20 }}>{number}</div>
      <div
        style={{
          position: 'absolute',
          top: 40,
          left: 0,
          right: 0,
          fontSize: 60,
          fontWeight: 'bold',
          color: 'rgba(255,255,255,0.75)',
          textShadow: '0 0 10px rgba(0,255,255,0.95)',
        }}>
        {symbol}
      </div>
      <div style={{ position: 'absolute', bottom: 15, left: 0, right: 0 }}>
        {name}
        <br />
        {mass}
      </div>
    </div>
  );
}

export default function PeriodicTable() {
  return (
    <Canvas renderer background="#000000" camera={{ position: [0, 0, 3000], fov: 40, near: 1, far: 10000 }}>
      <ElementCards />
      <DemoHelpers grid={false} minDistance={500} maxDistance={6000} />
    </Canvas>
  );
}

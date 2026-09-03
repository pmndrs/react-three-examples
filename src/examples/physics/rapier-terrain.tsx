/**
 * rapier-terrain
 * A rolling heightfield with spheres, boxes and cylinders raining onto it — up to thirty
 * at a time, one every half second — each dropped from the list once it rolls off the
 * edge and out of the world.
 * Original: https://threejs.org/examples/#physics_rapier_terrain
 *
 * DEMONSTRATES
 * - `<HeightfieldCollider>` fed the same height array that displaces the plane's
 *   vertices — one height table, two consumers
 * - Writing those heights through a `<planeGeometry>` ref in a `useLayoutEffect`
 *   (idempotent, so StrictMode is safe) instead of building the geometry by hand
 * - A spawner on the frame loop (`elapsed`, not `setInterval`) that touches React only
 *   when a body is born; each body removes itself when it falls out of the world
 * - `<CylinderCollider>` where auto-colliders can't produce a cylinder; `ball` and
 *   `cuboid` where they can
 *
 * DIVERGENCE from original
 * - The original's `updatePhysics()` "help" pass — wake every resting body each frame and
 *   shove slow ones downward — works around a problem this port doesn't have (the bodies
 *   fall fine), and its `else` branch can never run. Dropped.
 */
import { Suspense, useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { NoToneMapping, RepeatWrapping, type PlaneGeometry } from 'three/webgpu';
import { Canvas, useFrame, useTexture } from '@react-three/fiber/webgpu';
import {
  CylinderCollider,
  HeightfieldCollider,
  Physics,
  RigidBody,
  type RapierRigidBody,
  type RigidBodyProps,
} from '@react-three/rapier';

import { DemoHelpers } from '../../utils/DemoHelpers';

const ASSETS = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/';

//* Heightfield ===================================================

const EXTENT = 100;
const SEGMENTS = 128;
const MIN_HEIGHT = -2;
const MAX_HEIGHT = 8;

// Concentric sine ripples, sampled on the plane's vertex grid. A plain array rather than
// the original's Float32Array only because that is what `<HeightfieldCollider>` is typed
// to take; rapier accepts either.
function generateHeights(width: number, depth: number, minHeight: number, maxHeight: number) {
  const data: number[] = [];
  const range = maxHeight - minHeight;
  for (let j = 0; j < depth; j++) {
    for (let i = 0; i < width; i++) {
      const radius = Math.hypot((i - width / 2) / (width / 2), (j - depth / 2) / (depth / 2));
      data.push((Math.sin(radius * 12) + 1) * 0.5 * range + minHeight);
    }
  }
  return data;
}

const HEIGHTS = generateHeights(SEGMENTS, SEGMENTS, MIN_HEIGHT, MAX_HEIGHT);

function Terrain() {
  const geometryRef = useRef<PlaneGeometry>(null);
  const grid = useTexture(`${ASSETS}textures/grid.png`, (texture) => {
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.repeat.set(SEGMENTS - 1, SEGMENTS - 1);
  });

  // The plane lies in xy; the mesh's -90° x rotation turns its z into world height.
  useLayoutEffect(() => {
    const geometry = geometryRef.current;
    if (!geometry) return;
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) position.setZ(i, HEIGHTS[i]);
    position.needsUpdate = true;
    geometry.computeVertexNormals();
  }, []);

  return (
    <RigidBody type="fixed" colliders={false}>
      <HeightfieldCollider args={[SEGMENTS - 1, SEGMENTS - 1, HEIGHTS, { x: EXTENT, y: 1, z: EXTENT }]} />
      <mesh rotation-x={-Math.PI / 2} castShadow receiveShadow>
        <planeGeometry ref={geometryRef} args={[EXTENT, EXTENT, SEGMENTS - 1, SEGMENTS - 1]} />
        <meshPhongNodeMaterial color="#c7c7c7" map={grid} />
      </mesh>
    </RigidBody>
  );
}

//* Falling bodies ================================================

const OBJECT_SIZE = 3;
const MAX_OBJECTS = 30;

type Size = [number, number, number];
type ShapeSpec = Pick<RigidBodyProps, 'colliders'> & { geometry: ReactNode; collider?: ReactNode };

// Random sizes are drawn once per body; the shape table turns them into geometry and,
// where the collider can't be inferred, an explicit one.
const SHAPES: Record<'sphere' | 'box' | 'cylinder', (size: Size) => ShapeSpec> = {
  sphere: ([radius]) => ({ colliders: 'ball', geometry: <sphereGeometry args={[radius, 20, 20]} /> }),
  box: (size) => ({ colliders: 'cuboid', geometry: <boxGeometry args={size} /> }),
  cylinder: ([radius, height]) => ({
    colliders: false,
    geometry: <cylinderGeometry args={[radius, radius, height, 20, 1]} />,
    collider: <CylinderCollider args={[height / 2, radius]} />,
  }),
};

type Shape = keyof typeof SHAPES;
type BodySpec = { id: number; shape: Shape; size: Size; color: number; position: [number, number, number] };

let nextId = 0;
function spawn(): BodySpec {
  const shapes = Object.keys(SHAPES) as Shape[];
  const dimension = () => 1 + Math.random() * OBJECT_SIZE;
  return {
    id: nextId++,
    shape: shapes[Math.floor(Math.random() * shapes.length)],
    size: [dimension(), dimension(), dimension()],
    color: Math.floor(Math.random() * (1 << 24)),
    position: [
      (Math.random() - 0.5) * SEGMENTS * 0.6,
      MAX_HEIGHT + OBJECT_SIZE + 15 + Math.random() * 5,
      (Math.random() - 0.5) * SEGMENTS * 0.6,
    ],
  };
}

function FallingBody({ id, shape, size, color, position, onFall }: BodySpec & { onFall: (id: number) => void }) {
  const bodyRef = useRef<RapierRigidBody>(null);
  const { colliders, geometry, collider } = SHAPES[shape](size);

  useFrame(() => {
    if (bodyRef.current && bodyRef.current.translation().y < MIN_HEIGHT - 10) onFall(id);
  });

  return (
    <RigidBody ref={bodyRef} position={position} colliders={colliders} mass={OBJECT_SIZE * 5} restitution={0.3}>
      {collider}
      <mesh castShadow receiveShadow>
        {geometry}
        <meshPhongNodeMaterial color={color} />
      </mesh>
    </RigidBody>
  );
}

function Spawner() {
  const [bodies, setBodies] = useState<BodySpec[]>([]);
  // The original waits 3 s before the first drop and 0.5 s between the rest.
  const nextSpawnRef = useRef<number | null>(null);

  useFrame(({ elapsed }) => {
    nextSpawnRef.current ??= elapsed + 3;
    if (bodies.length < MAX_OBJECTS && elapsed > nextSpawnRef.current) {
      setBodies((list) => [...list, spawn()]);
      nextSpawnRef.current = elapsed + 0.5;
    }
  });

  const remove = useCallback((id: number) => setBodies((list) => list.filter((body) => body.id !== id)), []);

  return bodies.map((body) => <FallingBody key={body.id} {...body} onFall={remove} />);
}

//* Scene =========================================================

// Above the centre ripple's crest, looking at the origin; the original disables zoom.
const CAMERA_POSITION: [number, number, number] = [
  0,
  HEIGHTS[SEGMENTS / 2 + (SEGMENTS / 2) * SEGMENTS] * 10 + 5,
  EXTENT / 2,
];
const CAMERA_DISTANCE = Math.hypot(...CAMERA_POSITION);

export default function RapierTerrain() {
  return (
    <Canvas
      renderer={{ toneMapping: NoToneMapping }}
      shadows
      background="#bfd1e5"
      camera={{ fov: 60, position: CAMERA_POSITION, near: 0.2, far: 2000 }}>
      <ambientLight color="#bbbbbb" />
      <directionalLight
        position={[100, 100, 50]}
        intensity={3}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-50}
        shadow-camera-right={50}
        shadow-camera-top={50}
        shadow-camera-bottom={-50}
        shadow-camera-near={200 / 30}
        shadow-camera-far={200}
      />

      <Suspense>
        <Physics>
          <Terrain />
          <Spawner />
        </Physics>
      </Suspense>

      <DemoHelpers grid={false} minDistance={CAMERA_DISTANCE} maxDistance={CAMERA_DISTANCE} />
    </Canvas>
  );
}

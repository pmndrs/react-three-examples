/**
 * geometries
 * Sixteen of three.js's built-in geometries on one slow turntable, all wearing the same
 * UV-grid texture so you can see how each one lays out its uvs.
 * Original: https://threejs.org/examples/#webgl_geometries
 *
 * DEMONSTRATES
 * - The gallery is a data array mapped to `<mesh>`: each entry is a position plus the
 *   geometry element to mount there — no `new Mesh(...)` / `scene.add(...)` per shape
 * - `<parametricGeometry>` (an addon, registered via `extend()`) beside the core
 *   primitives, driven by the stock `klein`/`mobius` parametric functions
 * - Spinning every exhibit from one `useFrame` that walks the group's children — the
 *   declarative stand-in for the original's `scene.traverse`
 * - A point light riding on the camera, and camera-controls' `autoRotate` in place of the
 *   original's hand-animated camera orbit (you can still grab it)
 */
import { Suspense, useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { DoubleSide, NoToneMapping, RepeatWrapping, SRGBColorSpace, Vector2 } from 'three/webgpu';
import type { Group, Vector3 } from 'three/webgpu';
import { klein, mobius } from 'three/addons/geometries/ParametricFunctions.js';
import { Canvas, useFrame } from '@react-three/fiber/webgpu';
import { PerspectiveCamera, useTexture } from '@react-three/drei/webgpu';
import '../../assets/ParametricGeometry';
import { DemoHelpers } from '../../utils/DemoHelpers';

const UV_GRID_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/uv_grid_opengl.jpg';

const LATHE_POINTS = Array.from(
  { length: 50 },
  (_, i) => new Vector2(Math.sin(i * 0.2) * Math.sin(i * 0.1) * 15 + 50, (i - 5) * 2),
);

// The stock `plane` is the unit square (u, 0, v); the original scales it by 100 and calls
// `center()`. Written as one function so it stays a constructor arg.
function centeredPlane(u: number, v: number, target: Vector3) {
  target.set(u * 100 - 50, 0, v * 100 - 50);
}

type Exhibit = { position: [number, number, number]; scale?: number; geometry: ReactNode };

const EXHIBITS: Exhibit[] = [
  { position: [-300, 0, 300], geometry: <sphereGeometry args={[75, 20, 10]} /> },
  { position: [-100, 0, 300], geometry: <icosahedronGeometry args={[75]} /> },
  { position: [100, 0, 300], geometry: <octahedronGeometry args={[75]} /> },
  { position: [300, 0, 300], geometry: <tetrahedronGeometry args={[75]} /> },

  { position: [-300, 0, 100], geometry: <planeGeometry args={[100, 100, 4, 4]} /> },
  { position: [-100, 0, 100], geometry: <boxGeometry args={[100, 100, 100, 4, 4, 4]} /> },
  { position: [100, 0, 100], geometry: <circleGeometry args={[50, 20, 0, Math.PI * 2]} /> },
  { position: [300, 0, 100], geometry: <ringGeometry args={[10, 50, 20, 5, 0, Math.PI * 2]} /> },

  { position: [-300, 0, -100], geometry: <cylinderGeometry args={[25, 75, 100, 40, 5]} /> },
  { position: [-100, 0, -100], geometry: <latheGeometry args={[LATHE_POINTS, 20]} /> },
  { position: [100, 0, -100], geometry: <torusGeometry args={[50, 20, 20, 20]} /> },
  { position: [300, 0, -100], geometry: <torusKnotGeometry args={[50, 10, 50, 20]} /> },

  { position: [-300, 0, -300], geometry: <capsuleGeometry args={[20, 50]} /> },
  { position: [-100, 0, -300], geometry: <parametricGeometry args={[centeredPlane, 10, 10]} /> },
  { position: [100, 0, -300], scale: 5, geometry: <parametricGeometry args={[klein, 20, 20]} /> },
  { position: [300, 0, -300], scale: 30, geometry: <parametricGeometry args={[mobius, 20, 20]} /> },
];

function Gallery() {
  const groupRef = useRef<Group>(null);
  const map = useTexture(UV_GRID_URL);

  useLayoutEffect(() => {
    map.wrapS = map.wrapT = RepeatWrapping;
    map.anisotropy = 16;
    map.colorSpace = SRGBColorSpace;
  }, [map]);

  // Every exhibit tumbles at the same rate: walk the group's children, as the original
  // walks the scene.
  useFrame(({ elapsed }) => {
    const timer = elapsed * 0.1;
    for (const mesh of groupRef.current?.children ?? []) mesh.rotation.set(timer * 5, timer * 2.5, 0);
  });

  return (
    <group ref={groupRef}>
      {EXHIBITS.map(({ position, scale = 1, geometry }, i) => (
        <mesh key={i} position={position} scale={scale}>
          {geometry}
          <meshPhongNodeMaterial map={map} side={DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

export default function Geometries() {
  return (
    // The original never sets a tone mapping — WebGPURenderer's default is none.
    <Canvas renderer={{ toneMapping: NoToneMapping }} background="#000000">
      {/* The child light is the declarative form of the original's camera.add(light). */}
      <PerspectiveCamera makeDefault position={[800, 500, 0]} fov={45} near={1} far={2000}>
        <pointLight color="#ffffff" intensity={2.5} decay={0} />
      </PerspectiveCamera>
      <ambientLight color="#cccccc" intensity={1.5} />
      <Suspense fallback={null}>
        <Gallery />
      </Suspense>
      {/* autoRotateSpeed 1 ≈ one orbit a minute — the original's 0.1 rad/s camera circle. */}
      <DemoHelpers grid={false} autoRotate autoRotateSpeed={1} />
    </Canvas>
  );
}

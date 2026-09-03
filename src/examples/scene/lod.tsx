/**
 * lod
 * A thousand wireframe spheres in a black void. Fly through them (WASD/R/F to move, drag
 * or Q/E to turn) and watch each one swap between five icosahedron subdivisions as its
 * distance changes.
 * Original: https://threejs.org/examples/#webgl_lod
 *
 * DEMONSTRATES
 * - drei `<Detailed distances={[…]}>`: its children ARE the LOD levels, in order, and the
 *   per-frame `lod.update(camera)` is the component's — the original's `addLevel()` loop
 *   and `matrixAutoUpdate` bookkeeping are gone
 * - drei `<FlyControls>` owning its own `update(delta)`, so there is no `Timer` and no
 *   `animate()` body left
 * - One geometry per level and one material shared across all 5000 meshes — the
 *   documented performance exception to the JSX-material rule
 */
import { useMemo, useState } from 'react';
import { IcosahedronGeometry, MeshLambertNodeMaterial, NoToneMapping } from 'three/webgpu';
import { Canvas } from '@react-three/fiber/webgpu';
import { Detailed, FlyControls } from '@react-three/drei/webgpu';
import { DemoHelpers } from '../../utils/DemoHelpers';

const COUNT = 1000;
// [icosahedron detail, distance at which that level takes over]
const LEVELS: [number, number][] = [
  [16, 50],
  [8, 300],
  [4, 1000],
  [2, 2000],
  [1, 8000],
];

function SphereField() {
  // REVIEW(shared-instance): five geometries and one material across 5000 meshes, as in
  // the original; JSX children would allocate 5000 of each. Each LOD level needs its own
  // geometry, so <Instances> would be five instanced meshes plus hand-rolled LOD.
  const geometries = useMemo(() => LEVELS.map(([detail]) => new IcosahedronGeometry(100, detail)), []);
  const material = useMemo(() => new MeshLambertNodeMaterial({ color: '#ffffff', wireframe: true }), []);
  const [positions] = useState(() =>
    Array.from(
      { length: COUNT },
      () => [10000 * (0.5 - Math.random()), 7500 * (0.5 - Math.random()), 10000 * (0.5 - Math.random())] as const,
    ),
  );

  return positions.map((position, i) => (
    <Detailed key={i} position={position} distances={LEVELS.map(([, distance]) => distance)}>
      {geometries.map((geometry, level) => (
        <mesh key={level} geometry={geometry} material={material} scale={1.5} />
      ))}
    </Detailed>
  ));
}

export default function LodExample() {
  return (
    <Canvas
      // The original never sets a tone mapping — the renderer default is none.
      renderer={{ toneMapping: NoToneMapping }}
      background="#000000"
      camera={{ position: [0, 0, 1000], fov: 45, near: 1, far: 15000 }}>
      <fog attach="fog" args={['#000000', 1, 15000]} />
      <pointLight color="#ff2200" intensity={3} distance={0} decay={0} />
      <directionalLight color="#ffffff" intensity={3} position={[0, 0, 1]} />
      <SphereField />
      <FlyControls movementSpeed={1000} rollSpeed={Math.PI / 10} />
      {/* Fly controls replace the baseline orbit; no ground plane in a void. */}
      <DemoHelpers grid={false} controls={false} />
    </Canvas>
  );
}

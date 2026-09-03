/**
 * instancing-scatter
 * Two thousand flowers scattered across a spinning torus knot's surface via
 * MeshSurfaceSampler — each one grows, holds, then shrinks on its own clock, and
 * respawns at a freshly sampled point the instant it fully closes.
 * Original: https://threejs.org/examples/#webgl_instancing_scatter
 *
 * DEMONSTRATES
 * - `MeshSurfaceSampler` (three/addons) feeding two `InstancedMesh`es (stem + blossom)
 *   from one shared dummy transform per particle — sampled once per lifecycle, not
 *   every frame
 * - Per-instance age/scale state in plain `Float32Array`s, not React state: 2000
 *   values updated 60x/second would make the render loop the bottleneck
 * - `InstancedMesh.setColorAt` for a random per-blossom palette pick — instance colour
 *   is a GPU attribute, not something JSX can express per-index
 * - leva's function-form `useControls` for the particle count and distribution mode,
 *   plus a `button()` resample trigger wired to a plain nonce — same pattern as
 *   `animation-skinning-ik.tsx`'s manual-update button
 *
 * DIVERGENCE from original
 * - drei's `useSurfaceSampler`/`<Sampler>` weren't used: they do one batch sample into
 *   a buffer, not the raw per-call `sampler.sample()` this demo needs so individual
 *   particles can respawn independently — so this stays close to the original's own
 *   `MeshSurfaceSampler` usage (see `Flowers.tsx`).
 */
import { Suspense, useMemo, useRef, useState } from 'react';
import { TorusKnotGeometry } from 'three/webgpu';
import type { Group, Mesh } from 'three/webgpu';
import { Canvas, useFrame } from '@react-three/fiber/webgpu';
import { button, useControls } from 'leva';

import { DemoHelpers } from '../../../utils/DemoHelpers';
import { Flowers } from './Flowers';

const COUNT_MAX = 2000;

type Distribution = 'random' | 'weighted';

function ScatterScene() {
  const [resampleNonce, setResampleNonce] = useState(0);
  const [{ count, distribution }] = useControls('Scatter', () => ({
    count: { value: COUNT_MAX, min: 0, max: COUNT_MAX, step: 1 },
    distribution: { value: 'random' as Distribution, options: ['random', 'weighted'] as Distribution[] },
    resample: button(() => setResampleNonce((n) => n + 1)),
  }));

  const [surfaceMesh, setSurfaceMesh] = useState<Mesh | null>(null);
  // MeshSurfaceSampler requires non-indexed geometry for correct per-face weighting.
  const surfaceGeometry = useMemo(() => new TorusKnotGeometry(10, 3, 100, 16).toNonIndexed(), []);

  const groupRef = useRef<Group>(null);
  useFrame(({ elapsed }) => {
    const group = groupRef.current!;
    group.rotation.x = Math.sin(elapsed / 4);
    group.rotation.y = Math.sin(elapsed / 2);
  });

  return (
    <>
      <pointLight color="#aa8899" intensity={2.5} decay={0} position={[50, -25, 75]} />
      <ambientLight intensity={3} />

      <group ref={groupRef}>
        <mesh ref={setSurfaceMesh} geometry={surfaceGeometry}>
          <meshLambertNodeMaterial color="#fff784" />
        </mesh>
        <Suspense fallback={null}>
          <Flowers
            surfaceMesh={surfaceMesh}
            liveCount={count}
            distribution={distribution}
            resampleNonce={resampleNonce}
          />
        </Suspense>
      </group>
    </>
  );
}

export default function InstancingScatter() {
  return (
    <Canvas renderer background="#e39469" camera={{ position: [25, 25, 25], fov: 60, near: 0.1, far: 100 }}>
      <ScatterScene />
      <DemoHelpers grid={false} />
    </Canvas>
  );
}

/**
 * postprocessing-3dlut
 * A baked coffee mug with a column of TSL smoke, graded through a 3D colour lookup
 * table — the same LUTs a colourist would load in a video editor.
 * Original: https://threejs.org/examples/#webgpu_postprocessing_3dlut
 *
 * DEMONSTRATES
 * - `lut3D()` as the pipeline output: a `Data3DTexture` sampled per pixel, with
 *   pattern (b) for its intensity (assign a `useUniforms` node onto `intensityNode`)
 *   and plain `.value` writes to swap the table itself at runtime
 * - `outputColorTransform = false` + a manual `renderOutput()`, so the grade lands on
 *   the tone-mapped, sRGB-encoded image rather than raw linear light
 * - Nine LUTs in three file formats through `useLoader(Loader, [urls])` — three calls
 *   replace the original's loadAsync / Promise.all / re-await bookkeeping
 * - A vertex shader written as `positionNode`: `Smoke.tsx` twists and wind-blows a
 *   plain plane entirely on the GPU from one tiling noise texture
 */
import { Suspense, useLayoutEffect } from 'react';
import { NoToneMapping } from 'three/webgpu';
import type { Mesh, MeshStandardMaterial } from 'three/webgpu';
import { Canvas } from '@react-three/fiber/webgpu';
import { useGLTF } from '@react-three/drei/webgpu';

import { DemoHelpers } from '../../../utils/DemoHelpers';
import { LutPipeline } from './LutPipeline';
import { Smoke } from './Smoke';

const MUG_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/coffeeMug.glb';

//* Scene =========================================================

function CoffeeMug() {
  const { scene } = useGLTF(MUG_URL);
  const baked = scene.getObjectByName('baked') as Mesh<Mesh['geometry'], MeshStandardMaterial>;

  // useGLTF results are shared and outlive this mount, so the anisotropy bump is an
  // effect with a symmetric restore, not a mutation during render.
  useLayoutEffect(() => {
    const map = baked.material.map;
    if (!map) return;
    const previous = map.anisotropy;
    map.anisotropy = 8;
    return () => {
      map.anisotropy = previous;
    };
  }, [baked]);

  return <primitive object={scene} />;
}

export default function Postprocessing3dlut() {
  return (
    <Canvas
      // Original never sets a tone mapping (WebGPURenderer default) — fiber's Canvas
      // would otherwise default to ACESFilmic and change what the LUT is grading.
      renderer={{ antialias: true, toneMapping: NoToneMapping }}
      background="#000000"
      camera={{ position: [8, 10, 12], fov: 25, near: 0.1, far: 100 }}>
      {/* One boundary for all three suspending children: the pipeline is a
          creator-hook component, so it must not mount after an already-committed
          suspending sibling (AGENTS.md B18/B28). */}
      <Suspense fallback={null}>
        <LutPipeline />
        <CoffeeMug />
        <Smoke />
      </Suspense>
      <DemoHelpers grid={false} target={[0, 3, 0]} minDistance={0.1} maxDistance={50} />
    </Canvas>
  );
}

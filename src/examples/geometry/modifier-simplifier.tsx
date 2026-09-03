/**
 * modifier-simplifier
 * Lee Perry-Smith's head scan twice: the full mesh on the left, and on the right the same
 * mesh after `SimplifyModifier` has collapsed away 87.5% of its vertices — flat-shaded so
 * the surviving triangles read.
 * Original: https://threejs.org/examples/#webgl_modifier_simplifier
 *
 * DEMONSTRATES
 * - `SimplifyModifier` (edge-collapse decimation) as a one-shot CPU pass: `useMemo` keyed
 *   on the loaded mesh hands the reduced `BufferGeometry` straight to `<mesh geometry>`
 * - One GLB, two meshes: both share the asset's geometry/material by reference, so no
 *   `clone()` of the scene graph is needed
 * - A point light riding the camera, declared as a child of `<PerspectiveCamera>` — the
 *   original's `camera.add(light)` + `scene.add(camera)`
 * - Orbit-only controls: `pan={false}` plus equal dolly limits reproduce OrbitControls'
 *   `enablePan = enableZoom = false`
 */
import { Suspense, useMemo } from 'react';
import { NoToneMapping } from 'three/webgpu';
import type { Mesh, MeshStandardMaterial } from 'three/webgpu';
import { SimplifyModifier } from 'three/addons/modifiers/SimplifyModifier.js';
import { Canvas } from '@react-three/fiber/webgpu';
import { PerspectiveCamera, useGLTF } from '@react-three/drei/webgpu';
import { DemoHelpers } from '../../utils/DemoHelpers';

const MODEL_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/LeePerrySmith/LeePerrySmith.glb';

function Heads() {
  const { scene } = useGLTF(MODEL_URL);
  const head = scene.children[0] as Mesh; // the GLB is a single mesh

  // Decimation is a blocking CPU pass (a second or two for this mesh — the original stalls
  // the same way). Memoised on the asset, so it runs exactly once.
  const simplified = useMemo(() => {
    const count = Math.floor(head.geometry.attributes.position.count * 0.875); // vertices to remove
    return new SimplifyModifier().modify(head.geometry, count);
  }, [head]);

  // The original clones the GLB material just to flip `flatShading`; a clone keeps every
  // texture slot the asset ships without re-declaring them in JSX.
  const flatMaterial = useMemo(() => {
    const material = (head.material as MeshStandardMaterial).clone(); // what GLTFLoader builds
    material.flatShading = true;
    return material;
  }, [head]);

  return (
    <>
      <mesh geometry={head.geometry} material={head.material} position-x={-3} rotation-y={Math.PI / 2} />
      <mesh geometry={simplified} material={flatMaterial} position-x={3} rotation-y={-Math.PI / 2} />
    </>
  );
}

export default function ModifierSimplifier() {
  return (
    <Canvas renderer={{ toneMapping: NoToneMapping }}>
      <PerspectiveCamera makeDefault position={[0, 0, 15]} fov={40} near={1} far={1000}>
        <pointLight intensity={400} />
      </PerspectiveCamera>
      <ambientLight intensity={0.6} />
      <Suspense fallback={null}>
        <Heads />
      </Suspense>
      {/* Grid off: the heads float at the origin, a ground plane would bisect them. */}
      <DemoHelpers grid={false} pan={false} minDistance={15} maxDistance={15} />
    </Canvas>
  );
}

/**
 * postprocessing-sss
 * A stone statue whose contact shadows come from ray-marching the depth buffer, not
 * from the shadow map — screen-space shadows filling in what 1024px can't resolve.
 * Original: https://threejs.org/examples/#webgpu_postprocessing_sss
 *
 * DEMONSTRATES
 * - `builtinShadowContext(sssTerm, light)` on the scene pass: the screen-space
 *   shadow is folded into the light's own shadow term instead of being multiplied
 *   over the beauty pass
 * - A velocity-only MRT pre-pass (`mrt({ output: velocity })`) that serves BOTH the
 *   SSS ray-march (depth) and TRAA (depth + motion vectors)
 * - Pipeline dynamism side by side: uniform-backed knobs swapped in at build time,
 *   versus an output selector that rewires `contextNode` / `outputNode` and flags
 *   `needsUpdate`
 * - An identity-stable `DirectionalLight` in lazy `useState`, shared between the JSX
 *   scene graph and the create-once pipeline closure that `sss()` captures
 */
import { Suspense, useLayoutEffect, useState } from 'react';
import { DirectionalLight, NoToneMapping } from 'three/webgpu';
import type { Mesh, MeshStandardMaterial } from 'three/webgpu';
import { Canvas } from '@react-three/fiber/webgpu';
import { useGLTF } from '@react-three/drei/webgpu';

import { DemoHelpers } from '../../../utils/DemoHelpers';
import { SSSPipeline } from './SSSPipeline';

const MODEL_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/nemetona.glb';

//* Scene =========================================================

function Nemetona() {
  const { scene: model } = useGLTF(MODEL_URL, { draco: true });

  // Shadow flags and the aoMap removal must precede the first render, which is when
  // the shader graph is built. Idempotent, so StrictMode's double mount is harmless.
  useLayoutEffect(() => {
    model.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // Baked AO would hide the very contact shadows this demo is about.
      (mesh.material as MeshStandardMaterial).aoMap = null;
    });
  }, [model]);

  return <primitive object={model} rotation-y={Math.PI} scale={10} position-y={0.45} />;
}

export default function PostprocessingSSS() {
  // Identity-stable: the create-once pipeline closure captures this exact light
  // (sss() reads its direction and builtinShadowContext keys off it), so it lives in
  // lazy useState — never useMemo. Shadow config lands before the first render.
  const [sunLight] = useState(() => {
    const light = new DirectionalLight(0xffffff, 3);
    light.castShadow = true;
    light.shadow.bias = -0.001; // remove self-shadowing artifacts
    light.shadow.camera.top = 4;
    light.shadow.camera.bottom = -4;
    light.shadow.camera.left = -4;
    light.shadow.camera.right = 4;
    light.shadow.camera.near = 0.1;
    light.shadow.camera.far = 40;
    light.shadow.mapSize.set(1024, 1024);
    return light;
  });

  return (
    <Canvas
      // Original sets no tone mapping (WebGPURenderer default); fiber would default ACES.
      renderer={{ toneMapping: NoToneMapping }}
      shadows="soft"
      background="#a0a0a0"
      camera={{ position: [1, 2.5, -3.5], fov: 45, near: 0.1, far: 100 }}>
      <fog attach="fog" args={[0xa0a0a0, 10, 50]} />
      {/* Pipeline (creator hook) rendered BEFORE the suspending sibling — B18. */}
      <SSSPipeline light={sunLight} />
      <hemisphereLight color={0xffffff} groundColor={0x8d8d8d} intensity={2} position={[0, 20, 0]} />
      <primitive object={sunLight} position={[-3, 10, -10]} />

      {/* Ground. depthWrite off (as in the original) keeps it out of the depth
          buffer the SSS pass marches, so only the statue casts screen-space rays. */}
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[100, 100]} />
        <meshPhongMaterial color="#cbcbcb" depthWrite={false} />
      </mesh>

      <Suspense fallback={null}>
        <Nemetona />
      </Suspense>

      <DemoHelpers grid={false} target={[0, 2, 0]} minDistance={1} maxDistance={20} />
    </Canvas>
  );
}

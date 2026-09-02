/**
 * skinning-instancing-individual
 * R3F port of three.js `webgpu_skinning_instancing_individual`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_skinning_instancing_individual
 * (~430 lines of JS)
 *
 * DEMONSTRATES
 * - Compute-instanced skinning (`Herd.tsx`): 30 copies of Michelle, each with her OWN
 *   body proportions and her OWN phase through the same walk cycle — something the
 *   standard one-skeleton skinning pipeline cannot express at all. Per instance, per
 *   frame: the shared `AnimationMixer` is scrubbed to that instance's time, that
 *   instance's proportion bones are scaled, and the resulting bone matrices + a
 *   foot-grounded root transform are baked into two GPU storage buffers
 * - ONE compute kernel per skinned sub-mesh then skins every (instance, vertex) pair
 *   on the GPU and writes straight into a plain `attributeArray`, which
 *   `positionNode`/`normalNode` read directly — replacing per-object skinning with a
 *   single instanced compute dispatch
 * - A belly-morph blend baked into the SAME kernel: each vertex carries a rest
 *   position AND a "belly" target position, blended per-instance by a scalar weight
 *   (`rig.ts`'s `createSourceVertexAttribute`) — heavier body types puff out
 * - RoomEnvironment -> `PMREMGenerator.fromScene` IBL, a custom `scene.backgroundNode`
 *   vertical gradient, and a shadow-casting directional + rim + hemisphere light rig
 *
 * DIVERGENCE from original
 * - No GUI — the original ships none either (rule: don't add controls it doesn't have)
 * - `Herd.tsx` attaches/detaches its computed meshes in a `useEffect` with a real
 *   cleanup, instead of the original's fire-and-forget `scene.add()` in the GLTF
 *   load callback: a `useMemo`-only mutation of the SHARED (GLTF-cache) scene graph
 *   left StrictMode's mount/unmount/remount cycle with two transiently-coexisting
 *   sets of compute kernels/storage buffers for the same skeleton, and the surviving
 *   mount's compute writes silently never reached the screen (production build —
 *   no double-mount — rendered correctly the whole time). Symmetric connect/disconnect
 *   is the fix (AGENTS.md's own StrictMode rule, applied to a case beyond material
 *   disposal); see `Herd.tsx` for the full writeup
 */
import { useEffect, useMemo, Suspense } from 'react';
import { color, screenUV } from 'three/tsl';
import { NeutralToneMapping, PMREMGenerator } from 'three/webgpu';
import type { Node } from 'three/webgpu';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Canvas, useThree } from '@react-three/fiber/webgpu';
import { DemoHelpers } from '../../../utils/DemoHelpers';
import { Herd } from './Herd';

// scene.backgroundNode cast — @types/three doesn't declare it (UPSTREAM.md B11
// family, same pattern as compute-geometry's SceneBackground). Vertical gradient,
// ported verbatim from the original's init().
function SceneBackground() {
  const scene = useThree((s) => s.scene);

  useMemo(() => {
    const withBackgroundNode = scene as unknown as { backgroundNode: Node | null };
    withBackgroundNode.backgroundNode = screenUV.y.mix(color(0x8f989c), color(0xe7eaeb));
  }, [scene]);

  return null;
}

// RoomEnvironment -> PMREM -> scene.environment: the scene's IBL, on top of the
// analytical light rig declared in the Canvas below (matches the original).
function RoomEnv() {
  const renderer = useThree((s) => s.renderer);
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    const environment = new RoomEnvironment();
    const pmremGenerator = new PMREMGenerator(renderer);
    const envRT = pmremGenerator.fromScene(environment, 0.04);
    scene.environment = envRT.texture;
    environment.dispose();
    pmremGenerator.dispose();
    return () => {
      scene.environment = null;
      envRT.dispose();
    };
  }, [renderer, scene]);

  return null;
}

export default function SkinningInstancingIndividual() {
  return (
    <Canvas
      // Original sets this explicitly (not the WebGPURenderer default).
      renderer={{ toneMapping: NeutralToneMapping, toneMappingExposure: 0.96 }}
      shadows="soft"
      camera={{ position: [4.6, 3.3, 6.2], fov: 45, near: 0.01, far: 60 }}>
      <SceneBackground />
      <RoomEnv />
      <hemisphereLight args={['#ffffff', '#939b9e', 1.2]} />
      <directionalLight
        color="#fffbf4"
        intensity={2.8}
        position={[-4, 10, 8]}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-5}
        shadow-camera-right={5}
        shadow-camera-top={5}
        shadow-camera-bottom={-5}
        shadow-camera-near={0.1}
        shadow-camera-far={30}
      />
      <directionalLight color="#e8f4ff" intensity={0.85} position={[7, 5, -5]} />
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[400, 400]} />
        <shadowMaterial color="#5d6568" opacity={0.3} />
      </mesh>
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes the displayed scene (AGENTS.md; corpus-wide repair, wave 8). */}
      <Suspense fallback={null}>
        <Herd />
      </Suspense>
      <DemoHelpers grid={false} target={[0, 0.75, 0]} minDistance={3} maxDistance={25} maxPolarAngle={Math.PI / 2} />
    </Canvas>
  );
}

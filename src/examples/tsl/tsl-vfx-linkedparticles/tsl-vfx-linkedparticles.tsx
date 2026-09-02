/**
 * tsl-vfx-linkedparticles
 * A short-lived particle emitter follows the cursor through a turbulence field; every
 * particle draws two glowing ribbons to its nearest neighbours.
 * Original: https://threejs.org/examples/#webgpu_tsl_vfx_linkedparticles
 *
 * DEMONSTRATES
 * - A compute simulation whose OUTPUT IS GEOMETRY: the update kernel writes eight
 *   vertices per particle into a `StorageBufferAttribute` that a plain
 *   `<bufferGeometry>` binds as its `position` attribute, with a static index buffer
 *   on top — no CPU ever touches a vertex
 * - Two `useBuffers` flavours side by side: `instancedArray` for pure GPU state
 *   (position+life, velocity) and real `BufferAttribute`s for the buffers the draw
 *   call reads, which is why they belong in `useBuffers` rather than a `useMemo`
 * - Three dispatch cadences from AGENTS' compute rules in one component: a one-shot
 *   init in `useEffect`, and update + spawn every frame in `useFrame({ phase:
 *   'update' })`
 * - Uniforms that only the frame loop owns (`colorOffset`, `spawnIndex`, the two
 *   spawn positions) created as plain `uniform()` nodes inside `useNodes`, because
 *   `useUniforms` re-syncs its inputs on every React render
 * - `useRenderPipeline` pattern (b): `bloom()` keeps its knobs in writable
 *   `uniform()`-backed fields, so leva's nodes are assigned onto them inside the
 *   callback, before the shader compiles
 *
 * DIVERGENCE from original
 * - Spawn rate actually works. Upstream bakes the spawn kernel's thread count from
 *   the slider's INITIAL value and only advances the CPU-side ring index afterwards,
 *   so raising "Spawn rate" thins the emitter out. Here the kernel dispatches a fixed
 *   maximum and gates itself on the live uniform.
 * - The cursor plane is rebuilt from the camera each frame. Upstream applies the
 *   camera's rotation to the plane normal repeatedly without resetting it, so the
 *   normal compounds and the emitter drifts off the cursor as the camera orbits.
 * - `instanceMatrix.setUsage(DynamicDrawUsage)` dropped — `positionNode` places every
 *   particle, so the instance matrices are never written.
 */
import { useRef } from 'react';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { ACESFilmicToneMapping, type PointLight } from 'three/webgpu';
import { Canvas, useFrame, useRenderPipeline, useUniforms } from '@react-three/fiber/webgpu';
import { useControls } from 'leva';
import { DemoHelpers } from '../../../utils/DemoHelpers';
import { LinkedParticles } from './LinkedParticles';

// A huge inverted icosahedron, nearly black but very metallic, lit by one orbiting
// point light — it exists to catch a moving specular sheen behind the particles.
function BackgroundShell() {
  const lightRef = useRef<PointLight>(null);

  useFrame(({ elapsed }) => {
    lightRef.current?.position.set(
      Math.sin(elapsed * 0.5) * 30,
      Math.cos(elapsed * 0.3) * 30,
      Math.sin(elapsed * 0.2) * 30,
    );
  });

  return (
    <>
      <pointLight ref={lightRef} intensity={3000} />
      {/* Scale-flipped on x to turn the sphere inside out (the original bakes the
          same flip into the geometry with applyMatrix4). */}
      <mesh scale={[-1, 1, 1]}>
        <icosahedronGeometry args={[100, 5]} />
        <meshStandardNodeMaterial color="#000000" roughness={0.4} metalness={0.9} flatShading />
      </mesh>
    </>
  );
}

function PostFX() {
  //* Controls =====================================================
  const { bloomThreshold, bloomStrength, bloomRadius } = useControls('bloom', {
    bloomThreshold: { value: 0.5, min: 0, max: 2, step: 0.01, label: 'threshold' },
    bloomStrength: { value: 0.75, min: 0, max: 10, step: 0.01, label: 'strength' },
    bloomRadius: { value: 0.1, min: 0, max: 1, step: 0.01, label: 'radius' },
  });
  const uniforms = useUniforms({ bloomThreshold, bloomStrength, bloomRadius });

  useRenderPipeline(({ renderPipeline, passes }) => {
    const scenePassColor = passes.scenePass.getTextureNode('output');
    const bloomPass = bloom(scenePassColor);
    bloomPass.threshold = uniforms.bloomThreshold;
    bloomPass.strength = uniforms.bloomStrength;
    bloomPass.radius = uniforms.bloomRadius;
    renderPipeline.outputNode = scenePassColor.add(bloomPass);
  });

  return null;
}

export default function TslVfxLinkedParticles() {
  return (
    <Canvas
      renderer={{ toneMapping: ACESFilmicToneMapping }}
      background="#14171a"
      camera={{ position: [0, 0, 10], fov: 60, near: 0.1, far: 200 }}>
      <LinkedParticles />
      <BackgroundShell />
      <PostFX />
      <DemoHelpers grid={false} maxDistance={75} autoRotate />
    </Canvas>
  );
}

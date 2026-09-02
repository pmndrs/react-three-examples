/**
 * materialx-noise
 * R3F port of three.js `webgpu_materialx_noise`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_materialx_noise (~193 lines of JS)
 *
 * DEMONSTRATES
 * - Four of TSL's MaterialX-derived noise functions (`mx_noise_vec3`,
 *   `mx_cell_noise_float`, `mx_worley_noise_vec3`, `mx_fractal_noise_vec3`) driving
 *   `colorNode` directly, side by side for comparison — the same world-space input
 *   (`normalWorld.mul(10).add(time)`) fed through each
 * - A small data array (`NOISE_VARIANTS`) mapped into JSX instead of four near-
 *   identical mesh blocks — the four node graphs are module-scope constants (they
 *   close over nothing React-owned), matching the "effect" scene-role convention
 *   used by `tsl-earth`'s and `animation-retargeting`'s background modules
 * - An HDR cube environment via `useLoader(HDRCubeTextureLoader, [[...faces]])`
 *   backing both `scene.background` and `scene.environment` (pattern
 *   `cubemap-dynamic`, B20's nested-array workaround for drei's 6-file HDR gap)
 *
 * DIVERGENCE from original
 * - Per-sphere spin is delta-scaled (`0.3 rad/s` ≈ the original's per-frame
 *   `+= 0.005` at 60 fps) so it is frame-rate independent
 * - Orbit light position driven by `state.elapsed` instead of `Date.now()` — same
 *   `sin/cos` formula, just fiber's own clock instead of the wall clock
 * - `renderer.inspector` GUI dropped — the original wires no controls to it either
 *   (`Inspector.js` is imported but `createParameters` is never called)
 */
import { Suspense, useLayoutEffect, useRef } from 'react';
import {
  mx_cell_noise_float,
  mx_fractal_noise_vec3,
  mx_noise_vec3,
  mx_worley_noise_vec3,
  normalWorld,
  time,
} from 'three/tsl';
import { ACESFilmicToneMapping, LinearFilter, LinearMipmapLinearFilter } from 'three/webgpu';
import type { Mesh, Node } from 'three/webgpu';
import { HDRCubeTextureLoader } from 'three/addons/loaders/HDRCubeTextureLoader.js';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber/webgpu';
import { DemoHelpers } from '../../utils/DemoHelpers';

const TEXTURE_BASE = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/';
const PISA_HDR_FILES = ['px', 'nx', 'py', 'ny', 'pz', 'nz'].map((face) => `${TEXTURE_BASE}cube/pisaHDR/${face}.hdr`);

// One shared world-space input, sampled by all four noise functions.
const customUV = normalWorld.mul(10).add(time);

const NOISE_VARIANTS: { position: [number, number, number]; colorNode: Node }[] = [
  { position: [-10, 10, 0], colorNode: mx_noise_vec3(customUV) },
  { position: [10, 10, 0], colorNode: mx_cell_noise_float(customUV) },
  { position: [-10, -10, 0], colorNode: mx_worley_noise_vec3(customUV) },
  { position: [10, -10, 0], colorNode: mx_fractal_noise_vec3(customUV.mul(0.2)) },
];

const SPIN_SPEED = 0.3; // rad/s — see header DIVERGENCE

function NoiseSpheres() {
  const meshRefs = useRef<(Mesh | null)[]>([]);

  useFrame(({ delta }) => {
    for (const mesh of meshRefs.current) {
      if (mesh) mesh.rotation.y += SPIN_SPEED * delta;
    }
  });

  return (
    <>
      {NOISE_VARIANTS.map(({ position, colorNode }, i) => (
        <mesh
          key={i}
          position={position}
          ref={(mesh) => {
            meshRefs.current[i] = mesh;
          }}>
          <sphereGeometry args={[8, 64, 32]} />
          <meshPhysicalNodeMaterial colorNode={colorNode} />
        </mesh>
      ))}
    </>
  );
}

// Skybox + IBL from the six Pisa Radiance .hdr faces (same B20 workaround and
// filtering as `cubemap-dynamic`'s PisaEnvironment).
function PisaEnvironment() {
  const scene = useThree((s) => s.scene);
  const [envCube] = useLoader(HDRCubeTextureLoader, [PISA_HDR_FILES]);

  useLayoutEffect(() => {
    envCube.minFilter = LinearMipmapLinearFilter;
    envCube.magFilter = LinearFilter;
    scene.background = envCube;
    scene.environment = envCube;
    return () => {
      scene.background = null;
      scene.environment = null;
    };
  }, [scene, envCube]);

  return null;
}

// A small white sphere carrying a point light, orbiting the scene — the original's
// `particleLight`.
function OrbitingLight() {
  const meshRef = useRef<Mesh>(null);

  useFrame(({ elapsed }) => {
    const timer = elapsed * 0.25;
    meshRef.current?.position.set(Math.sin(timer * 7) * 30, Math.cos(timer * 5) * 40, Math.cos(timer * 3) * 30);
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.4, 8, 8]} />
      <meshBasicMaterial color="#ffffff" />
      <pointLight color="#ffffff" intensity={1000} />
    </mesh>
  );
}

export default function MaterialXNoise() {
  return (
    <Canvas
      renderer={{ toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1.25 }}
      camera={{ position: [0, 0, 100], fov: 27, near: 1, far: 1000 }}>
      <OrbitingLight />
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes the displayed scene (AGENTS.md; corpus-wide repair, wave 8). */}
      <Suspense fallback={null}>
        <PisaEnvironment />
        <NoiseSpheres />
      </Suspense>
      <DemoHelpers grid={false} />
    </Canvas>
  );
}

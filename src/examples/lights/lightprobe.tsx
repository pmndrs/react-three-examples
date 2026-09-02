/**
 * lightprobe
 * A spherical-harmonics light probe, baked once from a cube-map environment, lighting
 * a mirror-smooth sphere alongside an ordinary directional light.
 * Original: https://threejs.org/examples/#webgpu_lightprobe
 *
 * DEMONSTRATES
 * - `LightProbeGenerator.fromCubeTexture(cubeTexture)`: projecting a 6-face
 *   environment onto 9 spherical-harmonics coefficients — cheap, ambient-only
 *   indirect light with none of a real reflection's per-pixel cost
 * - `<lightProbeHelper args={[lightProbe, size]}>`: a genuine JSX element for an
 *   addon helper, not the imperative `new Helper(); light.add(helper)` dance
 *   `SpotLightHelper`/`RectAreaLightHelper` need elsewhere in this corpus — this one
 *   is a plain `Mesh` that self-refreshes every frame via `onBeforeRender()`, so
 *   nothing here needs a `useFrame` or an effect to keep it in sync
 * - The probe's own `position` is cosmetic — it plays NO part in the lighting math
 *   (spherical harmonics have no notion of "where"), only in where the debug helper
 *   sphere is drawn — set once after `.copy()` resets it back to the origin
 *
 * DIVERGENCE from original
 * - OrbitControls -> this repo's CameraControls, same 10/50 dolly limits, pan locked
 */
import { Suspense, useLayoutEffect, useState } from 'react';
import { LightProbeGenerator } from 'three/addons/lights/LightProbeGenerator.js';
import { CubeTextureLoader, LightProbe, NoToneMapping } from 'three/webgpu';
import type { CubeTexture } from 'three/webgpu';

import { Canvas, useLoader, useThree } from '@react-three/fiber/webgpu';
import { useControls } from 'leva';

import '../../assets/LightProbeHelper';
import { DemoHelpers } from '../../utils/DemoHelpers';

const CUBE_BASE = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/cube/pisa/';
const CUBE_URLS = ['px', 'nx', 'py', 'ny', 'pz', 'nz'].map((face) => `${CUBE_BASE}${face}.png`);

function Scene() {
  const scene = useThree((s) => s.scene);

  const { lightProbeIntensity, directionalLightIntensity, envMapIntensity } = useControls('lightprobe', {
    lightProbeIntensity: { value: 1, min: 0, max: 1, step: 0.02, label: 'light probe' },
    directionalLightIntensity: { value: 0.6, min: 0, max: 1, step: 0.02, label: 'directional light' },
    envMapIntensity: { value: 1, min: 0, max: 1, step: 0.02, label: 'envMap' },
  });

  // Nested array — the multi-resource useLoader form (B20): one cube texture built
  // from all 6 face URLs in a single load, matching cubemap-dynamic/clearcoat.
  const [cubeTexture] = useLoader(CubeTextureLoader, [CUBE_URLS]) as CubeTexture[];

  // The JSX-declared <lightProbe> mounted below hands its own instance back through
  // this setter (a callback ref never re-renders on its own, so mirroring it into
  // state is how a sibling — the helper below — gets a stable reference to it).
  const [lightProbe, setLightProbe] = useState<LightProbe | null>(null);

  useLayoutEffect(() => {
    if (!lightProbe) return;
    scene.background = cubeTexture;
    lightProbe.copy(LightProbeGenerator.fromCubeTexture(cubeTexture));
    // .copy() resets the transform too — re-apply after, see header DEMONSTRATES.
    lightProbe.position.set(-10, 0, 0);
    return () => {
      scene.background = null;
    };
  }, [scene, cubeTexture, lightProbe]);

  useLayoutEffect(() => {
    if (lightProbe) lightProbe.intensity = lightProbeIntensity;
  }, [lightProbe, lightProbeIntensity]);

  return (
    <>
      <lightProbe ref={setLightProbe} />
      {lightProbe && <lightProbeHelper args={[lightProbe, 1]} />}

      <directionalLight color="#ffffff" intensity={directionalLightIntensity} position={[10, 10, 10]} />

      <mesh>
        <sphereGeometry args={[5, 64, 32]} />
        <meshStandardMaterial
          color="#ffffff"
          metalness={0}
          roughness={0}
          envMap={cubeTexture}
          envMapIntensity={envMapIntensity}
        />
      </mesh>
    </>
  );
}

export default function Lightprobe() {
  return (
    <Canvas renderer={{ toneMapping: NoToneMapping }} camera={{ position: [0, 0, 30], fov: 40, near: 1, far: 1000 }}>
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes the displayed scene (AGENTS.md; corpus-wide repair, wave 8). */}
      <Suspense fallback={null}>
        <Scene />
      </Suspense>
      <DemoHelpers grid={false} pan={false} minDistance={10} maxDistance={50} />
    </Canvas>
  );
}

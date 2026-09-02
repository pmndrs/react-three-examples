/**
 * pmrem-scene
 * Six coloured spheres and a sky, prefiltered into an environment map — then read back
 * out onto the big sphere in the middle. Slide roughness to blur the reflection.
 * Original: https://threejs.org/examples/#webgpu_pmrem_scene
 *
 * DEMONSTRATES
 * - `PMREMGenerator.fromScene(scene)` as the third PMREM source in this repo: instead of
 *   an equirect (`pmrem-equirectangular`) or a 6-file cube (`pmrem-cubemap`), the live
 *   scene graph itself is rendered into a cube and prefiltered — a cube camera plus a
 *   roughness convolution in one call
 * - Ordering the capture in React: the six spheres are children, so their commit is
 *   finished by the time this component's effect runs, and the mirror sphere is gated on
 *   the resulting texture — that gate is also what keeps the mirror out of its own capture
 * - `pmremTexture(map, normalWorld, roughnessNode)` as a `colorNode` on a
 *   `<meshBasicNodeMaterial>`: an unlit sphere that samples the prefiltered stack directly
 * - A live `useUniforms` roughness node: sliding it walks the PMREM mip chain per frame
 *   with no graph rebuild (build-time vs run-time rule)
 *
 * DIVERGENCE from original
 * - The original renders on demand (`controls.addEventListener('change', render)`) and
 *   re-renders from the GUI's `onChange`. This repo runs fiber's normal loop, so the
 *   roughness slider needs no wiring at all
 * - `scene.background` is set in a layout effect rather than assigned inline: the capture
 *   must see the sky, and a layout effect lands before the first RAF render
 */
import { Suspense, useEffect, useLayoutEffect, useState } from 'react';
import { CubeTextureLoader, NoToneMapping, PMREMGenerator } from 'three/webgpu';
import type { Texture } from 'three/webgpu';
import { normalWorld, pmremTexture } from 'three/tsl';
import { Canvas, useLoader, useThree, useUniforms } from '@react-three/fiber/webgpu';
import { useControls } from 'leva';
import { DemoHelpers } from '../../utils/DemoHelpers';

const CUBE_BASE = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/cube/Park3Med/';
const PARK_FILES = ['px', 'nx', 'py', 'ny', 'pz', 'nz'].map((face) => `${CUBE_BASE}${face}.jpg`);

// The six subjects of the capture: one axis-aligned sphere per direction, so the
// prefiltered result is readable as "which way am I looking?" on the mirror sphere.
const SATELLITES: { color: string; position: [number, number, number] }[] = [
  { color: '#0000ff', position: [0, 0, -1] },
  { color: '#ff0000', position: [0, 0, 1] },
  { color: '#ff00ff', position: [1, 0, 0] },
  { color: '#00ffff', position: [-1, 0, 0] },
  { color: '#ffff00', position: [0, -1, 0] },
  { color: '#00ff00', position: [0, 1, 0] },
];

function PmremScene() {
  const { roughness } = useControls('pmrem-scene', {
    roughness: { value: 0.5, min: 0, max: 1, step: 0.001 },
  });

  // Creator hook first: B18 — it must not run after the suspending loader below.
  const { uRoughness } = useUniforms({ uRoughness: roughness });

  const [envMap] = useLoader(CubeTextureLoader, [PARK_FILES]);
  const renderer = useThree((s) => s.renderer);
  const scene = useThree((s) => s.scene);
  const [prefiltered, setPrefiltered] = useState<Texture | null>(null);

  useLayoutEffect(() => {
    scene.background = envMap;
    return () => {
      scene.background = null;
    };
  }, [scene, envMap]);

  // Runs after the satellites have committed and after the layout effect above, so the
  // capture sees exactly what the original's `fromScene` call saw.
  useEffect(() => {
    const generator = new PMREMGenerator(renderer);
    const target = generator.fromScene(scene);
    generator.dispose();
    setPrefiltered(target.texture);
  }, [renderer, scene, envMap]);

  return (
    <>
      {SATELLITES.map(({ color, position }) => (
        <mesh key={color} position={position}>
          <sphereGeometry args={[0.2, 64, 64]} />
          <meshBasicNodeMaterial color={color} />
        </mesh>
      ))}

      {prefiltered && (
        <mesh>
          <sphereGeometry args={[0.5, 64, 64]} />
          <meshBasicNodeMaterial colorNode={pmremTexture(prefiltered, normalWorld, uRoughness)} />
        </mesh>
      )}
    </>
  );
}

export default function PmremSceneExample() {
  return (
    <Canvas
      // The original never sets a tone mapping — WebGPURenderer's default is none.
      renderer={{ toneMapping: NoToneMapping }}
      camera={{ position: [-1.8, 0.6, 2.7], fov: 45, near: 0.25, far: 20 }}>
      <Suspense fallback={null}>
        <PmremScene />
      </Suspense>
      {/* Grid off: it would be captured into the environment map, and the original has none. */}
      <DemoHelpers grid={false} minDistance={2} maxDistance={10} />
    </Canvas>
  );
}

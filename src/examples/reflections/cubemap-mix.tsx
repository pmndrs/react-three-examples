/**
 * cubemap-mix
 * R3F port of three.js `webgpu_cubemap_mix`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_cubemap_mix (~65 lines of JS)
 *
 * DEMONSTRATES
 * - `mix(pmremTexture(cubeA), pmremTexture(cubeB), oscSine(time.mul(0.1)))` as
 *   `scene.environmentNode` — two cube environments cross-fading forever, driven by a
 *   TSL oscillator built straight from `time`, no uniform or `useFrame` needed
 * - The SAME node reused as `scene.backgroundNode` via `.context({ getTextureLevel })`
 *   — one graph lights the DamagedHelmet AND paints the sky, just sampled at a
 *   different (fixed) PMREM mip level for the visible background
 * - Two different cube-loading paths on one scene: `useLoader(HDRCubeTextureLoader,
 *   [[...faces]])` for a 6-file `.hdr` set (drei's `Environment` can't reach that
 *   loader, B20) alongside drei's `useCubeTexture` for a plain 6-file `.jpg` cube
 *
 * DIVERGENCE from original
 * - The original hard-codes the background PMREM level at `float(0.5)` with no GUI at
 *   all; a single `backgroundLevel` leva slider (0-1) exposes it live, same one-slider
 *   treatment as the hard-coded level in `pmrem-equirectangular`
 * - `OrbitControls` -> DemoHelpers' CameraControls; dolly limits (2/10) forwarded. Grid
 *   disabled — the cross-fading cube environment fills the frame, no ground plane
 */
import { Suspense, useLayoutEffect } from 'react';
import { LinearMipmapLinearFilter, LinearToneMapping } from 'three/webgpu';
import type { Node } from 'three/webgpu';
import { mix, oscSine, pmremTexture, time } from 'three/tsl';
import { HDRCubeTextureLoader } from 'three/addons/loaders/HDRCubeTextureLoader.js';
import { Canvas, useLoader, useNodes, useThree, useUniforms } from '@react-three/fiber/webgpu';
import { useCubeTexture, useGLTF } from '@react-three/drei/webgpu';
import { useControls } from 'leva';
import { DemoHelpers } from '../../utils/DemoHelpers';

const TEXTURE_BASE = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/cube/';
const PISA_HDR_FILES = ['px', 'nx', 'py', 'ny', 'pz', 'nz'].map((face) => `${TEXTURE_BASE}pisaHDR/${face}.hdr`);
const MILKYWAY_PATH = `${TEXTURE_BASE}MilkyWay/`;
const MILKYWAY_FILES = ['px', 'nx', 'py', 'ny', 'pz', 'nz'].map((face) => `dark-s_${face}.jpg`);
const HELMET_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/DamagedHelmet/glTF/DamagedHelmet.gltf';

// The cross-fading two-cube environment/background graph — see header DEMONSTRATES.
function CrossfadeEnvironment() {
  const { backgroundLevel } = useControls('cubemap-mix', {
    backgroundLevel: { value: 0.5, min: 0, max: 1, step: 0.01 },
  });

  const scene = useThree((s) => s.scene);
  const [pisaCube] = useLoader(HDRCubeTextureLoader, [PISA_HDR_FILES]);
  const milkyWayCube = useCubeTexture(MILKYWAY_FILES, { path: MILKYWAY_PATH });

  // Mipmaps are read at PMREM build time — must land before the graph below builds
  // (AGENTS.md imperative-setup rule).
  useLayoutEffect(() => {
    for (const cube of [pisaCube, milkyWayCube]) {
      cube.generateMipmaps = true;
      cube.minFilter = LinearMipmapLinearFilter;
    }
  }, [pisaCube, milkyWayCube]);

  const { uBackgroundLevel } = useUniforms({ uBackgroundLevel: backgroundLevel });

  const { environmentNode, backgroundNode } = useNodes(() => {
    const environmentNode = mix(pmremTexture(milkyWayCube), pmremTexture(pisaCube), oscSine(time.mul(0.1)));
    return {
      environmentNode,
      backgroundNode: environmentNode.context({ getTextureLevel: () => uBackgroundLevel }),
    };
  });

  // Cast: `@types/three`'s `Scene` doesn't declare `environmentNode`/`backgroundNode`
  // even though the WebGPU renderer reads both off the live scene (duck-typed *Node
  // gap, UPSTREAM B11 — same cast as `pmrem-equirectangular`/`cubemap-adjustments`).
  useLayoutEffect(() => {
    const withNodes = scene as unknown as { environmentNode: Node | null; backgroundNode: Node | null };
    withNodes.environmentNode = environmentNode;
    withNodes.backgroundNode = backgroundNode;
    return () => {
      withNodes.environmentNode = null;
      withNodes.backgroundNode = null;
    };
  }, [scene, environmentNode, backgroundNode]);

  return null;
}

function Helmet() {
  const { scene } = useGLTF(HELMET_URL);
  return <primitive object={scene} />;
}

export default function CubemapMix() {
  return (
    // Original sets LinearToneMapping explicitly — mirrored deliberately (parity rule).
    <Canvas
      renderer={{ toneMapping: LinearToneMapping }}
      camera={{ position: [-1.8, 0.6, 2.7], fov: 45, near: 0.25, far: 20 }}>
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes the displayed scene (AGENTS.md; corpus-wide repair, wave 8). */}
      <Suspense fallback={null}>
        <CrossfadeEnvironment />
        <Helmet />
      </Suspense>
      <DemoHelpers grid={false} minDistance={2} maxDistance={10} />
    </Canvas>
  );
}

/**
 * custom-fog-background
 * R3F port of three.js `webgpu_custom_fog_background`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_custom_fog_background (~104 lines of JS)
 *
 * DEMONSTRATES
 * - Fog composited entirely in POST-PROCESSING, not `scene.fogNode`: `rangeFogFactor`
 *   reads the scene pass's own `getViewZNode()` via `.context({ getViewZ })`, so depth
 *   comes from the already-rendered pass instead of a second geometry traversal
 * - Tone mapping folded into the SAME graph node (`scenePass.toneMapping(ACESFilmic,
 *   1)`) rather than the renderer — the pipeline's `outputColorTransform` only adds
 *   the color-space transform, so fog mixes with untone-mapped HDR color and only the
 *   final composite gets mapped down to display range
 * - `useLoader(UltraHDRLoader, …)` feeding `scene.environment` alone (no
 *   `scene.background` — the visible backdrop is 100% the fog graph, not the HDR)
 *
 * DIVERGENCE from original
 * - DamagedHelmet loaded via drei's `useGLTF` (Suspense-driven) instead of the
 *   original's manual `GLTFLoader().load()` callback — same multi-file `.gltf` variant
 * - No leva controls — the original has none either (fixed fog range, fixed color)
 */
import { Suspense, useLayoutEffect } from 'react';
import { color, rangeFogFactor } from 'three/tsl';
import { UltraHDRLoader } from 'three/addons/loaders/UltraHDRLoader.js';
import { ACESFilmicToneMapping, EquirectangularReflectionMapping, NoToneMapping } from 'three/webgpu';
import { Canvas, useLoader, useRenderPipeline, useThree } from '@react-three/fiber/webgpu';
import { useGLTF } from '@react-three/drei/webgpu';
import { DemoHelpers } from '../../utils/DemoHelpers';

const HDR_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/equirectangular/royal_esplanade_2k.hdr.jpg';
const HELMET_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/DamagedHelmet/glTF/DamagedHelmet.gltf';

// IBL only — `.mapping` is read at shader-graph build time by every material's
// envMap, so it must land before the first render (AGENTS.md imperative-setup rule).
function HdrEnvironment() {
  const scene = useThree((s) => s.scene);
  const map = useLoader(UltraHDRLoader, HDR_URL);

  useLayoutEffect(() => {
    map.mapping = EquirectangularReflectionMapping;
    scene.environment = map;
    return () => {
      scene.environment = null;
    };
  }, [scene, map]);

  return null;
}

function Helmet() {
  const { scene } = useGLTF(HELMET_URL);
  return <primitive object={scene} />;
}

// Fog composited on the scene pass — see header DEMONSTRATES.
function FogBackgroundPipeline() {
  useRenderPipeline(({ renderPipeline, passes }) => {
    const scenePass = passes.scenePass;
    const scenePassViewZ = scenePass.getViewZNode();

    const fogColor = color(0x4080cc); // sRGB
    const fogFactor = rangeFogFactor(2.7, 4).context({ getViewZ: () => scenePassViewZ });
    const scenePassTM = scenePass.toneMapping(ACESFilmicToneMapping, 1);

    renderPipeline.outputColorTransform = true; // color-space transform only — tone mapping already happened above
    renderPipeline.outputNode = fogFactor.mix(scenePassTM, fogColor);
  });

  return null;
}

export default function CustomFogBackground() {
  return (
    <Canvas
      renderer={{ toneMapping: NoToneMapping }} // tone mapping happens inside the pipeline graph, not the renderer
      camera={{ position: [-1.8, 0.6, 2.7], fov: 45, near: 0.25, far: 20 }}>
      <Suspense fallback={null}>
        <HdrEnvironment />
        <Helmet />
      </Suspense>
      <FogBackgroundPipeline />
      <DemoHelpers grid={false} target={[0, -0.1, -0.2]} minDistance={2} maxDistance={5} />
    </Canvas>
  );
}

/**
 * postprocessing-retro
 * A PlayStation-1 render on a CRT: affine-warped textures, 15-bit dithered colour,
 * scanlines and barrel glass, under a procedural gradient-and-stars sky.
 * Original: https://threejs.org/examples/#webgpu_postprocessing_retro
 *
 * DEMONSTRATES
 * - `retroPass()`, a PassNode that re-renders the whole scene with period-correct
 *   materials, then six chained TSL helpers stacked on top of it (`RetroPipeline.tsx`)
 * - Pipeline dynamism pattern (a) at scale: eight leva knobs through ONE `useUniforms`
 *   call, because every CRT helper is an `Fn()` that uses the node it is given
 * - …next to a knob that is NOT a uniform: `filterTextures` is baked into the pass's
 *   cached materials, so it takes a plain assignment plus `retro.dispose()`
 * - A whole skybox as one node on `scene.backgroundNode` (`Ps1Background.tsx`) — a
 *   spherical-coordinate star field with no texture and no geometry
 * - Swapping models with leva: the select drives which GLTF suspends, and the
 *   environment map and smoke plume ride along as plain data on each entry
 */
import { Suspense, useLayoutEffect } from 'react';
import { EquirectangularReflectionMapping, NoToneMapping } from 'three/webgpu';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { Canvas, useLoader, useThree } from '@react-three/fiber/webgpu';
import { useGLTF } from '@react-three/drei/webgpu';
import { useControls } from 'leva';

import { DemoHelpers } from '../../../utils/DemoHelpers';
import { Ps1Background } from './Ps1Background';
import { RetroPipeline } from './RetroPipeline';
import { Smoke } from './Smoke';

const ASSETS = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples';
const HDR_URL = `${ASSETS}/textures/equirectangular/venice_sunset_1k.hdr`;

// Everything that varies between the two models is data, including whether the scene
// gets a reflection probe and whether the mug's smoke plume is showing.
const MODELS = {
  'Coffee Mug': { url: `${ASSETS}/models/gltf/coffeeMug.glb`, scale: 1, y: 0, environment: false, smoke: true },
  'Damaged Helmet': {
    url: `${ASSETS}/models/gltf/DamagedHelmet/glTF/DamagedHelmet.gltf`,
    scale: 3,
    y: 1,
    environment: true,
    smoke: false,
  },
} as const;

type ModelName = keyof typeof MODELS;

//* Scene =========================================================

function Model({ url, scale, y }: { url: string; scale: number; y: number }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene} scale={scale} position={[0, y, 0]} />;
}

// The raw equirect HDR, exactly as the original assigns it — the retro pass reads
// `scene.environment` straight through a CubeMapNode, so it must not be pre-PMREM'd.
function HdrEnvironment() {
  const scene = useThree((state) => state.scene);
  const hdr = useLoader(HDRLoader, HDR_URL);

  useLayoutEffect(() => {
    hdr.mapping = EquirectangularReflectionMapping;
    scene.environment = hdr;
    return () => {
      scene.environment = null;
    };
  }, [scene, hdr]);

  return null;
}

export default function PostprocessingRetro() {
  // Two siblings consume this: the scene picks the model, and the pipeline drops its
  // material cache when it changes — so it lives at their shared parent (House rule 1).
  const { model } = useControls('Settings', {
    model: { label: 'Model', value: 'Coffee Mug' as ModelName, options: Object.keys(MODELS) as ModelName[] },
  });
  const { url, scale, y, environment, smoke } = MODELS[model];

  return (
    <Canvas
      // Original never sets a tone mapping (WebGPURenderer default) — fiber's Canvas
      // would otherwise default to ACESFilmic and wash out the CRT palette.
      renderer={{ antialias: true, toneMapping: NoToneMapping }}
      camera={{ position: [8, 5, 20], fov: 25, near: 0.1, far: 100 }}>
      <RetroPipeline model={model} />
      <Ps1Background />
      <ambientLight color="#404040" intensity={2} />
      <directionalLight color="#ffffff" intensity={3} position={[5, 10, 5]} />
      <pointLight color="#ff6600" intensity={5} distance={20} position={[-3, 3, 2]} />
      {/* One boundary for the model and its environment: the HDR has to be on the
          scene before the retro pass caches a material that reflects it (B15). */}
      <Suspense fallback={null}>
        {environment && <HdrEnvironment />}
        <Model url={url} scale={scale} y={y} />
        {smoke && <Smoke />}
      </Suspense>
      <DemoHelpers grid={false} target={[0, 1, 0]} minDistance={0.1} maxDistance={50} />
    </Canvas>
  );
}

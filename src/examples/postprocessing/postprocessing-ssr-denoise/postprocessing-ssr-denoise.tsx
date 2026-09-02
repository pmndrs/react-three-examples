/**
 * postprocessing-ssr-denoise
 * A stone dungeon lit by one HDR: the wet-looking floor is stochastic screen-space
 * reflection, and every bit of it is denoised back to a clean image in real time.
 * Original: https://threejs.org/examples/#webgpu_postprocessing_ssr_denoise
 *
 * DEMONSTRATES
 * - The full denoise chain in one `useRenderPipeline`: stochastic `ssr()` ->
 *   `temporalReproject()` -> `recurrentDenoise()` -> grading -> `traa()` ->
 *   `sharpen()`, with the denoised frame fed BACK as SSR's history for multi-bounce
 * - Channel packing in the G-buffer: metalness in `diffuseColor.a`, roughness in
 *   `normal.a`, so three MRT attachments carry five signals
 * - Registering a graph BUILDER rather than pre-built graphs — seven output modes,
 *   one of which composes two full chains into a shift-drag compare wipe
 * - A three.js prototype patch (zeroing env-map specular so SSR isn't double-counted)
 *   installed and REMOVED in a layout effect, instead of at module scope
 * - Loading order that survives B15: one outer Suspense gates the HDR, the pipeline
 *   mounts inside it, and the model gets its own nested boundary
 *
 * DIVERGENCE from original
 * - The compare views' seam is dragged with shift+pointer on the canvas, as in the
 *   original, but the on-screen "hold shift" hint is dropped — the example shell owns
 *   the overlay UI here
 */
import { Suspense, useLayoutEffect, useRef } from 'react';
import { vec3 } from 'three/tsl';
import { AgXToneMapping, EquirectangularReflectionMapping, PhysicalLightingModel } from 'three/webgpu';
import type { DirectionalLight, Node } from 'three/webgpu';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { Canvas, useLoader, useThree } from '@react-three/fiber/webgpu';
import type CameraControlsImpl from 'camera-controls';
import { useControls } from 'leva';

import { DemoHelpers } from '../../../utils/DemoHelpers';
import { DungeonModel } from './DungeonModel';
import { SSRDenoisePipeline } from './SSRDenoisePipeline';

const HDR_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/equirectangular/quarry_01_1k.hdr';

//* Env-map specular override ======================================

const BASE_INDIRECT_SPECULAR = PhysicalLightingModel.prototype.indirectSpecular;

// SSR supplies the specular reflections in this scene, so the env map must not also
// contribute them — otherwise every reflection is counted twice. Diffuse irradiance
// is left alone. The vanilla original patches the prototype at module scope; here the
// app is a router SPA, so the patch is installed and REMOVED symmetrically or it
// would follow the user into the next example.
function NoEnvSpecular() {
  useLayoutEffect(() => {
    PhysicalLightingModel.prototype.indirectSpecular = function (builder) {
      // `NodeBuilder.context` is declared `unknown` in @types/three (B11 family) —
      // the radiance slot is what the env-map specular is read from.
      (builder.context as { radiance: Node<'vec3'> }).radiance = vec3(0);
      if (this.clearcoatRadiance) (this.clearcoatRadiance as Node<'vec3'>).assign(vec3(0));
      BASE_INDIRECT_SPECULAR.call(this, builder);
    };
    return () => {
      PhysicalLightingModel.prototype.indirectSpecular = BASE_INDIRECT_SPECULAR;
    };
  }, []);

  return null;
}

//* Scene ==========================================================

// The single sun. Its shadow map is static (`autoUpdate = false`), so moving it has
// to re-request the render explicitly — which is why the light owns these controls.
function SunLight() {
  const { x, y, z, intensity } = useControls('Light', {
    x: { value: -10.9, min: -30, max: 30, step: 0.1 },
    y: { value: 2.2, min: -30, max: 30, step: 0.1 },
    z: { value: 10.75, min: -30, max: 30, step: 0.1 },
    intensity: { value: 20, min: 0, max: 50, step: 0.1 },
  });
  const lightRef = useRef<DirectionalLight>(null);

  useLayoutEffect(() => {
    const light = lightRef.current;
    if (!light) return;
    light.shadow.autoUpdate = false;
    light.shadow.needsUpdate = true;
    light.shadow.mapSize.set(4096, 4096);
    light.shadow.bias = -0.0005;
  }, []);

  useLayoutEffect(() => {
    if (lightRef.current) lightRef.current.shadow.needsUpdate = true;
  }, [x, y, z]);

  return (
    <directionalLight
      ref={lightRef}
      color="#ffffff"
      intensity={intensity}
      position={[x, y, z]}
      castShadow
      shadow-camera-left={-1.75}
      shadow-camera-right={1.75}
      shadow-camera-top={1.75}
      shadow-camera-bottom={-1.75}
      shadow-camera-near={0.1}
      shadow-camera-far={50}
    />
  );
}

export interface DungeonSceneProps {
  controlsRef: React.RefObject<CameraControlsImpl | null>;
}

// Gates on the HDR: SSR needs the raw equirect (with CPU-side data) for its env-miss
// lookup AND the scene needs it as background + IBL, so nothing below may build its
// shader graph before it exists (B15). The model then suspends in its OWN nested
// boundary, so it pops in without re-suspending the pipeline.
function DungeonScene({ controlsRef }: DungeonSceneProps) {
  const envMap = useLoader(HDRLoader, HDR_URL);
  const scene = useThree((s) => s.scene);

  useLayoutEffect(() => {
    envMap.mapping = EquirectangularReflectionMapping;
    envMap.generateMipmaps = true;
    envMap.needsUpdate = true;
    scene.background = envMap;
    scene.environment = envMap;
    scene.environmentIntensity = 1;
    return () => {
      scene.background = null;
      scene.environment = null;
    };
  }, [envMap, scene]);

  return (
    <>
      <SSRDenoisePipeline envMap={envMap} controlsRef={controlsRef} />
      <SunLight />
      <Suspense fallback={null}>
        <DungeonModel />
      </Suspense>
    </>
  );
}

export default function PostprocessingSSRDenoise() {
  const controlsRef = useRef<CameraControlsImpl>(null);

  return (
    <Canvas
      // AgX + exposure 1.57 is the original's grade; the pipeline re-applies the same
      // tone mapping itself (outputColorTransform is off), so both must agree.
      renderer={{ toneMapping: AgXToneMapping, toneMappingExposure: 1.57 }}
      shadows="percentage"
      camera={{ position: [1.26, 0.539, -0.272], fov: 35, near: 0.1, far: 8 }}>
      <NoEnvSpecular />
      <Suspense fallback={null}>
        <DungeonScene controlsRef={controlsRef} />
      </Suspense>
      <DemoHelpers
        grid={false}
        target={[1.026, 0.275, -1.082]}
        minDistance={0.2}
        maxDistance={6}
        controlsRef={controlsRef}
      />
    </Canvas>
  );
}

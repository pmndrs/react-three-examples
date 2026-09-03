/**
 * texture-hdr-formats
 * Three HDR texture loaders behind one leva switch: EXR and HDR (RGBE) each show their
 * raw image as a flat quad, UltraHDR (a JPEG carrying an embedded gain map) lights a torus
 * knot as an environment. Same "load a wide-range image" problem, three file formats.
 * Original: https://threejs.org/examples/#webgl_loader_texture_exr
 * Also folds in webgl_loader_texture_hdr and webgl_loader_texture_ultrahdr — three ~80-line
 * pages that share almost all of their setup around one loader class.
 *
 * DEMONSTRATES
 * - `EXRLoader`/`HDRLoader` both return a plain `DataTexture` — `texture.image.width`/
 *   `.height` (the loader's own decoded size) replace the original's callback-only
 *   `textureData`, so the quad's aspect ratio still comes from the file, not a guess
 * - `useLoader`'s extensions callback (`useLoader(Loader, url, (loader) => …)`) configuring
 *   `UltraHDRLoader.setDataType()` before the fetch — the original's `loader.setDataType()`
 *   before every reload of the same instance
 * - Reinhard tone mapping for the two flat-quad formats vs ACES for the lit UltraHDR scene,
 *   applied per format through fiber's `renderer` prop instead of three separate renderers
 * - Each format's own leva folder mounts only while selected, matching the exposure/
 *   metalness/roughness GUI the corresponding original shipped
 *
 * DIVERGENCE from original
 * - All three originals lock a fixed camera (orthographic for EXR/HDR, a static
 *   perspective for UltraHDR) with no orbiting. One shared perspective camera + DemoHelpers'
 *   orbit controls replaces all three, same substitution as `procedural-texture`/
 *   `texturegather`
 * - `useLoader` caches by URL, so switching UltraHDR's `type` control alone (same
 *   resolution) wouldn't normally refetch — the URL carries `type` as a fragment purely to
 *   bust that cache, since it's otherwise the only input `setDataType` reacts to
 */
import { Suspense, useLayoutEffect, useRef } from 'react';
import {
  ACESFilmicToneMapping,
  EquirectangularReflectionMapping,
  FloatType,
  HalfFloatType,
  ReinhardToneMapping,
} from 'three/webgpu';
import type { Mesh, ToneMapping } from 'three/webgpu';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { UltraHDRLoader } from 'three/addons/loaders/UltraHDRLoader.js';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber/webgpu';
import { useControls } from 'leva';
import { DemoHelpers } from '../../utils/DemoHelpers';

const ASSETS = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures';

type Format = 'EXR' | 'HDR' | 'UltraHDR';
const FORMATS: Format[] = ['EXR', 'HDR', 'UltraHDR'];
const TONE_MAPPING: Record<Format, ToneMapping> = {
  EXR: ReinhardToneMapping,
  HDR: ReinhardToneMapping,
  UltraHDR: ACESFilmicToneMapping,
};

//* EXR / HDR — flat quad viewer ===================================

function ExrQuad() {
  const renderer = useThree((state) => state.renderer);
  const { exposure } = useControls('EXR texture', { exposure: { value: 2, min: 0, max: 4, step: 0.01 } });
  const texture = useLoader(EXRLoader, `${ASSETS}/memorial.exr`);

  useLayoutEffect(() => {
    renderer.toneMappingExposure = exposure;
  }, [renderer, exposure]);

  const aspect = texture.image.width / texture.image.height;
  return (
    <mesh>
      <planeGeometry args={[1.5 * aspect, 1.5]} />
      <meshBasicNodeMaterial map={texture} />
    </mesh>
  );
}

function HdrQuad() {
  const renderer = useThree((state) => state.renderer);
  const { exposure } = useControls('HDR texture', { exposure: { value: 2, min: 0, max: 4, step: 0.01 } });
  const texture = useLoader(HDRLoader, `${ASSETS}/memorial.hdr`);

  useLayoutEffect(() => {
    renderer.toneMappingExposure = exposure;
  }, [renderer, exposure]);

  const aspect = texture.image.width / texture.image.height;
  return (
    <mesh>
      <planeGeometry args={[1.5 * aspect, 1.5]} />
      <meshBasicNodeMaterial map={texture} />
    </mesh>
  );
}

//* UltraHDR — environment-lit torus knot ==========================

function UltraHdrTorus() {
  const renderer = useThree((state) => state.renderer);
  const scene = useThree((state) => state.scene);
  const meshRef = useRef<Mesh>(null);

  const { autoRotate, metalness, roughness, exposure, resolution, type } = useControls('UltraHDR texture', {
    autoRotate: true,
    metalness: { value: 1, min: 0, max: 1, step: 0.01 },
    roughness: { value: 0, min: 0, max: 1, step: 0.01 },
    exposure: { value: 1, min: 0, max: 4, step: 0.01 },
    resolution: { value: '2k', options: ['2k', '4k'] },
    type: { value: 'HalfFloatType', options: ['HalfFloatType', 'FloatType'] },
  });

  const dataType = type === 'FloatType' ? FloatType : HalfFloatType;
  const envMap = useLoader(
    UltraHDRLoader,
    `${ASSETS}/equirectangular/spruit_sunrise_${resolution}.hdr.jpg#${type}`,
    (loader) => loader.setDataType(dataType),
  );

  // `.mapping` is read when the shader graph builds on the first render — layout effect,
  // not passive (AGENTS.md useLayoutEffect rule).
  useLayoutEffect(() => {
    envMap.mapping = EquirectangularReflectionMapping;
    scene.background = envMap;
    scene.environment = envMap;
    return () => {
      scene.background = null;
      scene.environment = null;
    };
  }, [scene, envMap]);

  useLayoutEffect(() => {
    renderer.toneMappingExposure = exposure;
  }, [renderer, exposure]);

  useFrame(({ delta }) => {
    if (autoRotate) meshRef.current!.rotation.y += 0.3 * delta;
  });

  return (
    <mesh ref={meshRef}>
      <torusKnotGeometry args={[1, 0.4, 128, 128, 1, 3]} />
      <meshStandardNodeMaterial roughness={roughness} metalness={metalness} />
    </mesh>
  );
}

//* Switch ==========================================================

function FormatScene({ format }: { format: Format }) {
  switch (format) {
    case 'EXR':
      return <ExrQuad />;
    case 'HDR':
      return <HdrQuad />;
    case 'UltraHDR':
      return <UltraHdrTorus />;
  }
}

export default function TextureHdrFormats() {
  const { format } = useControls('HDR format', { format: { value: 'EXR' as Format, options: FORMATS } });

  return (
    <Canvas
      renderer={{ toneMapping: TONE_MAPPING[format] }}
      background="#000000"
      camera={{ position: [0, 0, 5], fov: 50 }}>
      <Suspense fallback={null}>
        <FormatScene format={format} />
      </Suspense>
      <DemoHelpers />
    </Canvas>
  );
}

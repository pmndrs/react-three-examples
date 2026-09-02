/**
 * custom-fog
 * R3F port of three.js `webgpu_custom_fog`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_custom_fog (~220 lines of JS)
 *
 * DEMONSTRATES
 * - A fully custom TSL fog graph assigned to `scene.fogNode` (the CUSTOM path of the
 *   two-path fog rule): an animated two-octave `triNoise3D` height band — solid below
 *   `base`, faded out by `top`, its upper edge wobbled by noise so it breaks into
 *   slow-drifting wisps — composed with a `densityFogFactor` distance haze so the far
 *   peaks dissolve into the same grey
 * - `scene.backgroundNode` as the fog's horizon: `normalWorld.y.max(0).mix(ground, sky)`
 *   — the visible background IS the fog gradient; the physical sky is never drawn
 * - three.js's `TerrainGenerator`/`ForestGenerator` addons driven from React: the
 *   ~0.8s synchronous bake memoized on leva values committed on slider release
 *   (`onEditEnd`), while the addons' live `uniform()`-backed fields (forest cull
 *   from/to, camera position) mutate with zero rebuild
 * - `SkyMesh` as a pure IBL source: baked through `PMREMGenerator.fromScene` into
 *   `scene.environment` on every sun move, in a layout effect so the terrain's first
 *   shader build already sees the environment
 * - On-demand shadows for a static scene: `shadow-autoUpdate={false}` plus imperative
 *   `shadow.needsUpdate = true` only when the sun moves or the terrain regenerates —
 *   the 4096² map renders exactly once per change, not per frame
 *
 * DIVERGENCE from original
 * - The original's `renderer.inspector.createParameters` panel is replaced with leva
 *   (same parameters and ranges: sun elevation/azimuth, fog base/top/haze, forest
 *   cull from/to, terrain erosion/valley bias)
 * - The "regenerate" button (seed++) is replaced by a direct `seed` value control;
 *   seed/erosion/valleyBias commit on slider RELEASE via leva `onEditEnd` because a
 *   full terrain+forest bake is ~0.8s of synchronous CPU (dragging would jam). The
 *   original stages erosion/valleyBias until the next regenerate click anyway — here
 *   releasing the slider IS the regenerate
 * - `FirstPersonControls` (WASD fly-through) replaced by DemoHelpers' CameraControls
 *   orbit (house baseline; grid disabled — the terrain is the ground). Orbit target is
 *   the original's `lookAt(0, 5, -120)` point across the valley
 * - The fog time uniform — the original's `uniform(0).onFrameUpdate((frame) =>
 *   frame.time)`, which its own comment calls "an alternative way to create a
 *   TimerNode" — is replaced by the TSL `time` built-in (house rule: prefer built-ins;
 *   identical value)
 * - Sun light color/intensity/position are computed declaratively as JSX props from
 *   the same formulas the original's `updateSun()` applies imperatively
 * - `renderer.setPixelRatio(devicePixelRatio)` dropped (fiber manages dpr);
 *   `renderer.inspector` integration dropped (repo doesn't wire it)
 */
import { useEffect, useRef } from 'react';
import { ACESFilmicToneMapping } from 'three/webgpu';
import type { DirectionalLight } from 'three/webgpu';

import { Canvas, useThree } from '@react-three/fiber/webgpu';

import { DemoHelpers } from '../../../utils/DemoHelpers';
import { SunSky } from './SunSky';
import { TerrainForest } from './TerrainForest';
import { ValleyFog } from './ValleyFog';

// renderer.toneMappingExposure is a WebGPURenderer property, not a TSL uniform —
// mutated imperatively (same escape hatch as `sky`/`ocean`).
function ToneMappingExposure({ exposure }: { exposure: number }) {
  const renderer = useThree((s) => s.renderer);
  useEffect(() => {
    renderer.toneMappingExposure = exposure;
  }, [renderer, exposure]);
  return null;
}

export default function CustomFog() {
  const sunRef = useRef<DirectionalLight>(null);

  return (
    <Canvas
      renderer={{ toneMapping: ACESFilmicToneMapping }}
      shadows
      camera={{ position: [-50, 88, 230], fov: 45, near: 1, far: 20000 }}>
      <ValleyFog />
      <SunSky sunRef={sunRef} />
      <TerrainForest sunRef={sunRef} />
      <ToneMappingExposure exposure={0.62} />
      <DemoHelpers grid={false} target={[0, 5, -120]} minDistance={5} maxDistance={2000} />
    </Canvas>
  );
}

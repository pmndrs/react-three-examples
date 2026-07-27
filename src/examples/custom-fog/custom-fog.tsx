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
import { useEffect, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber/webgpu'
import { folder, useControls } from 'leva'
import { ACESFilmicToneMapping, type DirectionalLight } from 'three/webgpu'
import { DemoHelpers } from '../../utils/DemoHelpers'
import { SunSky } from './SunSky'
import { TerrainForest } from './TerrainForest'
import { ValleyFog } from './ValleyFog'

// renderer.toneMappingExposure is a WebGPURenderer property, not a TSL uniform —
// mutated imperatively (same escape hatch as `sky`/`ocean`).
function ToneMappingExposure({ exposure }: { exposure: number }) {
  const renderer = useThree((s) => s.renderer)
  useEffect(() => {
    renderer.toneMappingExposure = exposure
  }, [renderer, exposure])
  return null
}

export default function CustomFog() {
  const sunRef = useRef<DirectionalLight>(null)

  // Terrain parameters the expensive bake is keyed on — committed on slider release
  // (leva onEditEnd below), never per drag tick.
  const [baked, setBaked] = useState({ seed: 1, erosion: 0.7, valleyBias: 1.2 })

  const { elevation, azimuth, base, top, haze, cullFrom, cullTo } = useControls('custom-fog', {
    sun: folder({
      elevation: { value: 11, min: 1, max: 40, step: 0.5 }, // low = golden hour
      azimuth: { value: 150, min: 0, max: 360, step: 1 },
    }),
    fog: folder({
      base: { value: -20, min: -40, max: 20, step: 1 },
      top: { value: 55, min: 0, max: 130, step: 1 },
      haze: { value: 0.0012, min: 0, max: 0.005, step: 0.0001 },
    }),
    forest: folder({
      cullFrom: { value: 300, min: 50, max: 1000, step: 10 },
      cullTo: { value: 620, min: 100, max: 1400, step: 10 },
    }),
    terrain: folder({
      seed: {
        value: 1,
        min: 1,
        max: 50,
        step: 1,
        onEditEnd: (v: number) => setBaked((s) => ({ ...s, seed: v })),
      },
      erosion: {
        value: 0.7,
        min: 0,
        max: 1.5,
        step: 0.05,
        onEditEnd: (v: number) => setBaked((s) => ({ ...s, erosion: v })),
      },
      valleyBias: {
        value: 1.2,
        min: 1,
        max: 3,
        step: 0.1,
        onEditEnd: (v: number) => setBaked((s) => ({ ...s, valleyBias: v })),
      },
    }),
  })

  return (
    <Canvas
      renderer={{ toneMapping: ACESFilmicToneMapping }}
      shadows
      camera={{ position: [-50, 88, 230], fov: 45, near: 1, far: 20000 }}
    >
      <ValleyFog base={base} top={top} haze={haze} />
      <SunSky elevation={elevation} azimuth={azimuth} sunRef={sunRef} />
      <TerrainForest
        seed={baked.seed}
        erosion={baked.erosion}
        valleyBias={baked.valleyBias}
        cullFrom={cullFrom}
        cullTo={cullTo}
        sunRef={sunRef}
      />
      <ToneMappingExposure exposure={0.62} />
      <DemoHelpers grid={false} target={[0, 5, -120]} minDistance={5} maxDistance={2000} />
    </Canvas>
  )
}

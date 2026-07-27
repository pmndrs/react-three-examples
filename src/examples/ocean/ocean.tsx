/**
 * ocean
 * R3F port of three.js `webgpu_ocean`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_ocean (~200 lines of JS)
 *
 * DEMONSTRATES
 * - three.js's `WaterMesh` TSL addon (reflector-based flat ocean: animated normal-map
 *   distortion over a live planar reflection) driven through its own `uniform()`-backed
 *   fields (`distortionScale`, `size`, `sunDirection`) — mutated imperatively from leva,
 *   no fiber `useUniforms` needed (same "instance-owned uniform" pattern as `sky`)
 * - `SkyMesh` doubling as the IBL source: on every sun move the sky is temporarily
 *   reparented into a bare env `Scene` and baked through `PMREMGenerator.fromScene`
 *   into `scene.environment` — the original's `updateSun()` dance, run in a
 *   `useLayoutEffect` so the FIRST shader build of the floating box already sees the
 *   environment (passive effects can lose that race — AGENTS.md B15/useLayoutEffect)
 * - Bloom post-processing via `useRenderPipeline` return-to-register: `bloom()`'s own
 *   `.strength`/`.radius` uniforms mutated in an effect, no rebuild, no fiber cast
 * - `renderer.toneMappingExposure` driven live from leva (renderer property, not a
 *   TSL uniform — same escape hatch as `sky`/`postprocessing-bloom-emissive`)
 *
 * DIVERGENCE from original
 * - The original's `renderer.inspector.createParameters` panel is replaced with leva
 *   (same parameters/ranges: Sky elevation/azimuth/exposure, Water distortionScale/size,
 *   Bloom strength/radius, Clouds coverage/density/elevation)
 * - OrbitControls replaced by DemoHelpers' CameraControls with the same constraints
 *   (target [0,10,0], minDistance 40, maxDistance 200, maxPolarAngle ≈ horizon lock)
 * - DemoHelpers grid disabled — the ocean plane IS the ground, edge to edge
 * - The floating box mounts inside the same Suspense gate as the water/sky so its
 *   first commit lands together with the env bake (B15 IBL-race guard); visually
 *   identical, ordering-safe
 * - Box bobbing driven by `useFrame`'s `state.elapsed` instead of `performance.now()`
 * - `renderer.inspector` / `Inspector` integration dropped (repo doesn't wire it)
 */
import { Suspense, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber/webgpu'
import { folder, useControls } from 'leva'
import { ACESFilmicToneMapping, type Mesh } from 'three/webgpu'
import { DemoHelpers } from '../../utils/DemoHelpers'
import { OceanSky } from './OceanSky'
import { PostFX, ToneMappingExposure } from './PostFX'

// The mirror-finish box bobbing in the swell — lit purely by the PMREM'd sky.
function BobbingBox() {
  const meshRef = useRef<Mesh>(null)

  useFrame((state) => {
    const mesh = meshRef.current
    if (!mesh) return
    mesh.position.y = Math.sin(state.elapsed) * 20 + 5
    mesh.rotation.x = state.elapsed * 0.5
    mesh.rotation.z = state.elapsed * 0.51
  })

  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[30, 30, 30]} />
      <meshStandardMaterial roughness={0} />
    </mesh>
  )
}

export default function Ocean() {
  const {
    elevation,
    azimuth,
    exposure,
    distortionScale,
    size,
    bloomStrength,
    bloomRadius,
    cloudCoverage,
    cloudDensity,
    cloudElevation,
  } = useControls('ocean', {
    sky: folder({
      elevation: { value: 2, min: 0, max: 90, step: 0.1 },
      azimuth: { value: 180, min: -180, max: 180, step: 0.1 },
      exposure: { value: 0.1, min: 0, max: 1, step: 0.0001 },
    }),
    water: folder({
      distortionScale: { value: 3.7, min: 0, max: 8, step: 0.1 },
      size: { value: 1, min: 0.1, max: 10, step: 0.1 },
    }),
    bloom: folder({
      bloomStrength: { value: 0.1, min: 0, max: 3, step: 0.01 },
      bloomRadius: { value: 0, min: 0, max: 1, step: 0.01 },
    }),
    clouds: folder({
      cloudCoverage: { value: 0.4, min: 0, max: 1, step: 0.01 },
      cloudDensity: { value: 0.5, min: 0, max: 1, step: 0.01 },
      cloudElevation: { value: 0.5, min: 0, max: 1, step: 0.01 },
    }),
  })

  return (
    <Canvas
      renderer={{ toneMapping: ACESFilmicToneMapping }}
      camera={{ position: [30, 30, 100], fov: 55, near: 1, far: 20000 }}
    >
      <Suspense fallback={null}>
        <OceanSky
          elevation={elevation}
          azimuth={azimuth}
          distortionScale={distortionScale}
          size={size}
          cloudCoverage={cloudCoverage}
          cloudDensity={cloudDensity}
          cloudElevation={cloudElevation}
        />
        {/* Inside the same gate: first commit must coincide with the env bake (B15). */}
        <BobbingBox />
      </Suspense>
      <PostFX strength={bloomStrength} radius={bloomRadius} />
      <ToneMappingExposure exposure={exposure} />
      <DemoHelpers
        grid={false}
        target={[0, 10, 0]}
        minDistance={40}
        maxDistance={200}
        maxPolarAngle={Math.PI * 0.495}
      />
    </Canvas>
  )
}

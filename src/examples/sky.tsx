/**
 * sky
 * R3F port of three.js `webgpu_sky`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_sky (~181 lines of JS)
 *
 * DEMONSTRATES
 * - three.js's `SkyMesh` TSL addon (Preetham analytic sky model + a hand-rolled fbm
 *   cloud layer) driven entirely through its own `uniform()`-backed fields
 *   (`turbidity`, `rayleigh`, `sunPosition`, `cloudCoverage`, …) — mutated imperatively
 *   from leva in an effect, no fiber `useUniforms` needed since the uniforms already
 *   live on the mesh instance (same "pass-owned uniform" pattern as
 *   postprocessing-bloom-emissive's `bloom()` pass, just on a mesh instead of a pass)
 * - drei's `<CubeCamera>` (`/webgpu`) to bake the sky into a live env map for a
 *   reflective sphere — replaces the original's manual `CubeRenderTarget` +
 *   `CubeCamera` + `sphere.visible` toggle dance with the render-prop's built-in
 *   hide/update/show cycle
 * - `renderer.toneMappingExposure` driven live from leva (same escape hatch as
 *   postprocessing-bloom-emissive: a WebGPURenderer property, not a TSL uniform)
 *
 * DIVERGENCE from original
 * - The original's `renderer.inspector.createParameters` dat.gui-style panel is
 *   replaced with leva controls (same parameters/ranges); the "Clouds" GUI folder
 *   becomes a leva `folder()` group
 * - The original locks the view to orbit-only (OrbitControls `enableZoom`/`enablePan`
 *   both false, fixed camera distance). `src/utils/CameraControls.tsx` only forwards
 *   `target`/`minDistance`/`maxDistance` — no enableZoom/enablePan passthrough exists,
 *   so this is a real AGENTS.md/CameraControls gap, not routed around. `minDistance` =
 *   `maxDistance` = the initial camera distance reproduces the zoom-lock; panning
 *   remains enabled (flagged, not faked)
 * - DemoHelpers grid disabled (`grid={false}`) — the sky dome fills the frame edge to
 *   edge; a ground grid would cut across open sky where the original has none
 */
import { useEffect, useMemo } from 'react'
import { Canvas, useThree } from '@react-three/fiber/webgpu'
import { CubeCamera } from '@react-three/drei/webgpu'
import { folder, useControls } from 'leva'
import { SkyMesh } from 'three/addons/objects/SkyMesh.js'
import { ACESFilmicToneMapping, MathUtils, Vector3 } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

// Initial camera distance from the origin — reused to lock CameraControls' dolly range
// (see DIVERGENCE: the wrapper has no enableZoom/enablePan passthrough).
const CAMERA_POSITION: [number, number, number] = [0, 100, 2000]
const CAMERA_DISTANCE = Math.hypot(...CAMERA_POSITION)

interface SkyProps {
  turbidity: number
  rayleigh: number
  mieCoefficient: number
  mieDirectionalG: number
  elevation: number
  azimuth: number
  showSunDisc: boolean
  cloudCoverage: number
  cloudDensity: number
  cloudElevation: number
}

// SkyMesh's parameters are all `uniform()`-backed fields on the instance (three.js TSL),
// mutated directly here — no fiber uniform/rebuild machinery needed.
function Sky({
  turbidity,
  rayleigh,
  mieCoefficient,
  mieDirectionalG,
  elevation,
  azimuth,
  showSunDisc,
  cloudCoverage,
  cloudDensity,
  cloudElevation,
}: SkyProps) {
  const sky = useMemo(() => {
    const mesh = new SkyMesh()
    mesh.scale.setScalar(450000)
    return mesh
  }, [])

  useEffect(() => {
    sky.turbidity.value = turbidity
    sky.rayleigh.value = rayleigh
    sky.mieCoefficient.value = mieCoefficient
    sky.mieDirectionalG.value = mieDirectionalG
    sky.cloudCoverage.value = cloudCoverage
    sky.cloudDensity.value = cloudDensity
    sky.cloudElevation.value = cloudElevation
    sky.showSunDisc.value = showSunDisc ? 1 : 0

    const phi = MathUtils.degToRad(90 - elevation)
    const theta = MathUtils.degToRad(azimuth)
    sky.sunPosition.value.copy(new Vector3().setFromSphericalCoords(1, phi, theta))
  }, [
    sky,
    turbidity,
    rayleigh,
    mieCoefficient,
    mieDirectionalG,
    elevation,
    azimuth,
    showSunDisc,
    cloudCoverage,
    cloudDensity,
    cloudElevation,
  ])

  return <primitive object={sky} />
}

// Reflective sphere: drei's <CubeCamera> hides its children, captures the surrounding
// scene (the sky) into a cube render target, then shows them again — every frame — so
// the sphere never reflects itself. `envMap` on a plain MeshBasicNodeMaterial is enough
// for a simple mirror-style reflection (matches the original's parameter choice).
function ReflectiveSphere() {
  return (
    <CubeCamera resolution={256} near={1} far={1000}>
      {(texture) => (
        <mesh>
          <sphereGeometry args={[400, 64, 32]} />
          <meshBasicNodeMaterial envMap={texture} />
        </mesh>
      )}
    </CubeCamera>
  )
}

// renderer.toneMappingExposure is a WebGPURenderer property, not a TSL uniform — has no
// place in a node graph, so it's set imperatively (same pattern as
// postprocessing-bloom-emissive's ToneMappingExposure).
function ToneMappingExposure({ exposure }: { exposure: number }) {
  const renderer = useThree((s) => s.renderer)

  useEffect(() => {
    renderer.toneMappingExposure = exposure
  }, [renderer, exposure])

  return null
}

export default function WebgpuSky() {
  const {
    turbidity,
    rayleigh,
    mieCoefficient,
    mieDirectionalG,
    elevation,
    azimuth,
    exposure,
    showSunDisc,
    cloudCoverage,
    cloudDensity,
    cloudElevation,
  } = useControls('webgpu-sky', {
    turbidity: { value: 10, min: 0, max: 20, step: 0.1 },
    rayleigh: { value: 3, min: 0, max: 4, step: 0.001 },
    mieCoefficient: { value: 0.005, min: 0, max: 0.1, step: 0.001 },
    mieDirectionalG: { value: 0.7, min: 0, max: 1, step: 0.001 },
    elevation: { value: 65, min: 0, max: 90, step: 0.1 },
    azimuth: { value: 0, min: -180, max: 180, step: 0.1 },
    exposure: { value: 0.05, min: 0, max: 1, step: 0.0001 },
    showSunDisc: true,
    clouds: folder({
      cloudCoverage: { value: 0.4, min: 0, max: 1, step: 0.01 },
      cloudDensity: { value: 0.4, min: 0, max: 1, step: 0.01 },
      cloudElevation: { value: 0.5, min: 0, max: 1, step: 0.01 },
    }),
  })

  return (
    <Canvas
      renderer={{ toneMapping: ACESFilmicToneMapping }}
      camera={{ position: CAMERA_POSITION, fov: 60, near: 100, far: 2000000 }}
    >
      <Sky
        turbidity={turbidity}
        rayleigh={rayleigh}
        mieCoefficient={mieCoefficient}
        mieDirectionalG={mieDirectionalG}
        elevation={elevation}
        azimuth={azimuth}
        showSunDisc={showSunDisc}
        cloudCoverage={cloudCoverage}
        cloudDensity={cloudDensity}
        cloudElevation={cloudElevation}
      />
      <ReflectiveSphere />
      <ToneMappingExposure exposure={exposure} />
      <DemoHelpers grid={false} minDistance={CAMERA_DISTANCE} maxDistance={CAMERA_DISTANCE} />
    </Canvas>
  )
}

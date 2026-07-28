/**
 * lights-physical
 * R3F port of three.js `webgpu_lights_physical`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_lights_physical (~230 lines of JS)
 *
 * DEMONSTRATES
 * - Photometric light units: `PointLight.power` (lumens) drives `intensity` through a
 *   physically-based setter — swapping "bulb wattage" via a labeled leva dropdown
 *   (110000 lm down to Off) reads exactly like picking a real bulb, and the light's own
 *   `intensity` getter (post-conversion) is read back every frame to drive the bulb
 *   mesh's `emissiveIntensity` (irradiance at the bulb's surface, `intensity / 0.02²`)
 *   — no duplicate physics, the light IS the source of truth
 * - `HemisphereLight.intensity` set from a second photometric table (lux, moonless
 *   night to direct sun) — plain reactive props, both light types take a runtime
 *   number with no shader/material involvement
 * - `ReinhardToneMapping` + a manually-driven `renderer.toneMappingExposure =
 *   exposure**5` (the original's own curve, "to allow for very bright scenes") synced
 *   imperatively since exposure isn't a per-frame constant — a plain `useEffect` on a
 *   `useThree` renderer read, no WebGPU-only cast needed (`toneMappingExposure` is a
 *   common `Renderer` property, unlike the WebGPU-only calls AGENTS.md's B9 covers)
 * - Bump-mapped `MeshStandardMaterial`s (wood floor, brick cubes, a metalness-mapped
 *   earth sphere) — plain fiber JSX texture props, no node-material graph needed for
 *   this example; a deliberate contrast with the other three lights-* ports in this
 *   batch, which are all TSL-heavy
 *
 * DIVERGENCE from original
 * - `renderer.inspector`'s GUI dropdowns/sliders replaced by leva (`shadows`,
 *   `exposure`, `bulbPower`, `hemiIrradiance`) — same four parameters, one-to-one
 * - `renderer.shadowMap.enabled` and each material's `needsUpdate` (forcing shader
 *   recompilation on the shadow toggle, matching the original's `previousShadowMap`
 *   diff) are synced imperatively from the `shadows` leva boolean instead of a
 *   Canvas-level prop — `<Canvas shadows>` only configures the renderer at mount, it
 *   isn't a live toggle
 * - OrbitControls -> this repo's CameraControls (via DemoHelpers), same
 *   min/maxDistance
 * - DemoHelpers grid disabled (`grid={false}`) — the original's own 20x20 wood floor
 *   IS the shadow receiver this example is about
 */
import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber/webgpu'
import { useTexture } from '@react-three/drei/webgpu'
import { folder, useControls } from 'leva'
import { MeshStandardMaterial, ReinhardToneMapping, RepeatWrapping, SRGBColorSpace } from 'three/webgpu'
import type { PointLight } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const TEXTURE_BASE = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/'

// ref: http://www.power-sure.com/lumens.htm
const BULB_POWERS: Record<string, number> = {
  '110000 lm (1000W)': 110000,
  '3500 lm (300W)': 3500,
  '1700 lm (100W)': 1700,
  '800 lm (60W)': 800,
  '400 lm (40W)': 400,
  '180 lm (25W)': 180,
  '20 lm (4W)': 20,
  Off: 0,
}

// ref: https://en.wikipedia.org/wiki/Lux
const HEMI_IRRADIANCES: Record<string, number> = {
  '0.0001 lx (Moonless Night)': 0.0001,
  '0.002 lx (Night Airglow)': 0.002,
  '0.5 lx (Full Moon)': 0.5,
  '3.4 lx (City Twilight)': 3.4,
  '50 lx (Living Room)': 50,
  '100 lx (Very Overcast)': 100,
  '350 lx (Office Room)': 350,
  '400 lx (Sunrise/Sunset)': 400,
  '1000 lx (Overcast)': 1000,
  '18000 lx (Daylight)': 18000,
  '50000 lx (Direct Sun)': 50000,
}

// Syncs renderer-level state that has no fiber Canvas-prop live-toggle equivalent —
// see header DIVERGENCE.
function RendererSync({ shadows, exposure }: { shadows: boolean; exposure: number }) {
  const renderer = useThree((s) => s.renderer)

  useEffect(() => {
    renderer.toneMappingExposure = Math.pow(exposure, 5.0)
  }, [renderer, exposure])

  useEffect(() => {
    renderer.shadowMap.enabled = shadows
  }, [renderer, shadows])

  return null
}

interface BulbProps {
  bulbPower: string
  shadows: boolean
}

// The incandescent bulb: a PointLight driven by photometric power, plus its own
// emissive marker mesh whose brightness is read back from the light's own (converted)
// intensity every frame — see header DEMONSTRATES.
function Bulb({ bulbPower, shadows }: BulbProps) {
  const lightRef = useRef<PointLight>(null)
  const matRef = useRef<MeshStandardMaterial>(null)

  useFrame((state) => {
    const light = lightRef.current
    const mat = matRef.current
    if (!light || !mat) return
    // Convert emitted intensity to irradiance at the 2cm bulb surface (original's
    // own comment/formula).
    mat.emissiveIntensity = light.intensity / Math.pow(0.02, 2.0)
    light.position.y = Math.cos(state.time * 0.0005) * 0.75 + 1.25
  })

  return (
    <pointLight
      ref={lightRef}
      color="#ffee88"
      power={BULB_POWERS[bulbPower]}
      distance={100}
      decay={2}
      position={[0, 2, 0]}
      castShadow={shadows}
    >
      <mesh>
        <sphereGeometry args={[0.02, 16, 8]} />
        <meshStandardMaterial ref={matRef} emissive="#ffffee" emissiveIntensity={1} color="#000000" />
      </mesh>
    </pointLight>
  )
}

function Room({ shadows }: { shadows: boolean }) {
  const {
    floorDiffuse,
    floorBump,
    floorRoughness,
    cubeDiffuse,
    cubeBump,
    earthDiffuse,
    earthSpecular,
  } = useTexture({
    floorDiffuse: `${TEXTURE_BASE}hardwood2_diffuse.jpg`,
    floorBump: `${TEXTURE_BASE}hardwood2_bump.jpg`,
    floorRoughness: `${TEXTURE_BASE}hardwood2_roughness.jpg`,
    cubeDiffuse: `${TEXTURE_BASE}brick_diffuse.jpg`,
    cubeBump: `${TEXTURE_BASE}brick_bump.jpg`,
    earthDiffuse: `${TEXTURE_BASE}planets/earth_atmos_2048.jpg`,
    earthSpecular: `${TEXTURE_BASE}planets/earth_specular_2048.jpg`,
  })

  const floorMat = useMemo(() => new MeshStandardMaterial({ roughness: 0.8, color: 0xffffff, metalness: 0.2, bumpScale: 1 }), [])
  const cubeMat = useMemo(() => new MeshStandardMaterial({ roughness: 0.7, color: 0xffffff, metalness: 0.2, bumpScale: 1 }), [])
  const ballMat = useMemo(() => new MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 1.0 }), [])

  useEffect(() => {
    floorDiffuse.wrapS = floorDiffuse.wrapT = RepeatWrapping
    floorDiffuse.repeat.set(10, 24)
    floorDiffuse.anisotropy = 4
    floorDiffuse.colorSpace = SRGBColorSpace
    floorBump.wrapS = floorBump.wrapT = RepeatWrapping
    floorBump.repeat.set(10, 24)
    floorBump.anisotropy = 4
    floorRoughness.wrapS = floorRoughness.wrapT = RepeatWrapping
    floorRoughness.repeat.set(10, 24)
    floorRoughness.anisotropy = 4
    floorMat.map = floorDiffuse
    floorMat.bumpMap = floorBump
    floorMat.roughnessMap = floorRoughness
    floorMat.needsUpdate = true

    cubeDiffuse.wrapS = cubeDiffuse.wrapT = RepeatWrapping
    cubeDiffuse.anisotropy = 4
    cubeDiffuse.colorSpace = SRGBColorSpace
    cubeBump.wrapS = cubeBump.wrapT = RepeatWrapping
    cubeBump.anisotropy = 4
    cubeMat.map = cubeDiffuse
    cubeMat.bumpMap = cubeBump
    cubeMat.needsUpdate = true

    earthDiffuse.anisotropy = 4
    earthDiffuse.colorSpace = SRGBColorSpace
    earthSpecular.anisotropy = 4
    earthSpecular.colorSpace = SRGBColorSpace
    ballMat.map = earthDiffuse
    ballMat.metalnessMap = earthSpecular
    ballMat.needsUpdate = true
  }, [floorDiffuse, floorBump, floorRoughness, cubeDiffuse, cubeBump, earthDiffuse, earthSpecular, floorMat, cubeMat, ballMat])

  // Forces shader recompilation on the shadow toggle — matches the original's
  // `previousShadowMap` diff (see header DIVERGENCE).
  useEffect(() => {
    floorMat.needsUpdate = true
    cubeMat.needsUpdate = true
    ballMat.needsUpdate = true
  }, [shadows, floorMat, cubeMat, ballMat])

  return (
    <>
      <mesh material={floorMat} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[20, 20]} />
      </mesh>
      <mesh material={ballMat} position={[1, 0.25, 1]} rotation-y={Math.PI} castShadow>
        <sphereGeometry args={[0.25, 32, 32]} />
      </mesh>
      <mesh material={cubeMat} position={[-0.5, 0.25, -1]} castShadow>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
      </mesh>
      <mesh material={cubeMat} position={[0, 0.25, -5]} castShadow>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
      </mesh>
      <mesh material={cubeMat} position={[7, 0.25, 0]} castShadow>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
      </mesh>
    </>
  )
}

export default function LightsPhysical() {
  const { shadows, exposure, bulbPower, hemiIrradiance } = useControls('lights-physical', {
    shadows: true,
    exposure: { value: 0.68, min: 0, max: 1, step: 0.01 },
    bulbPower: { value: '400 lm (40W)', options: Object.keys(BULB_POWERS) },
    hemi: folder({
      hemiIrradiance: { value: '0.0001 lx (Moonless Night)', options: Object.keys(HEMI_IRRADIANCES), label: 'irradiance' },
    }),
  })

  return (
    <Canvas
      renderer={{ toneMapping: ReinhardToneMapping }}
      shadows
      camera={{ position: [-4, 2, 4], fov: 50, near: 0.1, far: 100 }}
    >
      <RendererSync shadows={shadows} exposure={exposure} />
      <hemisphereLight color="#ddeeff" groundColor="#0f0e0d" intensity={HEMI_IRRADIANCES[hemiIrradiance]} />
      <Bulb bulbPower={bulbPower} shadows={shadows} />
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes the displayed scene (AGENTS.md; corpus-wide repair, wave 8). */}
      <Suspense fallback={null}>
        <Room shadows={shadows} />
      </Suspense>
      <DemoHelpers grid={false} minDistance={1} maxDistance={20} />
    </Canvas>
  )
}

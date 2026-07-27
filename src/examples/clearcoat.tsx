/**
 * clearcoat
 * R3F port of three.js `webgpu_clearcoat`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_clearcoat (~160 lines of JS)
 *
 * DEMONSTRATES
 * - `MeshPhysicalNodeMaterial`'s clearcoat layer, four spheres isolating the knobs:
 *   flake car paint (metallic base + `FlakesTexture` normal map under a smooth coat),
 *   carbon fibre (textured diffuse + weave normal map under the coat), golf ball
 *   (`clearcoatNormalMap` scratching ONLY the coat over a smooth white base), and red
 *   metal (base `normalMap` + independent `clearcoatNormalMap` — two specular layers
 *   with different bump, the core of the dual-layer BRDF)
 * - An HDR CUBE environment via fiber's `useLoader(HDRCubeTextureLoader, [[...faces]])`
 *   — the nested-array input makes ONE `load()` call with all six face URLs. Neither
 *   fiber's nor drei's `Environment` can load this: their 6-file branch hardwires
 *   `CubeTextureLoader` before looking at the extension, which cannot parse Radiance
 *   `.hdr` faces (upstream gap, B13 family)
 * - `CanvasTexture` wrapping a procedural canvas addon (`FlakesTexture`) as a normal map
 * - An orbiting `PointLight` riding its own marker mesh (`<pointLight>` as a JSX child
 *   inherits the mesh transform for free — same pattern as `lights-phong`)
 * - `renderer={{ toneMapping, toneMappingExposure }}` matching the original's
 *   ACESFilmic @ 1.25 (deliberate: the original sets it explicitly)
 *
 * DIVERGENCE from original
 * - leva `clearcoat` slider (0–1, default 1) overriding the coat intensity on all four
 *   spheres — the original has no GUI; sliding to 0 strips the second specular layer
 *   live, which is the whole lesson of this example
 * - Sphere spin made delta-based (0.3 rad/s ≈ the original's per-frame `+= 0.005` at
 *   60 fps) and the light path driven by `state.elapsed` instead of `Date.now()`
 * - OrbitControls -> this repo's CameraControls (via DemoHelpers), same 3/30 dolly
 *   limits as the original; grid disabled (`grid={false}`) — the scene floats in a
 *   Pisa skybox with no ground plane, a world-origin grid would be pure invention
 * - `renderer.inspector = new Inspector()` dropped — this repo doesn't wire the
 *   Inspector RootState slot yet (same gap noted in `lights-phong` / `reflection`)
 */
import { Suspense, useLayoutEffect, useRef } from 'react'
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber/webgpu'
import { useTexture } from '@react-three/drei/webgpu'
import { useControls } from 'leva'
import {
  ACESFilmicToneMapping,
  CanvasTexture,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
} from 'three/webgpu'
import type { Group, Mesh } from 'three/webgpu'
import { HDRCubeTextureLoader } from 'three/addons/loaders/HDRCubeTextureLoader.js'
import { FlakesTexture } from 'three/addons/textures/FlakesTexture.js'
import { DemoHelpers } from '../utils/DemoHelpers'

const TEXTURE_BASE = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/'
const PISA_HDR_FILES = ['px', 'nx', 'py', 'ny', 'pz', 'nz'].map(
  (face) => `${TEXTURE_BASE}cube/pisaHDR/${face}.hdr`,
)

// Shared static assets — constants, not mutable state, so module-scope THREE instances
// are the idiomatic call (same rationale as lights-phong's teapotGeometry). The flakes
// canvas is procedural (FlakesTexture draws random flake normals once); building it at
// module scope also sidesteps a StrictMode double-create.
const sphereGeometry = new SphereGeometry(0.8, 64, 32)
const flakesNormalMap = new CanvasTexture(new FlakesTexture())
flakesNormalMap.wrapS = flakesNormalMap.wrapT = RepeatWrapping
flakesNormalMap.repeat.set(10, 6)
flakesNormalMap.anisotropy = 16

// Loads the six Radiance .hdr cube faces in one HDRCubeTextureLoader call (nested-array
// useLoader input) and wires the result as both skybox and IBL source, matching the
// original's `scene.background = scene.environment = texture`. Layout effect so the
// assignment lands before the sibling spheres' first shader build reads
// `scene.environment` (AGENTS.md B15 family).
function PisaEnvironment() {
  const scene = useThree((s) => s.scene)
  const [envCube] = useLoader(HDRCubeTextureLoader, [PISA_HDR_FILES])

  useLayoutEffect(() => {
    scene.background = envCube
    scene.environment = envCube
    return () => {
      scene.background = null
      scene.environment = null
    }
  }, [scene, envCube])

  return null
}

// The four clearcoat spheres and the orbiting point light — see header DEMONSTRATES.
function ClearcoatSpheres({ clearcoat }: { clearcoat: number }) {
  const groupRef = useRef<Group>(null)
  const lightRef = useRef<Mesh>(null)

  const { carbonDiffuse, carbonNormal, waterNormal, golfballNormal, scratchedGoldNormal } =
    useTexture({
      carbonDiffuse: `${TEXTURE_BASE}carbon/Carbon.png`,
      carbonNormal: `${TEXTURE_BASE}carbon/Carbon_Normal.png`,
      waterNormal: `${TEXTURE_BASE}water/Water_1_M_Normal.jpg`,
      golfballNormal: `${TEXTURE_BASE}golfball.jpg`,
      scratchedGoldNormal: `${TEXTURE_BASE}pbr/Scratched_gold/Scratched_gold_01_1K_Normal.png`,
    })

  // Wrap/repeat/colorSpace must be applied (and re-uploaded via needsUpdate) before the
  // first RAF render reads the textures — layout effect, not passive (AGENTS.md).
  useLayoutEffect(() => {
    carbonDiffuse.colorSpace = SRGBColorSpace
    for (const map of [carbonDiffuse, carbonNormal]) {
      map.wrapS = map.wrapT = RepeatWrapping
      map.repeat.set(10, 10)
      map.needsUpdate = true
    }
  }, [carbonDiffuse, carbonNormal])

  useFrame((state, delta) => {
    const timer = state.elapsed * 0.25
    lightRef.current?.position.set(
      Math.sin(timer * 7) * 3,
      Math.cos(timer * 5) * 4,
      Math.cos(timer * 3) * 3,
    )
    if (groupRef.current) {
      for (const child of groupRef.current.children) child.rotation.y += delta * 0.3
    }
  })

  return (
    <>
      <group ref={groupRef}>
        {/* car paint: metallic blue flakes under a smooth coat */}
        <mesh geometry={sphereGeometry} position={[-1, 1, 0]}>
          <meshPhysicalNodeMaterial
            clearcoat={clearcoat}
            clearcoatRoughness={0.1}
            metalness={0.9}
            roughness={0.5}
            color={0x0000ff}
            normalMap={flakesNormalMap}
            normalScale={[0.15, 0.15]}
          />
        </mesh>

        {/* carbon fibre: textured weave under the coat */}
        <mesh geometry={sphereGeometry} position={[1, 1, 0]}>
          <meshPhysicalNodeMaterial
            roughness={0.5}
            clearcoat={clearcoat}
            clearcoatRoughness={0.1}
            map={carbonDiffuse}
            normalMap={carbonNormal}
          />
        </mesh>

        {/* golf ball: smooth white base, dimples live in the COAT's normal map only.
            y scale is negated to compensate for normal map handedness (original). */}
        <mesh geometry={sphereGeometry} position={[-1, -1, 0]}>
          <meshPhysicalNodeMaterial
            metalness={0}
            roughness={0.1}
            clearcoat={clearcoat}
            normalMap={golfballNormal}
            clearcoatNormalMap={scratchedGoldNormal}
            clearcoatNormalScale={[2.0, -2.0]}
          />
        </mesh>

        {/* red metal: independent base + coat normal maps, one bump per specular layer */}
        <mesh geometry={sphereGeometry} position={[1, -1, 0]}>
          <meshPhysicalNodeMaterial
            clearcoat={clearcoat}
            metalness={1}
            color={0xff0000}
            normalMap={waterNormal}
            normalScale={[0.15, 0.15]}
            clearcoatNormalMap={scratchedGoldNormal}
            clearcoatNormalScale={[2.0, -2.0]}
          />
        </mesh>
      </group>

      {/* orbiting light doubling as its own visible marker */}
      <mesh ref={lightRef}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshBasicMaterial color={0xffffff} />
        <pointLight color={0xffffff} intensity={30} />
      </mesh>
    </>
  )
}

export default function Clearcoat() {
  const { clearcoat } = useControls('clearcoat', {
    clearcoat: { value: 1, min: 0, max: 1, step: 0.01 },
  })

  return (
    <Canvas
      renderer={{ toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1.25 }}
      camera={{ position: [0, 0, 10], fov: 27, near: 0.25, far: 50 }}
    >
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes the displayed scene (AGENTS.md; corpus-wide repair, wave 8). */}
      <Suspense fallback={null}>
        <PisaEnvironment />
        <ClearcoatSpheres clearcoat={clearcoat} />
      </Suspense>
      <DemoHelpers grid={false} minDistance={3} maxDistance={30} />
    </Canvas>
  )
}

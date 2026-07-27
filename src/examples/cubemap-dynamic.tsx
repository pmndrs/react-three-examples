/**
 * cubemap-dynamic
 * R3F port of three.js `webgpu_cubemap_dynamic`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_cubemap_dynamic (~140 lines of JS)
 *
 * DEMONSTRATES
 * - Live cube-mapped reflections: drei's `useCubeCamera` (`/webgpu`) re-renders the
 *   scene into a `CubeRenderTarget` every frame while a cube and a torus knot orbit
 *   the mirror sphere — the hook form (vs `<CubeCamera>` render-prop, see `sky`)
 *   exposes the target so the original's texture setup (HalfFloat + generateMipmaps +
 *   `LinearMipmapLinearFilter`, needed for the roughness slider to blur the live
 *   reflection) can be applied, and the hide/update/show cycle stays visible in the
 *   example's own `useFrame` like the original's `material.visible` dance
 * - Three env sources on one scene, one per mesh: the sphere reflects the LIVE cube
 *   render target, the torus carries the STATIC Pisa cube texture as its own
 *   `envMap`, and the untextured-envMap cube falls back to `scene.environment` IBL
 * - An HDR CUBE environment via fiber's `useLoader(HDRCubeTextureLoader, [[...faces]])`
 *   — neither fiber's nor drei's `Environment` can load 6-file `.hdr` arrays (their
 *   6-file branch hardwires `CubeTextureLoader`; upstream gap B20, pattern `clearcoat`)
 * - Per-material `envMapIntensity` vs scene-wide `environmentIntensity` vs
 *   `renderer.toneMappingExposure`, each driven live from leva with zero uniform
 *   plumbing (material scalars are reference-node-backed in the node pipeline)
 *
 * DIVERGENCE from original
 * - The original's `renderer.inspector.createParameters` panel (with `Inspector.js`;
 *   dropped — this repo doesn't wire the Inspector RootState slot) is replaced with
 *   leva: same five knobs (roughness, metalness, exposure, environmentIntensity,
 *   envMapIntensity)
 * - Object spin is delta-scaled (1.2 / 1.8 rad/s ≈ the original's per-frame
 *   `+= 0.02` / `+= 0.03` at 60 fps) so it is frame-rate independent
 * - The original hides only the mirror `material`; here the whole sphere mesh is
 *   toggled during the cube-camera pass — same effect (the sphere never reflects
 *   itself), one object
 * - OrbitControls (`autoRotate`) -> this repo's CameraControls via DemoHelpers
 *   (`autoRotate`, matching speed); grid disabled (`grid={false}`) — the scene floats
 *   in the Pisa skybox with no ground plane
 */
import { Suspense, useLayoutEffect, useRef } from 'react'
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber/webgpu'
import { useCubeCamera, useTexture } from '@react-three/drei/webgpu'
import { useControls } from 'leva'
import { ACESFilmicToneMapping, LinearFilter, LinearMipmapLinearFilter } from 'three/webgpu'
import type { Mesh } from 'three/webgpu'
import { HDRCubeTextureLoader } from 'three/addons/loaders/HDRCubeTextureLoader.js'
import { DemoHelpers } from '../utils/DemoHelpers'

const TEXTURE_BASE = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/'
const PISA_HDR_FILES = ['px', 'nx', 'py', 'ny', 'pz', 'nz'].map(
  (face) => `${TEXTURE_BASE}cube/pisaHDR/${face}.hdr`,
)
const UV_GRID_URL = `${TEXTURE_BASE}uv_grid_opengl.jpg`

// The mirror sphere. drei's useCubeCamera hook (not the <CubeCamera> render-prop —
// see header DEMONSTRATES) hands back the CubeRenderTarget so the original's mipmap
// filter setup survives, plus the camera and an update() that re-renders the scene
// into the target; the hide/update/show cycle runs in this component's useFrame.
function ReflectiveSphere({ roughness, metalness }: { roughness: number; metalness: number }) {
  const { fbo, camera, update } = useCubeCamera({ resolution: 256, near: 1, far: 1000 })
  const sphereRef = useRef<Mesh>(null)

  // Mipmapped filtering on the live target is what lets the roughness slider blur the
  // reflection (original's explicit texture setup; drei only sets HalfFloatType).
  // Layout effect: must land before the first render writes into the target.
  useLayoutEffect(() => {
    fbo.texture.minFilter = LinearMipmapLinearFilter
    fbo.texture.magFilter = LinearFilter
    fbo.texture.generateMipmaps = true
  }, [fbo])

  useFrame(() => {
    const sphere = sphereRef.current
    if (!sphere) return
    sphere.visible = false // the mirror must not reflect itself
    update()
    sphere.visible = true
  })

  return (
    <>
      <primitive object={camera} />
      <mesh ref={sphereRef}>
        <icosahedronGeometry args={[15, 8]} />
        <meshStandardNodeMaterial envMap={fbo.texture} roughness={roughness} metalness={metalness} />
      </mesh>
    </>
  )
}

// Skybox + IBL from the six Pisa Radiance .hdr faces (one nested-array useLoader call —
// B20 workaround, pattern `clearcoat`). Layout effect so the assignment lands before
// sibling meshes' first shader build reads `scene.environment` (B15 family).
function PisaEnvironment() {
  const scene = useThree((s) => s.scene)
  const [envCube] = useLoader(HDRCubeTextureLoader, [PISA_HDR_FILES])

  useLayoutEffect(() => {
    envCube.minFilter = LinearMipmapLinearFilter
    envCube.magFilter = LinearFilter
    scene.background = envCube
    scene.environment = envCube
    return () => {
      scene.background = null
      scene.environment = null
    }
  }, [scene, envCube])

  return null
}

// The two orbiting subjects the mirror tracks: a uv-grid cube lit by scene.environment
// alone, and a torus knot carrying the STATIC Pisa cube texture as its own envMap
// (useLoader cache — same six-face load as PisaEnvironment, no second fetch).
function OrbitingObjects({ envMapIntensity }: { envMapIntensity: number }) {
  const uvTexture = useTexture(UV_GRID_URL)
  const [envCube] = useLoader(HDRCubeTextureLoader, [PISA_HDR_FILES])
  const cubeRef = useRef<Mesh>(null)
  const torusRef = useRef<Mesh>(null)

  useFrame((state, delta) => {
    const time = state.elapsed
    const cube = cubeRef.current
    const torus = torusRef.current
    if (!cube || !torus) return

    cube.position.set(Math.cos(time) * 30, Math.sin(time) * 30, Math.sin(time) * 30)
    cube.rotation.x += 1.2 * delta
    cube.rotation.y += 1.8 * delta

    torus.position.set(Math.cos(time + 10) * 30, Math.sin(time + 10) * 30, Math.sin(time + 10) * 30)
    torus.rotation.x += 1.2 * delta
    torus.rotation.y += 1.8 * delta
  })

  return (
    <>
      <mesh ref={cubeRef}>
        <boxGeometry args={[15, 15, 15]} />
        <meshStandardNodeMaterial map={uvTexture} roughness={0.1} metalness={0} />
      </mesh>
      <mesh ref={torusRef}>
        <torusKnotGeometry args={[8, 3, 128, 16]} />
        <meshStandardNodeMaterial
          map={uvTexture}
          roughness={0.1}
          metalness={0}
          envMap={envCube}
          envMapIntensity={envMapIntensity}
        />
      </mesh>
    </>
  )
}

// toneMappingExposure is a WebGPURenderer property and environmentIntensity a Scene
// property — neither is a TSL uniform, so both are set imperatively (pattern `sky`).
function RendererSettings({ exposure, environmentIntensity }: { exposure: number; environmentIntensity: number }) {
  const renderer = useThree((s) => s.renderer)
  const scene = useThree((s) => s.scene)

  useLayoutEffect(() => {
    renderer.toneMappingExposure = exposure
    scene.environmentIntensity = environmentIntensity
  }, [renderer, scene, exposure, environmentIntensity])

  return null
}

export default function CubemapDynamic() {
  const { roughness, metalness, exposure, environmentIntensity, envMapIntensity } = useControls(
    'cubemap-dynamic',
    {
      roughness: { value: 0.05, min: 0, max: 1, step: 0.01 },
      metalness: { value: 1, min: 0, max: 1, step: 0.01 },
      exposure: { value: 1, min: 0, max: 2, step: 0.01 },
      environmentIntensity: { value: 1, min: 0, max: 1, step: 0.01 },
      envMapIntensity: { value: 1, min: 0, max: 1, step: 0.01 },
    },
  )

  return (
    <Canvas
      renderer={{ toneMapping: ACESFilmicToneMapping }}
      camera={{ position: [0, 0, 75], fov: 60, near: 1, far: 1000 }}
    >
      <ReflectiveSphere roughness={roughness} metalness={metalness} />
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes the displayed scene (AGENTS.md; corpus-wide repair, wave 8). */}
      <Suspense fallback={null}>
        <PisaEnvironment />
        <OrbitingObjects envMapIntensity={envMapIntensity} />
      </Suspense>
      <RendererSettings exposure={exposure} environmentIntensity={environmentIntensity} />
      <DemoHelpers grid={false} autoRotate />
    </Canvas>
  )
}

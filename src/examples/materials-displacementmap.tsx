/**
 * materials-displacementmap
 * R3F port of three.js `webgpu_materials_displacementmap`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_materials_displacementmap (~140 lines of JS)
 *
 * DEMONSTRATES
 * - `MeshStandardNodeMaterial` driven by normal + ao + displacement + cube-environment
 *   maps together on one OBJ-loaded mesh: vertex-side displacement
 *   (displacementMap/Scale/Bias) combined with fragment-side normal perturbation,
 *   ambient occlusion and reflection, all built-in material fields — no hand-written
 *   TSL graph needed
 * - drei's `useTexture` object-map form — `useTexture({ normalMap: url, aoMap: url,
 *   displacementMap: url })` loads three textures in one call and hands them back
 *   keyed by the same names, alongside `useCubeTexture` for the reflection env map
 *   (same pairing as `materials-envmaps`)
 * - Orthographic framing kept viewport-height-relative across resizes: fiber's
 *   `<Canvas orthographic>` sizes `left/right/top/bottom` in raw PIXELS
 *   (`updateCamera` in
 *   reference/react-three-fiber/packages/fiber/src/core/utils/three.ts), so
 *   reproducing the original's "N world units of visible height regardless of window
 *   size" convention needs `camera.zoom` derived from `useThree(state => state.size)`
 *   and reset on every resize — a small effect, not a fiber built-in. The derivation
 *   (`zoom = size.height / (2 * FRUSTUM_HALF_HEIGHT)`) reproduces the original's
 *   `height`/`height * aspect` frustum exactly once combined with fiber's
 *   already-aspect-correct pixel bounds.
 * - Escape hatch: a point light attached to the camera via `camera.add()` in an effect
 *   (no declarative "light as camera child" pattern exists in R3F) — same pattern as
 *   `skinning-instancing`'s `CameraLight` / `morphtargets`' headlight
 *
 * DIVERGENCE from original
 * - The original's `renderer.inspector.createParameters` dat.gui-style panel (this repo
 *   doesn't wire the Inspector RootState slot, same gap noted in prior ports) is
 *   replaced with leva controls for the same seven parameters
 * - OrbitControls -> DemoHelpers' CameraControls. The original sets `enableZoom =
 *   false`; the CameraControls wrapper exposes no per-action wheel lock, and for
 *   orthographic cameras camera-controls maps the wheel to `ACTION.ZOOM`
 *   (`camera.zoom`, clamped by `minZoom`/`maxZoom`) rather than dolly distance — so
 *   wheel-zoom is left enabled here. The viewport-relative zoom-sync effect above
 *   additionally resets `camera.zoom` to the baseline on every window resize, which
 *   will clobber any manual zoom the user applied; a minor interaction nuance, not a
 *   visual one.
 * - The orbiting red point light's angular speed is delta-scaled (`ORBIT_SPEED` rad/s)
 *   rather than the original's fixed `r += 0.01` per rendered frame, so the orbit rate
 *   is frame-rate independent instead of tied to display refresh rate; tuned to match
 *   the original's apparent speed at a typical 60fps.
 * - DemoHelpers grid disabled (`grid={false}`) — the original scene is a single mesh
 *   floating in a colored-light void with no ground plane.
 */
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber/webgpu'
import { useCubeTexture, useTexture } from '@react-three/drei/webgpu'
import { folder, useControls } from 'leva'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { DoubleSide, PointLight } from 'three/webgpu'
import type { BufferGeometry, Mesh, OrthographicCamera } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const NINJA_PATH = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/obj/ninja/'
const NINJA_OBJ_URL = `${NINJA_PATH}ninjaHead_Low.obj`
const NORMAL_URL = `${NINJA_PATH}normal.png`
const AO_URL = `${NINJA_PATH}ao.jpg`
const DISPLACEMENT_URL = `${NINJA_PATH}displacement.jpg`

const CUBE_PATH = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/cube/SwedishRoyalCastle/'
const CUBE_FILES = ['px.jpg', 'nx.jpg', 'py.jpg', 'ny.jpg', 'pz.jpg', 'nz.jpg']

// Half-height (world units) of the orthographic frustum — the original's `height`
// variable. See header DEMONSTRATES for how this is turned into a resize-stable zoom.
const FRUSTUM_HALF_HEIGHT = 500

// rad/s for the orbiting red point light — delta-scaled replacement for the original's
// fixed `r += 0.01` per rendered frame, see header DIVERGENCE.
const ORBIT_SPEED = 0.6

// Keeps the orthographic frustum's visible height pinned to `2 * FRUSTUM_HALF_HEIGHT`
// world units regardless of viewport size — see header DEMONSTRATES.
function OrthographicFraming() {
  // useThree's `camera` types as the base Camera union even on an `orthographic`
  // Canvas — cast is safe here since this component only mounts under one (same
  // family as the RootState renderer union cast documented in AGENTS.md, B9).
  const camera = useThree((s) => s.camera) as OrthographicCamera
  const size = useThree((s) => s.size)

  useLayoutEffect(() => {
    camera.zoom = size.height / (2 * FRUSTUM_HALF_HEIGHT)
    camera.updateProjectionMatrix()
  }, [camera, size])

  return null
}

// Point light rigidly attached to the camera (a fill "headlight") — see header
// DEMONSTRATES.
function CameraLight() {
  const camera = useThree((s) => s.camera)
  const light = useMemo(() => new PointLight('#ff6666', 3, 0, 0), [])

  useEffect(() => {
    camera.add(light)
    return () => {
      camera.remove(light)
    }
  }, [camera, light])

  return null
}

interface OrbitingLightProps {
  lightRef: RefObject<PointLight | null>
}

// The scene's main light source, orbiting the mesh on the XZ plane — ported directly
// from the original's `render()`, delta-scaled (see header DIVERGENCE).
function OrbitingLight({ lightRef }: OrbitingLightProps) {
  useFrame((state) => {
    const light = lightRef.current
    if (!light) return
    const r = state.elapsed * ORBIT_SPEED
    light.position.x = 2500 * Math.cos(r)
    light.position.z = 2500 * Math.sin(r)
  })

  return <pointLight ref={lightRef} color="#ff0000" intensity={1.5} distance={0} decay={0} position={[0, 0, 2500]} />
}

interface NinjaHeadProps {
  metalness: number
  roughness: number
  aoMapIntensity: number
  envMapIntensity: number
  displacementScale: number
  normalScale: number
}

// The ninja head mesh: a plain `OBJLoader` geometry (no material/scene metadata, same
// loading shape as `lights-pointlights`' Walt head) driven by the four-map
// `MeshStandardNodeMaterial` described in the header DEMONSTRATES.
function NinjaHead({ metalness, roughness, aoMapIntensity, envMapIntensity, displacementScale, normalScale }: NinjaHeadProps) {
  const obj = useLoader(OBJLoader, NINJA_OBJ_URL)
  const { normalMap, aoMap, displacementMap } = useTexture({
    normalMap: NORMAL_URL,
    aoMap: AO_URL,
    displacementMap: DISPLACEMENT_URL,
  })
  const envMap = useCubeTexture(CUBE_FILES, { path: CUBE_PATH })

  // `.center()` mutates the loaded geometry in place; doing it in `useMemo` (render
  // phase, before the mesh's first paint) rather than an effect avoids the
  // "imperative mesh setup racing the first WebGPU render" pitfall documented in
  // AGENTS.md (morphtargets' `useLayoutEffect` rule) — this runs even earlier.
  const geometry = useMemo(() => {
    const geo = (obj.children[0] as Mesh).geometry as BufferGeometry
    geo.center()
    return geo
  }, [obj])

  return (
    <mesh geometry={geometry} scale={25}>
      <meshStandardNodeMaterial
        color="#c1c1c1"
        side={DoubleSide}
        metalness={metalness}
        roughness={roughness}
        normalMap={normalMap}
        normalScale={[normalScale, -normalScale]}
        aoMap={aoMap}
        aoMapIntensity={aoMapIntensity}
        displacementMap={displacementMap}
        displacementScale={displacementScale}
        displacementBias={-0.428408} // from the original model, not exposed as a control
        envMap={envMap}
        envMapIntensity={envMapIntensity}
      />
    </mesh>
  )
}

export default function MaterialsDisplacementmap() {
  const lightRef = useRef<PointLight>(null)

  const { metalness, roughness, aoMapIntensity, envMapIntensity, displacementScale, normalScale, ambientIntensity } =
    useControls('materials-displacementmap', {
      material: folder({
        metalness: { value: 1.0, min: 0, max: 1 },
        roughness: { value: 0.4, min: 0, max: 1 },
        aoMapIntensity: { value: 1.0, min: 0, max: 1 },
        envMapIntensity: { value: 1.0, min: 0, max: 3 },
        displacementScale: { value: 2.436143, min: 0, max: 3 },
        normalScale: { value: 1.0, min: -1, max: 1 },
      }),
      lighting: folder({
        ambientIntensity: { value: 0.2, min: 0, max: 1 },
      }),
    })

  return (
    <Canvas renderer orthographic camera={{ position: [0, 0, 1500], near: 1, far: 10000 }}>
      <OrthographicFraming />
      <ambientLight color="#ffffff" intensity={ambientIntensity} />
      <OrbitingLight lightRef={lightRef} />
      <CameraLight />
      <pointLight color="#0000ff" intensity={1.5} distance={0} decay={0} position={[-1000, 0, 1000]} />
      <Suspense fallback={null}>
        <NinjaHead
          metalness={metalness}
          roughness={roughness}
          aoMapIntensity={aoMapIntensity}
          envMapIntensity={envMapIntensity}
          displacementScale={displacementScale}
          normalScale={normalScale}
        />
      </Suspense>
      <DemoHelpers grid={false} />
    </Canvas>
  )
}

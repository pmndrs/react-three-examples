/**
 * lights-spotlight
 * R3F port of three.js `webgpu_lights_spotlight`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_lights_spotlight (~140 lines of JS)
 *
 * DEMONSTRATES
 * - `SpotLight.map`: projecting a texture through the light's cone — fiber sets it via
 *   the light's plain `map` property (no `attach`/texture-node plumbing needed);
 *   swappable at runtime via leva, including switching it back to `null`
 * - Shadow-tuning knobs unique to `SpotLight.shadow`: `focus` (blur falloff toward the
 *   cone edge) and `shadow.intensity` (opacity of the cast shadow) alongside the usual
 *   angle/penumbra/decay/distance cone-shape props (the latter four ARE fiber JSX
 *   props on `<spotLight>`; `focus`/`intensity` on `shadow` are not, so they're synced
 *   imperatively)
 * - `SpotLightHelper` + `CameraHelper` (three.js core helpers, not drei) attached as
 *   real scene-graph children of the light via an imperative effect — same pattern as
 *   `lights-rectarealight`'s `RectAreaLightHelper` — so both helpers inherit the
 *   light's orbiting transform for free. `CameraHelper` aliases `this.matrix` directly
 *   to `shadow.camera.matrixWorld` (verified in `reference/three.js/src/helpers/
 *   CameraHelper.js`), so only its frustum *shape* (angle/distance/focus) needs a
 *   manual `.update()` call — refreshed every frame here, see DIVERGENCE
 * - `PLYLoader` (three.js addon) via fiber's `useLoader`, for a non-glTF static mesh
 *   (the Stanford Lucy statue) — a geometry-only format with no material/scene data,
 *   needing `computeVertexNormals()` since the source file carries no normals
 *
 * DIVERGENCE from original
 * - OrbitControls -> this repo's CameraControls (via DemoHelpers), same target/min/max
 *   distance AND `maxPolarAngle={Math.PI / 2}` (keeps the camera above the floor —
 *   polar-limit props added to CameraControls after this port flagged the gap)
 * - `renderer.inspector`'s dat.gui-less GUI panel replaced by leva (`map`, `color`,
 *   `intensity`, `distance`, `angle`, `penumbra`, `decay`, `focus`, `shadowIntensity`,
 *   `helpers`) — the same parameters the original exposes, one-to-one
 * - Both helpers are refreshed every frame, not only on GUI change like the original
 *   (which never calls `shadowCameraHelper.update()` after construction, so its
 *   frustum lines silently go stale whenever angle/distance/focus change) — cheap
 *   (line-segment vertex math only) and keeps the frustum lines honest
 * - The loaded PLY geometry is cloned before `scale()`/`computeVertexNormals()` mutate
 *   it, instead of mutating the loader's cached instance in place — same rationale as
 *   `instance-mesh`'s Suzanne geometry (fiber's `useLoader` cache is shared, and this
 *   example's only re-render trigger is the leva panel, not model swapping — cloning
 *   costs nothing and avoids a class of the same bug categorically)
 * - DemoHelpers grid disabled (`grid={false}`) — the original's own 10x10 floor plane
 *   IS the shadow receiver this example is about; an infinite grid at y=0.002 would
 *   render through/under it, competing with the shadow for visual attention
 */
import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useLoader } from '@react-three/fiber/webgpu'
import { useTexture } from '@react-three/drei/webgpu'
import { folder, useControls } from 'leva'
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js'
import { CameraHelper, SpotLightHelper } from 'three/webgpu'
import type { SpotLight } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const TEXTURE_BASE = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/'
const LUCY_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/ply/binary/Lucy100k.ply'

const MAP_URLS = {
  disturb: `${TEXTURE_BASE}disturb.jpg`,
  colors: `${TEXTURE_BASE}colors.png`,
  uvgrid: `${TEXTURE_BASE}uv_grid_opengl.jpg`,
}
type MapKey = 'none' | keyof typeof MAP_URLS

// Stanford Lucy statue: a geometry-only PLY, no normals baked in — computeVertexNormals
// (post-scale, matching the original's call order) is required, not cosmetic.
function Lucy() {
  const raw = useLoader(PLYLoader, LUCY_URL)

  const geometry = useMemo(() => {
    const geo = raw.clone()
    geo.scale(0.0024, 0.0024, 0.0024)
    geo.computeVertexNormals()
    return geo
  }, [raw])

  return (
    <mesh geometry={geometry} rotation-y={-Math.PI / 2} position={[0, 0.8, 0]} castShadow receiveShadow>
      <meshLambertMaterial />
    </mesh>
  )
}

function Floor() {
  return (
    <mesh position={[0, -1, 0]} rotation-x={-Math.PI / 2} receiveShadow>
      <planeGeometry args={[10, 10]} />
      <meshLambertMaterial color="#bcbcbc" />
    </mesh>
  )
}

interface SpotlightRigProps {
  mapKey: MapKey
  color: string
  intensity: number
  distance: number
  angle: number
  penumbra: number
  decay: number
  focus: number
  shadowIntensity: number
  helpers: boolean
}

// The spotlight itself: orbits the statue at the original's fixed rate, projects a
// swappable texture through its cone, and carries two three.js-core helpers as real
// scene-graph children (see header DEMONSTRATES) toggled by the `helpers` leva flag.
function SpotlightRig({
  mapKey,
  color,
  intensity,
  distance,
  angle,
  penumbra,
  decay,
  focus,
  shadowIntensity,
  helpers,
}: SpotlightRigProps) {
  const lightRef = useRef<SpotLight>(null)
  const helperPairRef = useRef<{ spot: SpotLightHelper; shadowCam: CameraHelper } | null>(null)
  const textures = useTexture(MAP_URLS)

  // `shadow.focus`/`shadow.intensity` have no fiber dash-path prop (only shadow-camera-*
  // and shadow-mapSize-* do) — sync them imperatively, mirroring the original's GUI
  // `onChange` handlers.
  useEffect(() => {
    const light = lightRef.current
    if (!light) return
    light.shadow.focus = focus
    light.shadow.intensity = shadowIntensity
  }, [focus, shadowIntensity])

  // Texture projected through the cone; 'none' clears it back to null, same as the
  // original's `map` dropdown (which includes a `none` entry mapped to `null`).
  useEffect(() => {
    const light = lightRef.current
    if (!light) return
    light.map = mapKey === 'none' ? null : textures[mapKey]
  }, [mapKey, textures])

  // Mount once: attach both helpers as real children of the light (see header
  // DEMONSTRATES) so they inherit its orbiting transform for free, matching
  // lights-rectarealight's RectAreaLightHelper pattern.
  useEffect(() => {
    const light = lightRef.current
    if (!light) return

    const spot = new SpotLightHelper(light)
    const shadowCam = new CameraHelper(light.shadow.camera)
    light.add(spot)
    light.add(shadowCam)
    helperPairRef.current = { spot, shadowCam }

    return () => {
      light.remove(spot)
      light.remove(shadowCam)
      spot.dispose()
      helperPairRef.current = null
    }
  }, [])

  useEffect(() => {
    const pair = helperPairRef.current
    if (!pair) return
    pair.spot.visible = helpers
    pair.shadowCam.visible = helpers
  }, [helpers])

  useFrame((state) => {
    const light = lightRef.current
    if (!light) return
    // Original: `performance.now() / 3000`; `state.time` is the RAF-derived ms clock.
    const t = state.time / 3000
    light.position.x = Math.cos(t) * 2.5
    light.position.z = Math.sin(t) * 2.5

    const pair = helperPairRef.current
    pair?.spot.update()
    pair?.shadowCam.update()
  })

  return (
    <spotLight
      ref={lightRef}
      color={color}
      intensity={intensity}
      position={[2.5, 5, 2.5]}
      angle={angle}
      penumbra={penumbra}
      decay={decay}
      distance={distance}
      castShadow
      shadow-mapSize-width={1024}
      shadow-mapSize-height={1024}
      shadow-camera-near={2}
      shadow-camera-far={10}
    />
  )
}

export default function LightsSpotlight() {
  const { map, color, intensity, distance, angle, penumbra, decay, focus, shadowIntensity, helpers } = useControls(
    'lights-spotlight',
    {
      map: { value: 'disturb' as MapKey, options: ['none', 'disturb', 'colors', 'uvgrid'] as MapKey[] },
      light: folder({
        color: '#ffffff',
        intensity: { value: 100, min: 0, max: 500, step: 5 },
        distance: { value: 0, min: 0, max: 20, step: 0.5 },
        angle: { value: Math.PI / 6, min: 0, max: Math.PI / 3, step: 0.01 },
        penumbra: { value: 1, min: 0, max: 1, step: 0.01 },
        decay: { value: 2, min: 1, max: 2, step: 0.01 },
      }),
      shadow: folder({
        focus: { value: 1, min: 0, max: 1, step: 0.01 },
        shadowIntensity: { value: 1, min: 0, max: 1, step: 0.01 },
      }),
      helpers: false,
    },
  )

  return (
    <Canvas renderer shadows background="#000000" camera={{ position: [7, 4, 1], fov: 40, near: 0.1, far: 100 }}>
      <hemisphereLight color="#ffffff" groundColor="#8d8d8d" intensity={0.25} />
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes the displayed scene (AGENTS.md; corpus-wide repair, wave 8). */}
      <Suspense fallback={null}>
        <SpotlightRig
          mapKey={map as MapKey}
          color={color}
          intensity={intensity}
          distance={distance}
          angle={angle}
          penumbra={penumbra}
          decay={decay}
          focus={focus}
          shadowIntensity={shadowIntensity}
          helpers={helpers}
        />
        <Floor />
        <Lucy />
      </Suspense>
      <DemoHelpers
        grid={false}
        target={[0, 1, 0]}
        minDistance={2}
        maxDistance={10}
        maxPolarAngle={Math.PI / 2}
      />
    </Canvas>
  )
}

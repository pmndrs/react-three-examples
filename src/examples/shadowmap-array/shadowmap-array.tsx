/**
 * shadowmap-array
 * R3F port of three.js `webgpu_shadowmap_array`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_shadowmap_array (~330 lines of JS)
 *
 * DEMONSTRATES
 * - `TileShadowNode` (three/addons/tsl/shadows) splits ONE directional light's shadow
 *   into a grid of tiles (`tilesX` × `tilesY`), each rendered into its own layer of a
 *   shadow-map array texture at the light's full resolution — sharper contact shadows
 *   over a huge shadow-camera frustum than one giant map could give at the same memory
 *   cost. Wired imperatively: `light.shadow.shadowNode = new TileShadowNode(light,
 *   { tilesX, tilesY })`, same "three.js API as a visible escape hatch" pattern as
 *   `mesh-batch`'s `BatchedMesh`
 * - `TileShadowNodeHelper` — a debug overlay drawing each tile's depth-map thumbnail
 *   in the corner plus a `CameraHelper` wireframe per tile frustum; `.update()` must be
 *   called every frame (mirrors `CSMHelper` in the sibling `shadowmap-csm` port)
 * - `THREE.BatchedMesh` for the tree forest (trunk + top geometries, per-instance vertex
 *   colors) alongside plain `InstancedMesh` for columns/cubes/spheres/toruses — the
 *   scene mixes both instancing strategies on purpose, matching the original
 * - A procedural ground `colorNode` (`mx_fractal_noise_vec3` blending green/brown by
 *   world position) on `<meshPhongNodeMaterial>`, built once via `useMemo`
 *
 * DIVERGENCE from original
 * - `tilesX`/`tilesY` are LIVE leva controls (1–4, original hard-codes 2×2) — changing
 *   them tears down and rebuilds the `TileShadowNode`/`TileShadowNodeHelper` pair in an
 *   effect keyed on their values, showing the API is reconfigurable, not just a fixed
 *   demo constant.
 * - The original's unused `dirGroup` (a `Group` wrapping the light that nothing ever
 *   rotates) is dropped — `animate()` moves `dirLight.position` directly, the group
 *   does nothing observable.
 * - `scene.backgroundNode = color(0xCCCCFF)` becomes the Canvas `background` prop
 *   (same flat color, no need for a manual TSL color node); the fog is set declaratively
 *   (`<fog attach="fog">`), which three's WebGPU renderer auto-wraps into a fog node
 *   (AGENTS.md fog guidance — a custom TSL fog graph is the only case needing the
 *   imperative `scene.fogNode` route).
 * - `helperVisible` (default on, matching the original's always-visible helper) and a
 *   `speed` slider (scales both the light's orbit and the torus knot's spin, paused at
 *   0) are added leva controls; the original has neither.
 * - OrbitControls -> this repo's CameraControls (via DemoHelpers), same target/dolly/
 *   polar-angle clamps as the original.
 * - `renderer.inspector = new Inspector()` + its GUI dropped for leva, same gap noted
 *   across this corpus's other ports.
 */
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber/webgpu'
import { useControls } from 'leva'
import { Fn, mx_fractal_noise_vec3, positionWorld, color as tslColor } from 'three/tsl'
import { ACESFilmicToneMapping, MeshPhongNodeMaterial } from 'three/webgpu'
import type { DirectionalLight } from 'three/webgpu'
import { TileShadowNode } from 'three/addons/tsl/shadows/TileShadowNode.js'
import { TileShadowNodeHelper } from 'three/addons/tsl/shadows/TileShadowNodeHelper.js'
import { DemoHelpers } from '../../utils/DemoHelpers'
import { Scenery, TorusKnotCentral } from './Scenery'

interface TiledSunProps {
  tilesX: number
  tilesY: number
  helperVisible: boolean
  speed: number
}

// The sole shadow-casting light: a directional "sun" orbiting the origin, its shadow
// split into a tilesX*tilesY grid via TileShadowNode. Rebuilding the node/helper pair
// is cheap (a handful of render targets + cameras, not a multi-second bake) so it's
// safe to redo on every tilesX/tilesY change, not gated behind a commit button.
function TiledSun({ tilesX, tilesY, helperVisible, speed }: TiledSunProps) {
  const lightRef = useRef<DirectionalLight>(null)
  const helperRef = useRef<TileShadowNodeHelper | null>(null)
  const { scene } = useThree()
  const clockRef = useRef(0)
  // TileShadowNode only populates its internal shadow nodes during the light's FIRST
  // shadow-pass render; calling helper.update() any earlier logs a one-time "not ready"
  // console.error (TileShadowNodeHelper.init() guard). useFrame runs before the render
  // phase, so skip exactly one frame after every (re)build to let that render happen.
  const skipNextRef = useRef(true)

  useLayoutEffect(() => {
    const light = lightRef.current
    if (!light) return

    const tileShadowNode = new TileShadowNode(light, { tilesX, tilesY })
    light.shadow.shadowNode = tileShadowNode

    const helper = new TileShadowNodeHelper(tileShadowNode)
    helper.visible = helperVisible
    scene.add(helper)
    helperRef.current = helper
    skipNextRef.current = true

    return () => {
      scene.remove(helper)
      light.shadow.shadowNode = undefined
      helperRef.current = null
    }
    // helperVisible intentionally excluded — applied live below without a full rebuild.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, tilesX, tilesY])

  useEffect(() => {
    if (helperRef.current) helperRef.current.visible = helperVisible
  }, [helperVisible])

  useFrame((_, delta) => {
    const light = lightRef.current
    if (!light) return
    clockRef.current += delta * speed // original rate: sin(time_ms * 0.0001) = 0.1 rad/s
    const t = clockRef.current
    light.position.x = Math.sin(t) * 30
    light.position.z = Math.cos(t) * 30

    if (skipNextRef.current) {
      skipNextRef.current = false
    } else {
      helperRef.current?.update()
    }
  })

  return (
    <directionalLight
      ref={lightRef}
      color="#ffffaa"
      intensity={5}
      position={[0, 80, 30]}
      castShadow
      shadow-camera-near={1}
      shadow-camera-far={200}
      shadow-camera-left={-180}
      shadow-camera-right={180}
      shadow-camera-top={180}
      shadow-camera-bottom={-160}
      shadow-mapSize-width={4096}
      shadow-mapSize-height={4096}
      shadow-radius={1}
    />
  )
}

// Procedural green/brown ground, ported from the original's colorNode Fn — noise.x
// picks the mix factor via the fluent `.mix` (calling node = factor, AGENTS.md).
function Ground() {
  const material = useMemo(() => {
    const m = new MeshPhongNodeMaterial({ color: '#88aa44', shininess: 5, specular: '#222222' })
    m.colorNode = Fn(() => {
      const noise = mx_fractal_noise_vec3(positionWorld.mul(0.05)).saturate()
      const green = tslColor(0.4, 0.7, 0.3)
      const brown = tslColor(0.6, 0.5, 0.3)
      return noise.x.mix(green, brown)
    })()
    return m
  }, [])

  return (
    <mesh rotation-x={-Math.PI / 2} receiveShadow>
      <planeGeometry args={[1500, 1500, 2, 2]} />
      <primitive object={material} attach="material" />
    </mesh>
  )
}

export default function ShadowmapArray() {
  const { tilesX, tilesY, helperVisible, speed } = useControls('shadowmap-array', {
    tilesX: { value: 2, min: 1, max: 4, step: 1 },
    tilesY: { value: 2, min: 1, max: 4, step: 1 },
    helperVisible: { value: true, label: 'show tile helper' },
    speed: { value: 1, min: 0, max: 3, step: 0.05 },
  })

  return (
    <Canvas
      renderer={{ toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1.2 }}
      shadows="basic"
      background="#ccccff"
      camera={{ position: [45, 60, 100], fov: 45, near: 1, far: 1000 }}
    >
      <fog attach="fog" args={['#ccccff', 700, 1000]} />
      <ambientLight color="#ccccff" intensity={3} />
      <TiledSun tilesX={tilesX} tilesY={tilesY} helperVisible={helperVisible} speed={speed} />
      <Ground />
      <Scenery />
      <TorusKnotCentral speed={speed} />
      <DemoHelpers
        grid={false}
        target={[0, 5, 0]}
        minDistance={0.01}
        maxDistance={400}
        maxPolarAngle={Math.PI / 2 - 0.1}
      />
    </Canvas>
  )
}


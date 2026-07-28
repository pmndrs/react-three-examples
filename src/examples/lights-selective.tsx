/**
 * lights-selective
 * R3F port of three.js `webgpu_lights_selective`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_lights_selective (~140 lines of JS)
 *
 * DEMONSTRATES
 * - `material.lightsNode = lights([light1])`: TSL's `lights()` function builds a
 *   `LightsNode` scoped to an explicit subset of scene lights — the left teapot only
 *   ever sees `light1` (red), the right teapot only `light2` (blue), while the center
 *   teapot has no override and falls back to the default graph (every light in the
 *   scene), all three sharing the same four orbiting `PointLight`s
 * - `MeshStandardNodeMaterial.roughnessNode` / `.metalnessNode` / `.normalNode` fed by
 *   `texture()` / `normalMap(texture())` TSL nodes — swapping a scalar/color material
 *   channel for a texture-driven node is a direct property assignment, no shader
 *   boilerplate
 * - Scene-level TSL fog (`fog(color(...), rangeFogFactor(near, far))` on
 *   `scene.fogNode`), same pattern as `sprites`
 *
 * DIVERGENCE from original
 * - Each orbiting light carries a small unlit `meshBasicMaterial` sphere as its own
 *   visible marker (same pattern as `lights-pointlights`) instead of the original's
 *   `MeshStandardNodeMaterial` + `material.lights = false` trick (a duck-typed
 *   material flag with no fiber/TS surface) — an unlit basic material reaches the same
 *   "ignores all lighting" result through a typed, idiomatic path
 * - Center teapot's `roughness`/`metalness` are leva controls (the original's own GUI
 *   exposes exactly these two); light colors and an orbit-speed multiplier are
 *   additional leva controls the original hard-codes
 * - `renderer={{ toneMapping: NoToneMapping }}` set explicitly — the original never
 *   configures tone mapping, which defaults to `NoToneMapping` on `WebGPURenderer`
 *   (fiber's `Canvas` otherwise defaults to ACESFilmic; see AGENTS.md tone-mapping trap)
 * - OrbitControls -> this repo's CameraControls (via DemoHelpers); DemoHelpers grid
 *   disabled (`grid={false}`) — the original scene is a fogged void with no floor
 * - `scene.fogNode` is set through a cast — `@types/three`'s `Scene` interface doesn't
 *   declare `fogNode` (same duck-typed field as `sprites`, see its header note)
 */
import { Suspense, useEffect, useMemo, useRef, type RefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber/webgpu'
import { useTexture } from '@react-three/drei/webgpu'
import { folder, useControls } from 'leva'
import { color, fog, lights, normalMap, rangeFogFactor, texture } from 'three/tsl'
import { MeshStandardNodeMaterial, NoToneMapping, RepeatWrapping, SphereGeometry } from 'three/webgpu'
import type { Node, PointLight, Texture } from 'three/webgpu'
import { TeapotGeometry } from 'three/addons/geometries/TeapotGeometry.js'
import { DemoHelpers } from '../utils/DemoHelpers'

const TEXTURE_BASE = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/'
const NORMAL_URL = `${TEXTURE_BASE}water/Water_1_M_Normal.jpg`
const ROUGHNESS_URL = `${TEXTURE_BASE}roughness_map.jpg`

// Shared marker-sphere geometry (radius 0.1, matches the original) — constant asset,
// module-scope THREE instance is fine (not mutable state; same rationale as
// lights-pointlights' own markerGeometry).
const markerGeometry = new SphereGeometry(0.1, 16, 8)

// Scene-level TSL fog. Cast: `@types/three`'s `Scene` doesn't declare `fogNode` — see
// header DIVERGENCE (same pattern as `sprites`).
function SceneFog() {
  const scene = useThree((s) => s.scene)

  useEffect(() => {
    const fogged = scene as unknown as { fogNode: Node | null }
    fogged.fogNode = fog(color('#ff00ff'), rangeFogFactor(12, 30))
    return () => {
      fogged.fogNode = null
    }
  }, [scene])

  return null
}

interface OrbitingLightProps {
  id: 1 | 2 | 3 | 4
  lightRef: RefObject<PointLight | null>
  color: string
  speed: number
}

// One of the four orbiting point lights, each following its own fixed elliptical path
// (ported directly from the original's `animate()`) and carrying a matching-colored
// unlit sphere as its own visible marker.
function OrbitingLight({ id, lightRef, color, speed }: OrbitingLightProps) {
  useFrame((state) => {
    const light = lightRef.current
    if (!light) return
    const t = state.elapsed * 0.5 * speed
    switch (id) {
      case 1:
        light.position.set(Math.sin(t * 0.7) * 3, Math.cos(t * 0.5) * 4, Math.cos(t * 0.3) * 3)
        break
      case 2:
        light.position.set(Math.cos(t * 0.3) * 3, Math.sin(t * 0.5) * 4, Math.sin(t * 0.7) * 3)
        break
      case 3:
        light.position.set(Math.sin(t * 0.7) * 3, Math.cos(t * 0.3) * 4, Math.sin(t * 0.5) * 3)
        break
      case 4:
        light.position.set(Math.sin(t * 0.3) * 3, Math.cos(t * 0.7) * 4, Math.sin(t * 0.5) * 3)
        break
    }
  })

  return (
    <pointLight ref={lightRef} color={color} power={1700} distance={100}>
      <mesh geometry={markerGeometry}>
        <meshBasicMaterial color={color} />
      </mesh>
    </pointLight>
  )
}

interface TeapotsProps {
  light1Ref: RefObject<PointLight | null>
  light2Ref: RefObject<PointLight | null>
  roughness: number
  metalness: number
}

// Three teapots sharing one geometry, each demonstrating a different selective-lighting
// / node-material-channel combination — see header DEMONSTRATES.
function Teapots({ light1Ref, light2Ref, roughness, metalness }: TeapotsProps) {
  const geometry = useMemo(() => new TeapotGeometry(0.8, 18), [])
  const { normalMap: normalTexture, roughnessMap: roughnessTexture } = useTexture({
    normalMap: NORMAL_URL,
    roughnessMap: ROUGHNESS_URL,
  })

  useEffect(() => {
    normalTexture.wrapS = normalTexture.wrapT = RepeatWrapping
    roughnessTexture.wrapS = roughnessTexture.wrapT = RepeatWrapping
  }, [normalTexture, roughnessTexture])

  // Both lights mount as siblings outside this Suspense boundary (see the page
  // component below), so their refs are already populated by the time the textures
  // resolve and this runs — same reasoning as lights-pointlights' WaltHead material.
  const leftMaterial = useMemo(() => {
    const light1 = light1Ref.current
    if (!light1) return null
    const material = new MeshStandardNodeMaterial({ color: 0x555555 })
    material.lightsNode = lights([light1])
    material.roughnessNode = texture(roughnessTexture as Texture)
    material.metalness = 0
    return material
  }, [light1Ref, roughnessTexture])

  const rightMaterial = useMemo(() => {
    const light2 = light2Ref.current
    if (!light2) return null
    const material = new MeshStandardNodeMaterial({ color: 0x555555 })
    material.lightsNode = lights([light2])
    material.metalnessNode = texture(roughnessTexture as Texture)
    return material
  }, [light2Ref, roughnessTexture])

  const centerMaterial = useMemo(() => {
    const material = new MeshStandardNodeMaterial({ color: 0x555555 })
    material.normalNode = normalMap(texture(normalTexture as Texture))
    return material
  }, [normalTexture])

  useEffect(() => {
    centerMaterial.roughness = roughness
    centerMaterial.metalness = metalness
  }, [centerMaterial, roughness, metalness])

  if (!leftMaterial || !rightMaterial) return null

  return (
    <>
      <mesh geometry={geometry} material={leftMaterial} position={[-3, -1, 0]} rotation-y={-Math.PI / 2} />
      <mesh geometry={geometry} material={centerMaterial} position={[0, -1, 0]} rotation-y={-Math.PI / 2} />
      <mesh geometry={geometry} material={rightMaterial} position={[3, -1, 0]} rotation-y={-Math.PI / 2} />
    </>
  )
}

export default function LightsSelective() {
  const light1Ref = useRef<PointLight>(null)
  const light2Ref = useRef<PointLight>(null)
  const light3Ref = useRef<PointLight>(null)
  const light4Ref = useRef<PointLight>(null)

  const { speed, light1Color, light2Color, light3Color, light4Color, roughness, metalness } = useControls(
    'lights-selective',
    {
      speed: { value: 1, min: 0, max: 3, step: 0.05 },
      light1: folder({ light1Color: { value: '#ff0040', label: 'color' } }),
      light2: folder({ light2Color: { value: '#0040ff', label: 'color' } }),
      light3: folder({ light3Color: { value: '#80ff80', label: 'color' } }),
      light4: folder({ light4Color: { value: '#ffaa00', label: 'color' } }),
      center: folder({
        roughness: { value: 0.5, min: 0, max: 1, step: 0.01 },
        metalness: { value: 0.5, min: 0, max: 1, step: 0.01 },
      }),
    },
  )

  return (
    <Canvas
      renderer={{ toneMapping: NoToneMapping }}
      background="#000000"
      camera={{ position: [0, 0, 7], fov: 50, near: 0.01, far: 100 }}
    >
      <OrbitingLight id={1} lightRef={light1Ref} color={light1Color} speed={speed} />
      <OrbitingLight id={2} lightRef={light2Ref} color={light2Color} speed={speed} />
      <OrbitingLight id={3} lightRef={light3Ref} color={light3Color} speed={speed} />
      <OrbitingLight id={4} lightRef={light4Ref} color={light4Color} speed={speed} />
      <SceneFog />
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes the displayed scene (AGENTS.md; corpus-wide repair, wave 8). */}
      <Suspense fallback={null}>
        <Teapots light1Ref={light1Ref} light2Ref={light2Ref} roughness={roughness} metalness={metalness} />
      </Suspense>
      <DemoHelpers grid={false} minDistance={3} maxDistance={25} />
    </Canvas>
  )
}

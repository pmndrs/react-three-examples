/**
 * lights-phong
 * R3F port of three.js `webgpu_lights_phong`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_lights_phong (~150 lines of JS)
 *
 * DEMONSTRATES
 * - Selective lighting: `material.lightsNode = lights([someLight])` restricts a
 *   `MeshPhongNodeMaterial`'s shading to a chosen SUBSET of the scene's lights,
 *   independent of what else is in the scene — the left and right teapots each react
 *   to exactly one orbiting `PointLight`, while the center teapot (no `lightsNode`
 *   override) falls back to the builder's default and reacts to all four. A leva
 *   dropdown lets you re-point which light drives the left/right teapot at runtime.
 * - Three independent Phong node overrides on the same node material: a texture-driven
 *   `specularNode` (left teapot), tangent-space `normalNode = normalMap(texture(...))`
 *   (center teapot), and a procedural checkerboard-driven `specularNode =
 *   mix(color, color, checker(uv().mul(n)))` (right teapot) — plus plain `shininess`
 *   (an ordinary numeric property, not a node, inherited from `MeshPhongMaterial`)
 * - Scene-level TSL fog: `scene.fogNode = fog(color(...), rangeFogFactor(near, far))`
 * - `PointLight.power` (physically-based intensity) driving four orbiting lights that
 *   double as their own visible markers — a `mesh` mounted as a real scene-graph child
 *   of the light via `<primitive object={light}><mesh .../></primitive>`, the same
 *   "child inherits the light's transform for free" pattern as `lights-pointlights` /
 *   `lights-rectarealight` / `lights-spotlight`
 *
 * DIVERGENCE from original
 * - Light markers use a plain `meshBasicMaterial` instead of the original's
 *   `MeshPhongNodeMaterial` with `colorNode = color(hex)` and `lights = false` —
 *   functionally identical (an unlit colored sphere), simpler to express
 * - leva: fog color/near/far, center/right teapot `shininess`, and a dropdown per
 *   side teapot selecting WHICH of the four orbiting lights drives its `lightsNode`.
 *   The original hardcodes light1→left, light2→right with no UI; the dropdown exists
 *   to make the selective-lighting API's actual flexibility visible and pokeable
 * - `renderer.inspector = new Inspector()` dropped — this repo doesn't wire the
 *   Inspector RootState slot yet (same gap noted in `refraction` / `reflection` /
 *   `postprocessing-bloom-emissive`)
 * - OrbitControls -> this repo's CameraControls (via DemoHelpers), same min/max dolly
 *   distance (3/25) as the original. DemoHelpers grid disabled (`grid={false}`) — the
 *   original scene is a fogged void with no floor; an infinite ground grid would be
 *   pure invention
 * - `scene.fogNode` is set through a cast — `@types/three`'s `Scene` interface doesn't
 *   declare `fogNode` even though the WebGPU renderer's `NodeManager` reads it directly
 *   off the live scene instance (same documented gap as `sprites.tsx`, AGENTS.md B11)
 */
import { Suspense, useEffect, useMemo } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber/webgpu'
import { useTexture } from '@react-three/drei/webgpu'
import { folder, useControls } from 'leva'
import { TeapotGeometry } from 'three/addons/geometries/TeapotGeometry.js'
import { checker, color, fog, lights, normalMap, mix, rangeFogFactor, texture, uv } from 'three/tsl'
import { MeshPhongNodeMaterial, PointLight, RepeatWrapping, SphereGeometry } from 'three/webgpu'
import type { Node } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const TEXTURE_BASE = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/'
const NORMAL_MAP_URL = `${TEXTURE_BASE}water/Water_1_M_Normal.jpg`
const ROUGHNESS_MAP_URL = `${TEXTURE_BASE}roughness_map.jpg`

// Shared static assets — constants, not mutable state, so module-scope THREE instances
// are the idiomatic call here (same rationale as lights-pointlights' markerGeometry).
const teapotGeometry = new TeapotGeometry(0.8, 18)
const markerGeometry = new SphereGeometry(0.1, 16, 8)

const LIGHT_DEFS = [
  { key: 'light1', hex: 0x0040ff, label: 'Blue' },
  { key: 'light2', hex: 0xffffff, label: 'White' },
  { key: 'light3', hex: 0x80ff80, label: 'Green' },
  { key: 'light4', hex: 0xffaa00, label: 'Orange' },
] as const
type LightKey = (typeof LIGHT_DEFS)[number]['key']
const LIGHT_OPTIONS = Object.fromEntries(LIGHT_DEFS.map(({ key, label }) => [label, key])) as Record<string, LightKey>

function createPointLight(hexColor: number, power = 1700, distance = 100) {
  const light = new PointLight(hexColor, 1, distance)
  light.power = power
  return light
}

// Scene-level TSL fog. Cast: `@types/three`'s `Scene` doesn't declare `fogNode` — see
// header DIVERGENCE.
function SceneFog({ fogColor, near, far }: { fogColor: string; near: number; far: number }) {
  const scene = useThree((s) => s.scene)

  useEffect(() => {
    const fogged = scene as unknown as { fogNode: Node | null }
    fogged.fogNode = fog(color(fogColor), rangeFogFactor(near, far))
    return () => {
      fogged.fogNode = null
    }
  }, [scene, fogColor, near, far])

  return null
}

interface TeapotsProps {
  leftLightKey: LightKey
  rightLightKey: LightKey
  centerShininess: number
  rightShininess: number
}

// The four orbiting lights (each doubling as its own visible marker) and the three
// Phong teapots they illuminate — see header DEMONSTRATES.
function Teapots({ leftLightKey, rightLightKey, centerShininess, rightShininess }: TeapotsProps) {
  const { waterNormal, roughness } = useTexture({
    waterNormal: NORMAL_MAP_URL,
    roughness: ROUGHNESS_MAP_URL,
  })

  useEffect(() => {
    waterNormal.wrapS = waterNormal.wrapT = RepeatWrapping
    roughness.wrapS = roughness.wrapT = RepeatWrapping
  }, [waterNormal, roughness])

  // Created once and mutated directly in useFrame below — plain THREE objects, not
  // React state, so no ref-timing race with the materials that reference them.
  const pointLights = useMemo(
    () =>
      Object.fromEntries(LIGHT_DEFS.map(({ key, hex }) => [key, createPointLight(hex)])) as Record<
        LightKey,
        PointLight
      >,
    [],
  )

  useFrame((state) => {
    const lightTime = state.elapsed * 0.5

    pointLights.light1.position.set(
      Math.sin(lightTime * 0.7) * 3,
      Math.cos(lightTime * 0.5) * 4,
      Math.cos(lightTime * 0.3) * 3,
    )
    pointLights.light2.position.set(
      Math.cos(lightTime * 0.3) * 3,
      Math.sin(lightTime * 0.5) * 4,
      Math.sin(lightTime * 0.7) * 3,
    )
    pointLights.light3.position.set(
      Math.sin(lightTime * 0.7) * 3,
      Math.cos(lightTime * 0.3) * 4,
      Math.sin(lightTime * 0.5) * 3,
    )
    pointLights.light4.position.set(
      Math.sin(lightTime * 0.3) * 3,
      Math.cos(lightTime * 0.7) * 4,
      Math.sin(lightTime * 0.5) * 3,
    )
  })

  const leftLight = pointLights[leftLightKey]
  const rightLight = pointLights[rightLightKey]

  const teapotLeft = useMemo(() => {
    const material = new MeshPhongNodeMaterial({ color: 0x555555 })
    material.lightsNode = lights([leftLight])
    material.specularNode = texture(roughness)
    return material
  }, [leftLight, roughness])

  const teapotCenter = useMemo(() => {
    const material = new MeshPhongNodeMaterial({ color: 0x555555 })
    material.normalNode = normalMap(texture(waterNormal))
    material.shininess = centerShininess
    return material
  }, [waterNormal, centerShininess])

  const teapotRight = useMemo(() => {
    const material = new MeshPhongNodeMaterial({ color: 0x555555 })
    material.lightsNode = lights([rightLight])
    material.specularNode = mix(color(0x0000ff), color(0xff0000), checker(uv().mul(5)))
    material.shininess = rightShininess
    return material
  }, [rightLight, rightShininess])

  return (
    <>
      {LIGHT_DEFS.map(({ key, hex }) => (
        <primitive key={key} object={pointLights[key]}>
          <mesh geometry={markerGeometry}>
            <meshBasicMaterial color={hex} />
          </mesh>
        </primitive>
      ))}

      <mesh geometry={teapotGeometry} material={teapotLeft} rotation-y={-Math.PI * 0.5} position={[-3, -1, 0]} />
      <mesh geometry={teapotGeometry} material={teapotCenter} rotation-y={-Math.PI * 0.5} position={[0, -1, 0]} />
      <mesh geometry={teapotGeometry} material={teapotRight} rotation-y={-Math.PI * 0.5} position={[3, -1, 0]} />
    </>
  )
}

export default function LightsPhong() {
  const { fogColor, fogNear, fogFar, leftLightKey, rightLightKey, centerShininess, rightShininess } = useControls(
    'lights-phong',
    {
      fog: folder({
        fogColor: { value: '#ff00ff', label: 'color' },
        fogNear: { value: 12, min: 1, max: 25, step: 0.5, label: 'near' },
        fogFar: { value: 30, min: 15, max: 60, step: 0.5, label: 'far' },
      }),
      leftTeapot: folder({
        leftLightKey: { value: 'light1' as LightKey, options: LIGHT_OPTIONS, label: 'lit by' },
      }),
      centerTeapot: folder({
        centerShininess: { value: 80, min: 1, max: 200, step: 1, label: 'shininess' },
      }),
      rightTeapot: folder({
        rightLightKey: { value: 'light2' as LightKey, options: LIGHT_OPTIONS, label: 'lit by' },
        rightShininess: { value: 90, min: 1, max: 200, step: 1, label: 'shininess' },
      }),
    },
  )

  return (
    <Canvas renderer background="#000000" camera={{ position: [0, 0, 7], fov: 50, near: 0.01, far: 100 }}>
      <SceneFog fogColor={fogColor} near={fogNear} far={fogFar} />
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes the displayed scene (AGENTS.md; corpus-wide repair, wave 8). */}
      <Suspense fallback={null}>
        <Teapots
          leftLightKey={leftLightKey as LightKey}
          rightLightKey={rightLightKey as LightKey}
          centerShininess={centerShininess}
          rightShininess={rightShininess}
        />
      </Suspense>
      <DemoHelpers grid={false} minDistance={3} maxDistance={25} />
    </Canvas>
  )
}

/**
 * shadowmap-pointlight
 * R3F port of three.js `webgpu_shadowmap_pointlight`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_shadowmap_pointlight (~150 lines of JS)
 *
 * DEMONSTRATES
 * - Omnidirectional (cube) shadow maps from two orbiting `PointLight`s inside a
 *   `BackSide` box room — every wall receives shadows from every direction at once,
 *   configured entirely via fiber dash-path props (`shadow-bias`, `shadow-radius`,
 *   `shadow-mapSize-*`) on `<pointLight castShadow>`
 * - A shadow-casting shell as a real scene-graph CHILD of its own light
 *   (`<pointLight><mesh castShadow>`): a perforated sphere (2x2 `CanvasTexture` stripe
 *   `alphaMap` + `alphaTest`) wrapped around the emitter, so the light rays out through
 *   the cutouts and the rotating shell sweeps striped shadows across the room — the
 *   same alpha-test path cuts the SHADOW silhouette too, since the shadow pass shares
 *   the material's alpha test
 * - `shadows` (boolean) on `<Canvas>` = PCF shadow mapping, the same default the
 *   original's WebGPURenderer uses — which is what keeps `shadow.radius` (a PCF blur
 *   knob) live and worth exposing as a control
 * - Imperative per-frame light choreography in `useFrame` (Lissajous orbit + shell
 *   rotation), each light on its own accumulated clock so a speed control scales both
 *   without time jumps
 *
 * DIVERGENCE from original
 * - The original has no GUI; leva panel added (light colors, intensity, orbit speed,
 *   shadow bias/radius) — same rationale as this corpus's other zero-GUI ports
 *   (sky, shadowmap). Bias/radius apply live: three's WebGPU ShadowNode reads them
 *   as reference nodes, no rebuild needed
 * - Both lights share ONE stripe `CanvasTexture` and one set of sphere geometries;
 *   the original builds identical copies per light inside `createLight()`
 * - Speed control accumulates `delta * speed` per light instead of the original's
 *   absolute `performance.now()` clock (light 2 keeps its +10000s phase offset)
 * - The light-marker sphere's over-driven color (`color * intensity`, the original's
 *   hard-coded `multiplyScalar(200)`) now tracks the leva intensity, so dimming a
 *   light dims its visible bulb too
 * - `renderer={{ toneMapping: NoToneMapping }}` — deliberate: the original renders
 *   with the WebGPURenderer default (NoToneMapping); fiber's ACESFilmic default would
 *   visibly mute the over-driven bulb markers and the walls' lit hot-spots
 * - OrbitControls -> this repo's CameraControls (via DemoHelpers); grid disabled
 *   (`grid={false}`) — the room's own floor (y = -5) is a shadow receiver and an
 *   infinite grid would float 5 units above it, mid-room
 */
import { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber/webgpu'
import { folder, useControls } from 'leva'
import {
  BackSide,
  CanvasTexture,
  Color,
  DoubleSide,
  NearestFilter,
  NoToneMapping,
  RepeatWrapping,
  SphereGeometry,
} from 'three/webgpu'
import type { PointLight } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

// Constant shared assets (not mutable state — same module-scope rationale as
// lights-pointlights' markerGeometry). The original rebuilds all three per light.
const bulbGeometry = new SphereGeometry(0.3, 12, 6)
const shellGeometry = new SphereGeometry(2, 32, 8)

// Ported from the original's `generateTexture()`: a 2x2 canvas, bottom row white,
// top row transparent — tiled 4.5x vertically it becomes the shell's stripe cutouts.
function createStripeTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 2
  canvas.height = 2
  const context = canvas.getContext('2d')!
  context.fillStyle = 'white'
  context.fillRect(0, 1, 2, 1)

  const texture = new CanvasTexture(canvas)
  texture.magFilter = NearestFilter
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.repeat.set(1, 4.5)
  return texture
}
const stripeTexture = createStripeTexture()

interface ShadowLightProps {
  color: string
  intensity: number
  speed: number
  bias: number
  radius: number
  /** Phase offset in seconds — the original runs light 2 at `time + 10000`. */
  offset?: number
}

// One orbiting point light: cube-shadow caster + over-driven bulb marker + the
// perforated stripe shell that carves the raying shadows (see header DEMONSTRATES).
function ShadowLight({ color, intensity, speed, bias, radius, offset = 0 }: ShadowLightProps) {
  const lightRef = useRef<PointLight>(null)
  const clockRef = useRef(offset)

  // Original: `material.color.multiplyScalar(intensity)` — an unlit sphere driven far
  // past 1.0 so it reads as the glowing bulb under NoToneMapping.
  const bulbColor = useMemo(() => new Color(color).multiplyScalar(intensity), [color, intensity])

  useFrame((_, delta) => {
    const light = lightRef.current
    if (!light) return
    clockRef.current += delta * speed
    const t = clockRef.current

    // Lissajous orbit + shell spin, ported verbatim from the original's animate().
    light.position.set(Math.sin(t * 0.6) * 9, Math.sin(t * 0.7) * 9 + 6, Math.sin(t * 0.8) * 9)
    light.rotation.x = t
    light.rotation.z = t
  })

  return (
    <pointLight
      ref={lightRef}
      color={color}
      intensity={intensity}
      distance={20}
      castShadow
      // Original comment: negative bias reduces self-shadowing on double-sided objects.
      shadow-bias={bias}
      shadow-radius={radius}
      shadow-mapSize-width={128}
      shadow-mapSize-height={128}
    >
      <mesh geometry={bulbGeometry}>
        <meshBasicMaterial color={bulbColor} />
      </mesh>
      <mesh geometry={shellGeometry} castShadow receiveShadow>
        <meshPhongNodeMaterial side={DoubleSide} alphaMap={stripeTexture} alphaTest={0.5} />
      </mesh>
    </pointLight>
  )
}

// The 30x30x30 BackSide box everything happens inside — its inner faces are the
// shadow receivers this example is about.
function Room() {
  return (
    <mesh position={[0, 10, 0]} receiveShadow>
      <boxGeometry args={[30, 30, 30]} />
      <meshPhongNodeMaterial color="#a0adaf" shininess={10} specular="#111111" side={BackSide} />
    </mesh>
  )
}

export default function ShadowmapPointlight() {
  const { speed, intensity, light1Color, light2Color, bias, radius } = useControls('shadowmap-pointlight', {
    speed: { value: 1, min: 0, max: 3, step: 0.05 },
    intensity: { value: 200, min: 0, max: 600, step: 10 },
    light1Color: { value: '#0088ff', label: 'light 1' },
    light2Color: { value: '#ff8888', label: 'light 2' },
    shadow: folder({
      bias: { value: -0.005, min: -0.02, max: 0.02, step: 0.0005 },
      radius: { value: 10, min: 0, max: 25, step: 0.5 },
    }),
  })

  return (
    <Canvas
      // Deliberate NoToneMapping — see header DIVERGENCE.
      renderer={{ toneMapping: NoToneMapping }}
      shadows
      background="#000000"
      camera={{ position: [0, 10, 40], fov: 45, near: 1, far: 1000 }}
    >
      <ambientLight color="#111122" intensity={3} />
      <ShadowLight color={light1Color} intensity={intensity} speed={speed} bias={bias} radius={radius} />
      <ShadowLight color={light2Color} intensity={intensity} speed={speed} bias={bias} radius={radius} offset={10000} />
      <Room />
      <DemoHelpers grid={false} target={[0, 10, 0]} minDistance={5} maxDistance={120} />
    </Canvas>
  )
}

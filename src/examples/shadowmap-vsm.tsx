/**
 * shadowmap-vsm
 * R3F port of three.js `webgpu_shadowmap_vsm`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_shadowmap_vsm (~180 lines of JS)
 *
 * DEMONSTRATES
 * - Variance Shadow Maps via fiber's Canvas variant string: `shadows="variance"` maps
 *   to `THREE.VSMShadowMap` (verified in fiber's renderer.tsx variant table) — no
 *   imperative `renderer.shadowMap.type` setup
 * - VSM's headline trade: deliberately TINY shadow maps (256² spot, 512² directional,
 *   kept from the original) still produce smooth penumbras, because VSM stores moments
 *   and blurs the map itself — `shadow.radius` sets the blur kernel size and
 *   `shadow.blurSamples` its quality, both live-tunable per light from leva
 * - `shadow-radius` / `shadow-blurSamples` as fiber dash-path props: the VSM blur
 *   re-runs every shadow update, so mutating these needs no `shadow.needsUpdate` or
 *   material rebuild — the props are plain live mutations (contrast lights-spotlight,
 *   where `shadow.focus`/`shadow.intensity` are synced imperatively; here the
 *   dash-path route works for every knob this example touches)
 * - The ground plane is `castShadow` AND `receiveShadow` — under VSM every receiver
 *   should also cast (the original does this on purpose): occluder depth variance is
 *   what suppresses light bleeding, and a receive-only ground brightens contact shadows
 * - Two shadow-casting lights with complementary tints (warm spot, cool directional)
 *   so the two overlapping penumbras stay visually attributable while tuning each
 *   light's radius/samples independently
 *
 * DIVERGENCE from original
 * - OrbitControls (target 0,2,0) becomes DemoHelpers' camera-controls wrapper with
 *   dolly limits; grid disabled — the original's own 600×600 phong ground IS the
 *   shadow receiver this example is about
 * - `renderer.inspector` GUI replaced by leva, same four knobs (per-light radius +
 *   samples); the `animate` checkbox becomes a `speed` slider (0 = paused) — direct
 *   value controls beat booleans that hide state (corpus rule), and it exposes the
 *   penumbra crawl at slow motion
 * - The directional light's z-bob accumulates its own phase from `delta * speed`
 *   instead of reading absolute time (original: `sin(time * 0.001)`) so speed changes
 *   and pauses don't teleport the light
 * - `THREE.Timer` dropped; `useFrame`'s `delta` drives all motion
 * - One JSX `meshPhongMaterial` per mesh instead of the original's shared material +
 *   `.clone()`d pillars (declarative simplicity; same constants)
 * - `renderer={{ toneMapping: NoToneMapping }}` — deliberate parity with the original,
 *   which runs the WebGPURenderer default (fiber's Canvas would otherwise default to
 *   ACESFilmic and mute the warm/cool light split; AGENTS.md v0.9 rule)
 */
import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber/webgpu'
import { folder, useControls } from 'leva'
import { NoToneMapping } from 'three/webgpu'
import type { DirectionalLight, Group, Mesh } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

function TorusKnot({ speed }: { speed: number }) {
  const meshRef = useRef<Mesh>(null)

  useFrame((_, delta) => {
    const mesh = meshRef.current
    if (!mesh) return
    mesh.rotation.x += 0.25 * speed * delta
    mesh.rotation.y += 0.5 * speed * delta
    mesh.rotation.z += 1 * speed * delta
  })

  return (
    <mesh ref={meshRef} position={[0, 3, 0]} scale={1 / 18} castShadow receiveShadow>
      <torusKnotGeometry args={[25, 8, 75, 20]} />
      <meshPhongMaterial color="#999999" shininess={0} specular="#222222" />
    </mesh>
  )
}

const PILLAR_POSITIONS: [number, number, number][] = [
  [8, 3.5, 8],
  [8, 3.5, -8],
  [-8, 3.5, 8],
  [-8, 3.5, -8],
]

function Pillars() {
  return PILLAR_POSITIONS.map((position) => (
    <mesh key={position.join(',')} position={position} castShadow receiveShadow>
      <cylinderGeometry args={[0.75, 0.75, 7, 32]} />
      <meshPhongMaterial color="#999999" shininess={0} specular="#222222" />
    </mesh>
  ))
}

// castShadow on the ground is load-bearing under VSM, not a copy/paste artifact — see
// header DEMONSTRATES (light-bleed suppression needs receivers in the variance maps).
function Ground() {
  return (
    <mesh rotation-x={-Math.PI / 2} scale={3} castShadow receiveShadow>
      <planeGeometry args={[200, 200]} />
      <meshPhongMaterial color="#999999" shininess={0} specular="#111111" />
    </mesh>
  )
}

interface LightsProps {
  spotRadius: number
  spotSamples: number
  dirRadius: number
  dirSamples: number
  speed: number
}

// Warm spot + cool directional, both VSM casters with the original's deliberately tiny
// map sizes (256 / 512). The directional light orbits inside a group and bobs along z;
// the bob phase is accumulated from delta so the speed slider never teleports it.
function Lights({ spotRadius, spotSamples, dirRadius, dirSamples, speed }: LightsProps) {
  const dirGroupRef = useRef<Group>(null)
  const dirLightRef = useRef<DirectionalLight>(null)
  const bobPhaseRef = useRef(0)

  useFrame((_, delta) => {
    const group = dirGroupRef.current
    const light = dirLightRef.current
    if (!group || !light) return
    group.rotation.y += 0.7 * speed * delta
    bobPhaseRef.current += speed * delta // original rate: sin(time_ms * 0.001) = 1 rad/s
    light.position.z = 17 + Math.sin(bobPhaseRef.current) * 5
  })

  return (
    <>
      <ambientLight color="#444444" />
      <spotLight
        color="#ff8888"
        intensity={400}
        position={[8, 10, 5]}
        angle={Math.PI / 5}
        penumbra={0.3}
        castShadow
        shadow-camera-near={8}
        shadow-camera-far={200}
        shadow-mapSize-width={256}
        shadow-mapSize-height={256}
        shadow-bias={-0.002}
        shadow-radius={spotRadius}
        shadow-blurSamples={spotSamples}
      />
      <group ref={dirGroupRef}>
        <directionalLight
          ref={dirLightRef}
          color="#8888ff"
          intensity={3}
          position={[3, 12, 17]}
          castShadow
          shadow-camera-near={0.1}
          shadow-camera-far={500}
          shadow-camera-left={-17}
          shadow-camera-right={17}
          shadow-camera-top={17}
          shadow-camera-bottom={-17}
          shadow-mapSize-width={512}
          shadow-mapSize-height={512}
          shadow-bias={-0.0005}
          shadow-radius={dirRadius}
          shadow-blurSamples={dirSamples}
        />
      </group>
    </>
  )
}

export default function ShadowmapVsm() {
  const { spotRadius, spotSamples, dirRadius, dirSamples, speed } = useControls('shadowmap-vsm', {
    spotlight: folder({
      spotRadius: { value: 4, min: 0, max: 25, step: 0.1, label: 'radius' },
      spotSamples: { value: 8, min: 1, max: 25, step: 1, label: 'samples' },
    }),
    'directional light': folder({
      dirRadius: { value: 4, min: 0, max: 25, step: 0.1, label: 'radius' },
      dirSamples: { value: 8, min: 1, max: 25, step: 1, label: 'samples' },
    }),
    speed: { value: 1, min: 0, max: 3, step: 0.05 },
  })

  return (
    <Canvas
      renderer={{ toneMapping: NoToneMapping }}
      shadows="variance"
      background="#222244"
      camera={{ position: [0, 10, 30], fov: 45, near: 1, far: 1000 }}
    >
      <fog attach="fog" args={['#222244', 50, 100]} />
      <Lights
        spotRadius={spotRadius}
        spotSamples={spotSamples}
        dirRadius={dirRadius}
        dirSamples={dirSamples}
        speed={speed}
      />
      <TorusKnot speed={speed} />
      <Pillars />
      <Ground />
      <DemoHelpers grid={false} target={[0, 2, 0]} minDistance={8} maxDistance={60} />
    </Canvas>
  )
}

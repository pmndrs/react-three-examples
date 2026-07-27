/**
 * fog-height
 * R3F port of three.js `webgpu_fog_height`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_fog_height (~110 lines of JS)
 *
 * DEMONSTRATES
 * - The CUSTOM TSL fog path: `scene.fogNode = fog(color, factor)` with an
 *   `exponentialHeightFogFactor(density, height)` factor — fog that pools below a
 *   world-space height instead of the uniform distance haze the auto-wrapped
 *   `Fog`/`FogExp2` objects give
 * - Live three/tsl `uniform()` nodes as the dynamism channel: the fog graph is built
 *   ONCE, leva sliders only mutate `uniform.value` — no shader rebuild while dragging
 *   (exactly how the original's Inspector GUI drives the same two uniforms)
 * - `InstancedMesh` with a one-time imperative `setMatrixAt` layout in
 *   `useLayoutEffect` (first-render-visible mesh state, per the Layer 1 rule)
 * - Deliberate `renderer={{ toneMapping: NoToneMapping }}` for parity — the original
 *   runs the WebGPURenderer default; fiber's ACESFilmic default would mute the
 *   pastel pink/peach palette
 *
 * DIVERGENCE from original
 * - `scene.fogNode` is assigned through a documented cast — `@types/three`'s `Scene`
 *   doesn't declare `fogNode` even though the WebGPU renderer's `NodeManager` reads it
 *   off the live scene (AGENTS.md fog rule / UPSTREAM.md B11; pattern: sprites.tsx)
 * - Fog color exposed via leva (original hard-codes 0xffdfc1); the Canvas `background`
 *   prop is tied to the same control so the fog bank always dissolves into the sky.
 *   Background set via the `background` prop (scene.background) rather than the
 *   original's `scene.backgroundNode = color(...)` — identical output for a flat color
 * - Inspector GUI → leva (same density/height ranges); OrbitControls → DemoHelpers
 *   CameraControls with the original's minDistance/maxDistance/maxPolarAngle limits
 * - DemoHelpers grid disabled — the original has no ground plane and a grid at y=0
 *   would slice through the fog bank the example is about
 */
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber/webgpu'
import { useControls } from 'leva'
import { exponentialHeightFogFactor, fog, uniform } from 'three/tsl'
import { Color, NoToneMapping, Object3D } from 'three/webgpu'
import type { InstancedMesh, Node } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

interface HeightFogProps {
  density: number
  height: number
  fogColor: string
}

// Custom scene-level TSL fog. The graph is built once from live uniform() nodes;
// leva changes only mutate `.value`. Cast: `@types/three`'s `Scene` doesn't declare
// `fogNode` — see header DIVERGENCE.
function HeightFog({ density, height, fogColor }: HeightFogProps) {
  const scene = useThree((s) => s.scene)

  // three/tsl uniforms, created once — the same objects the original feeds its GUI.
  const uDensity = useMemo(() => uniform(0.04), [])
  const uHeight = useMemo(() => uniform(2), [])
  const uColor = useMemo(() => uniform(new Color('#ffdfc1')), [])

  useEffect(() => {
    const fogged = scene as unknown as { fogNode: Node | null }
    fogged.fogNode = fog(uColor, exponentialHeightFogFactor(uDensity, uHeight))
    return () => {
      fogged.fogNode = null
    }
  }, [scene, uColor, uDensity, uHeight])

  useEffect(() => {
    uDensity.value = density
  }, [uDensity, density])

  useEffect(() => {
    uHeight.value = height
  }, [uHeight, height])

  useEffect(() => {
    uColor.value.set(fogColor)
  }, [uColor, fogColor])

  return null
}

// 10x10 grid of tall boxes sunk into the fog bank, matching the original's
// InstancedMesh layout (one-time imperative setMatrixAt — Layer 1 useLayoutEffect rule).
function BoxField() {
  const meshRef = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return

    const dummy = new Object3D()
    let index = 0

    for (let i = 0; i < 10; i++) {
      for (let j = 0; j < 10; j++) {
        dummy.position.set(-18 + i * 4, 0, -18 + j * 4)
        dummy.updateMatrix()
        mesh.setMatrixAt(index++, dummy.matrix)
      }
    }

    mesh.instanceMatrix.needsUpdate = true
  }, [])

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, 100]} position={[0, -10, 0]}>
      <boxGeometry args={[1, 25, 1]} />
      <meshPhongNodeMaterial color="#cd959a" />
    </instancedMesh>
  )
}

export default function FogHeight() {
  const { density, height, fogColor } = useControls('height-fog', {
    density: { value: 0.04, min: 0.001, max: 0.1, step: 0.0001 },
    height: { value: 2, min: -5, max: 5 },
    fogColor: '#ffdfc1',
  })

  return (
    <Canvas
      // Original runs the WebGPURenderer default (NoToneMapping) — fiber's ACESFilmic
      // default would mute the pastel palette (AGENTS.md tone-mapping parity rule).
      renderer={{ toneMapping: NoToneMapping }}
      background={fogColor}
      camera={{ position: [20, 10, 25], fov: 45, near: 1, far: 600 }}
    >
      <HeightFog density={density} height={height} fogColor={fogColor} />
      <BoxField />
      <directionalLight color="#ffc0cb" intensity={2} position={[-10, 10, 10]} />
      <ambientLight color="#cccccc" />
      <DemoHelpers grid={false} minDistance={7} maxDistance={100} maxPolarAngle={Math.PI / 2} />
    </Canvas>
  )
}

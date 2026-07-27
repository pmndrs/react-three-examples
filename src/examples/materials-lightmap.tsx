/**
 * materials-lightmap
 * R3F port of three.js `webgpu_materials_lightmap`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_materials_lightmap (~100 lines of JS)
 *
 * DEMONSTRATES
 * - Baked lighting: a classic `ObjectLoader` JSON scene (one mesh, three
 *   `MeshPhongMaterial` groups) whose `lightMap` textures live on the SECOND UV
 *   channel (`texture.channel = 1` in the JSON) — loaded through fiber's `useLoader`
 *   and mounted with `<primitive>`; the WebGPU renderer converts the classic Phong
 *   materials to node materials automatically
 * - `lightMapIntensity` as a LIVE uniform: material scalar fields are
 *   reference-node-backed in the node pipeline, so the leva slider mutates the loaded
 *   materials directly in an effect — no `needsUpdate`, no uniform plumbing
 * - The canonical TSL skydome gradient: `MeshBasicNodeMaterial.colorNode =
 *   vec4(mix(bottom, top, positionLocal.add(offset).normalize().y.max(0).pow(e)), 1)`
 *   on a `BackSide` sphere, built once in a `useMemo` and passed as a JSX prop
 * - `renderer={{ toneMapping: NoToneMapping }}` — deliberate: the original renders
 *   with the WebGPURenderer default; fiber's ACESFilmic default would mute the baked
 *   lightmap's warm bounce (AGENTS.md tone-mapping parity trap)
 *
 * DIVERGENCE from original
 * - `renderer.inspector.createParameters` GUI replaced with leva. The slider defaults
 *   to 2.5 — the `lightMapIntensity` the JSON actually ships — with range 0–4; the
 *   original's slider initializes at 1 (range 0–1), so its first touch snaps the
 *   baked light visibly darker than the loaded scene. Ours starts at the true value.
 * - OrbitControls (zoom disabled, polar cap 0.9·π/2) → this repo's CameraControls via
 *   DemoHelpers: same polar cap, but dolly is allowed and clamped to [100, 2500]
 *   (stays well inside the 4000-unit skydome) instead of disabled outright
 * - DemoHelpers grid disabled — the model ships its own baked-lit stone floor at a
 *   ~800-unit world scale; the 0.5-unit demo grid would be sub-pixel noise inside it
 */
import { Suspense, useEffect, useMemo } from 'react'
import { Canvas, useLoader } from '@react-three/fiber/webgpu'
import { useControls } from 'leva'
import { BackSide, Color, NoToneMapping, ObjectLoader } from 'three/webgpu'
import type { Mesh, MeshPhongMaterial } from 'three/webgpu'
import { color, mix, positionLocal, vec4 } from 'three/tsl'
import { DemoHelpers } from '../utils/DemoHelpers'

// ObjectLoader resolves the JSON's relative image URLs (lightmap-ao-shadow.png,
// rocks.jpg, stone.jpg) against the JSON's own directory — hotlinking the .json is
// enough to pull the whole texture set from the pinned CDN.
const MODEL_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/json/lightmap/lightmap.json'

// The original's DirectionalLight color; the skydome's top color copies it.
const LIGHT_COLOR = '#d5deff'

// BackSide gradient dome, straight port of the original's TSL graph — see header
// DEMONSTRATES. positionLocal.add(400) broadcasts the scalar offset to xyz, exactly
// like the GLSL `normalize(vWorldPosition + offset)` this shader descends from.
function Skydome() {
  const colorNode = useMemo(() => {
    const topColor = new Color(LIGHT_COLOR)
    const bottomColor = new Color(0xffffff)
    const offset = 400
    const exponent = 0.6
    const h = positionLocal.add(offset).normalize().y
    return vec4(mix(color(bottomColor), color(topColor), h.max(0.0).pow(exponent)), 1.0)
  }, [])

  return (
    <mesh>
      <sphereGeometry args={[4000, 32, 15]} />
      <meshBasicNodeMaterial colorNode={colorNode} side={BackSide} />
    </mesh>
  )
}

// Suspends on the JSON fetch (B17: gated by the Suspense boundary in the page
// component). The single mesh carries a 3-material array; the slider drives every
// material's lightMapIntensity live — see header DEMONSTRATES.
function LightmapModel({ intensity }: { intensity: number }) {
  const object = useLoader(ObjectLoader, MODEL_URL)

  useEffect(() => {
    object.traverse((child) => {
      const mesh = child as Mesh
      if (!mesh.isMesh) return
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const material of materials) {
        // The JSON ships MeshPhongMaterial entries — truthful narrowing, not a hack.
        ;(material as MeshPhongMaterial).lightMapIntensity = intensity
      }
    })
  }, [object, intensity])

  return <primitive object={object} />
}

export default function MaterialsLightmap() {
  const { lightMapIntensity } = useControls('materials-lightmap', {
    lightMapIntensity: { value: 2.5, min: 0, max: 4, step: 0.05 },
  })

  return (
    <Canvas
      // NoToneMapping = original's renderer default (see header DEMONSTRATES).
      renderer={{ toneMapping: NoToneMapping }}
      camera={{ position: [700, 200, -500], fov: 40, near: 1, far: 10000 }}
    >
      <directionalLight color={LIGHT_COLOR} position={[300, 250, -500]} />
      <Skydome />
      {/* B17 gate: the JSON fetch suspends; never let that reach Canvas's boundary. */}
      <Suspense fallback={null}>
        <LightmapModel intensity={lightMapIntensity} />
      </Suspense>
      <DemoHelpers
        grid={false}
        maxPolarAngle={0.9 * (Math.PI / 2)}
        minDistance={100}
        maxDistance={2500}
      />
    </Canvas>
  )
}

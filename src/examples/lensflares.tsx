/**
 * lensflares
 * R3F port of three.js `webgpu_lensflares`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_lensflares (~150 lines of JS)
 *
 * DEMONSTRATES
 * - `LensflareMesh`/`LensflareElement` (the WebGPU lensflare addon, TSL-based — the
 *   WebGL `Lensflare` sibling stays on shader chunks): camera-facing flare quads with
 *   ghost elements spaced along the light-to-screen-center axis, occlusion-tested per
 *   frame by copying a 16x16 framebuffer region (`copyFramebufferToTexture`)
 * - The addon wired near-verbatim inside a `useMemo` as a showcased imperative escape
 *   hatch: the flare's main element shares the light's LIVE `Color` instance (tint
 *   follows the light for free), and the `LensflareMesh` is a scene-graph child of its
 *   `PointLight`, mounted declaratively via `<primitive object={light}>`
 * - A 3000-mesh starfield sharing ONE geometry + ONE `MeshPhongNodeMaterial`, with
 *   `matrixAutoUpdate={false}` and a one-time `updateMatrix()` pass in
 *   `useLayoutEffect` (static world, matrices baked before the first render)
 * - Scene-level `Fog` set declaratively (`<fog attach="fog">`) sharing the background
 *   color, auto-wrapped into a fog node by the WebGPU renderer
 *
 * DIVERGENCE from original
 * - FlyControls (WASD/RF/QE free flight) -> this repo's CameraControls orbit via
 *   DemoHelpers (corpus baseline); grid disabled — the scene is deep space
 * - Box count, point-light intensity, and directional-light intensity are leva
 *   controls; the original hard-codes all three
 * - The three flare-light colors stay the original's fixed palette (no leva pickers):
 *   `LensflareMesh` applies a one-time in-place `convertSRGBToLinear()` to the main
 *   element's Color on first render (upstream quirk — it darkens the light's own color
 *   too, exactly as the original ships), so live sRGB color controls would tint
 *   differently before vs after that first frame
 * - `renderer.inspector` (three.js Inspector dev overlay) dropped — gallery furniture,
 *   not scene content
 * - Background/dirLight colors are precomputed sRGB hex of the original's `setHSL()`
 *   values (fiber color props are sRGB-managed; the originals set linear directly)
 */
import { Suspense, useLayoutEffect, useMemo, useRef } from 'react'
import { Canvas } from '@react-three/fiber/webgpu'
import { useTexture } from '@react-three/drei/webgpu'
import { useControls } from 'leva'
import { LensflareElement, LensflareMesh } from 'three/addons/objects/LensflareMesh.js'
import { BoxGeometry, MeshPhongNodeMaterial, NoToneMapping, PointLight, SRGBColorSpace } from 'three/webgpu'
import type { Group, Texture } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const FLARE0_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/lensflare/lensflare0.png'
const FLARE3_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/lensflare/lensflare3.png'

// Original: `new Color().setHSL(0.51, 0.4, 0.01, SRGBColorSpace)` — precomputed to its
// sRGB hex so the Canvas `background` prop and the Fog share the exact same value.
const BACKGROUND = '#020304'
// Original: `dirLight.color.setHSL(0.1, 0.7, 0.5)` (linear working space) — this is the
// sRGB hex that fiber's managed color prop converts back to those linear components.
const DIR_LIGHT_COLOR = '#edc76c'

// Shared starfield assets — constant, so module-scope THREE instances are the idiomatic
// call (same rationale as lights-pointlights' markerGeometry).
const boxGeometry = new BoxGeometry(250, 250, 250)
const boxMaterial = new MeshPhongNodeMaterial({ color: 0xffffff, specular: 0xffffff, shininess: 50 })

// The original's three `addLight(h, s, l, x, y, z)` calls.
const FLARE_LIGHTS: { hsl: [number, number, number]; position: [number, number, number] }[] = [
  { hsl: [0.55, 0.95, 0.6], position: [5000, 0, -1000] },
  { hsl: [0.1, 0.85, 0.65], position: [0, 0, -1000] },
  { hsl: [0.995, 0.5, 0.95], position: [5000, 5000, -1000] },
]

interface BoxFieldProps {
  count: number
}

// 3000 randomly scattered boxes sharing one geometry + one material — see header
// DEMONSTRATES. The world is static, so each mesh opts out of per-frame matrix
// composition and gets its matrix baked exactly once below.
function BoxField({ count }: BoxFieldProps) {
  const groupRef = useRef<Group>(null)

  const transforms = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        position: [
          8000 * (2 * Math.random() - 1),
          8000 * (2 * Math.random() - 1),
          8000 * (2 * Math.random() - 1),
        ] as [number, number, number],
        rotation: [Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI] as [
          number,
          number,
          number,
        ],
      })),
    [count],
  )

  // matrixAutoUpdate is off (parity with the original's static field) — bake each local
  // matrix once, in a LAYOUT effect so it precedes the first WebGPU render.
  useLayoutEffect(() => {
    groupRef.current?.children.forEach((child) => child.updateMatrix())
  }, [transforms])

  return (
    <group ref={groupRef}>
      {transforms.map((t, i) => (
        <mesh
          key={i}
          geometry={boxGeometry}
          material={boxMaterial}
          position={t.position}
          rotation={t.rotation}
          matrixAutoUpdate={false}
        />
      ))}
    </group>
  )
}

interface FlareLightProps {
  hsl: [number, number, number]
  position: [number, number, number]
  intensity: number
  flare0: Texture
  flare3: Texture
}

// Near-verbatim port of the original's `addLight()` — a deliberate imperative escape
// hatch (this IS the addon being showcased). The main 700px element receives the
// light's live Color instance, so the flare core is tinted by the light itself; the
// four ghost elements march toward screen center at distances 0.6–1.0.
function FlareLight({ hsl, position, intensity, flare0, flare3 }: FlareLightProps) {
  const light = useMemo(() => {
    const light = new PointLight(0xffffff, 1.5, 2000, 0)
    light.color.setHSL(hsl[0], hsl[1], hsl[2])

    const lensflare = new LensflareMesh()
    lensflare.addElement(new LensflareElement(flare0, 700, 0, light.color))
    lensflare.addElement(new LensflareElement(flare3, 60, 0.6))
    lensflare.addElement(new LensflareElement(flare3, 70, 0.7))
    lensflare.addElement(new LensflareElement(flare3, 120, 0.9))
    lensflare.addElement(new LensflareElement(flare3, 70, 1))
    light.add(lensflare)

    return light
  }, [hsl, flare0, flare3])

  return <primitive object={light} position={position} intensity={intensity} />
}

interface FlareLightsProps {
  intensity: number
}

// Suspends on the two flare textures (own Suspense boundary in the page component).
function FlareLights({ intensity }: FlareLightsProps) {
  const [flare0, flare3] = useTexture([FLARE0_URL, FLARE3_URL], (textures) => {
    // Flare PNGs are color data — sRGB, exactly as the original sets them.
    for (const t of textures as Texture[]) t.colorSpace = SRGBColorSpace
  })

  return FLARE_LIGHTS.map((entry) => (
    <FlareLight
      key={entry.hsl.join()}
      hsl={entry.hsl}
      position={entry.position}
      intensity={intensity}
      flare0={flare0}
      flare3={flare3}
    />
  ))
}

export default function Lensflares() {
  const { boxCount, lightIntensity, dirIntensity } = useControls('lensflares', {
    boxCount: { value: 3000, min: 0, max: 5000, step: 500 },
    lightIntensity: { value: 1.5, min: 0, max: 10, step: 0.1 },
    dirIntensity: { value: 0.15, min: 0, max: 1, step: 0.01 },
  })

  return (
    <Canvas
      // Original renders with the WebGPURenderer default (NoToneMapping) — set
      // explicitly for parity (fiber's Canvas would default to ACESFilmic and mute
      // the additive flares).
      renderer={{ toneMapping: NoToneMapping }}
      background={BACKGROUND}
      camera={{ position: [0, 0, 250], fov: 40, near: 1, far: 15000 }}
    >
      <fog attach="fog" args={[BACKGROUND, 3500, 15000]} />
      <BoxField count={boxCount} />
      <directionalLight position={[0, -1, 0]} color={DIR_LIGHT_COLOR} intensity={dirIntensity} />
      <Suspense fallback={null}>
        <FlareLights intensity={lightIntensity} />
      </Suspense>
      <DemoHelpers grid={false} maxDistance={12000} />
    </Canvas>
  )
}

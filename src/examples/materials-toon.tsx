/**
 * materials-toon
 * R3F port of three.js `webgpu_materials_toon`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_materials_toon (~160 lines of JS)
 *
 * DEMONSTRATES
 * - `MeshToonNodeMaterial` with per-step `gradientMap` DataTextures: a 6x6x6 lattice
 *   of spheres sweeping gradient-step count (X), monochromatic energy loss (Y) and
 *   diffuse lightness (Z) — one tiny `RedFormat` 1D DataTexture per X column (2..7
 *   texels, default NearestFilter giving the hard cel bands)
 * - `toonOutlinePass` as the pipeline `outputNode` via `useRenderPipeline` — a post
 *   pass that re-renders only toon-material objects with an inverted-hull outline;
 *   built with the `ToonOutlinePassNode` constructor so its color/thickness/alpha
 *   slots take live three/tsl `uniform()` nodes (pattern (c): return-to-register,
 *   mutate `.value` in an effect — the `toonOutlinePass()` factory's TS signature
 *   only accepts plain `Color`/`number`, which would const-wrap the knobs)
 * - `FontLoader` + `TextGeometry` (three.js addons) via fiber's `useLoader` for the
 *   in-scene axis labels, inside its own explicit `<Suspense fallback={null}>`
 * - An orbiting `PointLight` whose visible marker is simply the parent `<mesh>` — the
 *   light rides the mesh's transform for free (same pattern as `lights-phong`)
 *
 * DIVERGENCE from original
 * - The original has no GUI; leva sliders for the outline color/thickness/alpha are
 *   added (defaults equal the `toonOutlinePass` factory defaults, so the untouched
 *   look matches the original) — the knobs flow through uniforms because pipeline
 *   callbacks never re-run on re-render
 * - Sphere lattice built from integer step indices instead of the original's
 *   floating-point `alpha += stepSize` accumulation — same 6 values per axis, no FP
 *   drift; the original's harmless out-of-bounds write in the gradient color loop
 *   (`c <= colors.length`) is dropped
 * - OrbitControls -> DemoHelpers CameraControls, same 200/2000 dolly limits. Grid
 *   disabled — the lattice floats in a colored void, no ground plane to anchor
 * - `renderer={{ toneMapping: NoToneMapping }}` pinned explicitly: the original renders
 *   with the WebGPURenderer default (none); fiber's Canvas would default to ACESFilmic
 *   and mute the flat cel palette
 * - `renderer.inspector = new Inspector()` dropped — this repo doesn't wire the
 *   three.js Inspector (same as `postprocessing` / `postprocessing-dof`)
 */
import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useLoader, useRenderPipeline } from '@react-three/fiber/webgpu'
import { useControls } from 'leva'
import { FontLoader } from 'three/addons/loaders/FontLoader.js'
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js'
import { uniform } from 'three/tsl'
import {
  Color,
  DataTexture,
  MeshToonNodeMaterial,
  NoToneMapping,
  RedFormat,
  SphereGeometry,
  ToonOutlinePassNode,
} from 'three/webgpu'
import type { Mesh, UniformNode } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const FONT_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/fonts/gentilis_regular.typeface.json'

const CUBE_WIDTH = 400
const SPHERES_PER_SIDE = 5 // 6 samples per axis (0..1 inclusive)
const SPHERE_RADIUS = (CUBE_WIDTH / SPHERES_PER_SIDE) * 0.8 * 0.5

// 6x6x6 toon spheres: X selects the gradientMap step count, Y darkens the diffuse
// color (monochromatic energy preservation), Z raises its lightness.
function ToonSpheres() {
  const geometry = useMemo(() => new SphereGeometry(SPHERE_RADIUS, 32, 16), [])

  const spheres = useMemo(() => {
    const out: { material: MeshToonNodeMaterial; position: [number, number, number] }[] = []

    for (let alphaIndex = 0; alphaIndex <= SPHERES_PER_SIDE; alphaIndex++) {
      const alpha = alphaIndex / SPHERES_PER_SIDE

      // One shared 1D gradient map per column: 2..7 evenly spaced gray steps.
      const colors = new Uint8Array(alphaIndex + 2)
      for (let c = 0; c < colors.length; c++) colors[c] = (c / colors.length) * 256
      const gradientMap = new DataTexture(colors, colors.length, 1, RedFormat)
      gradientMap.needsUpdate = true

      for (let betaIndex = 0; betaIndex <= SPHERES_PER_SIDE; betaIndex++) {
        const beta = betaIndex / SPHERES_PER_SIDE

        for (let gammaIndex = 0; gammaIndex <= SPHERES_PER_SIDE; gammaIndex++) {
          const gamma = gammaIndex / SPHERES_PER_SIDE

          const diffuseColor = new Color()
            .setHSL(alpha, 0.5, gamma * 0.5 + 0.1)
            .multiplyScalar(1 - beta * 0.2)

          out.push({
            material: new MeshToonNodeMaterial({ color: diffuseColor, gradientMap }),
            position: [alpha * 400 - 200, beta * 400 - 200, gamma * 400 - 200],
          })
        }
      }
    }

    return out
  }, [])

  return spheres.map(({ material, position }, i) => (
    <mesh key={i} geometry={geometry} material={material} position={position} />
  ))
}

// In-scene axis labels — FontLoader suspends, so the parent wraps this in Suspense.
function AxisLabels() {
  const font = useLoader(FontLoader, FONT_URL)

  const labels = useMemo(
    () =>
      (
        [
          { text: '-gradientMap', position: [-350, 0, 0] },
          { text: '+gradientMap', position: [350, 0, 0] },
          { text: '-diffuse', position: [0, 0, -300] },
          { text: '+diffuse', position: [0, 0, 300] },
        ] as { text: string; position: [number, number, number] }[]
      ).map(({ text, position }) => ({
        geometry: new TextGeometry(text, { font, size: 20, depth: 1, curveSegments: 1 }),
        position,
      })),
    [font],
  )

  return labels.map(({ geometry, position }, i) => (
    <mesh key={i} geometry={geometry} position={position}>
      <meshBasicNodeMaterial />
    </mesh>
  ))
}

// White marker sphere orbiting the lattice, carrying the point light as a child.
function ParticleLight() {
  const meshRef = useRef<Mesh>(null)

  useFrame((state) => {
    const timer = state.elapsed * 0.25 // original: Date.now() * 0.00025
    meshRef.current?.position.set(
      Math.sin(timer * 7) * 300,
      Math.cos(timer * 5) * 400,
      Math.cos(timer * 3) * 300,
    )
  })

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[4, 8, 8]} />
      <meshBasicNodeMaterial color="#ffffff" />
      <pointLight color="#ffffff" intensity={2} distance={800} decay={0} />
    </mesh>
  )
}

interface OutlineProps {
  outlineColor: string
  thickness: number
  alpha: number
}

// Toon outline post pass. Constructed via `new ToonOutlinePassNode` so the three knob
// slots take live uniform() nodes — see header DEMONSTRATES.
function ToonOutline({ outlineColor, thickness, alpha }: OutlineProps) {
  const { passes } = useRenderPipeline((state) => {
    const { renderPipeline, scene, camera } = state
    if (!renderPipeline) return

    // Initial values come from the closure ONCE (pipeline callbacks never re-run on
    // re-render); every later change flows through the registered uniforms below.
    const uColor = uniform(new Color(outlineColor))
    const uThickness = uniform(thickness)
    const uAlpha = uniform(alpha)

    const outlinePass = new ToonOutlinePassNode(scene, camera, uColor, uThickness, uAlpha)
    renderPipeline.outputNode = outlinePass

    return { outlinePass, uColor, uThickness, uAlpha }
  })

  useEffect(() => {
    // Only `.value` is touched, so the node-type param can stay unknown.
    const uColor = passes.uColor as UniformNode<unknown, Color> | undefined
    const uThickness = passes.uThickness as UniformNode<unknown, number> | undefined
    const uAlpha = passes.uAlpha as UniformNode<unknown, number> | undefined
    if (!uColor || !uThickness || !uAlpha) return
    uColor.value.set(outlineColor)
    uThickness.value = thickness
    uAlpha.value = alpha
  }, [passes, outlineColor, thickness, alpha])

  return null
}

export default function MaterialsToon() {
  const { outlineColor, thickness, alpha } = useControls('materials-toon', {
    outlineColor: { value: '#000000', label: 'outline color' },
    thickness: { value: 0.003, min: 0, max: 0.02, step: 0.0005 },
    alpha: { value: 1, min: 0, max: 1, step: 0.01 },
  })

  return (
    <Canvas
      // Original renders with the WebGPURenderer default tone mapping (none) —
      // match it explicitly; fiber's Canvas default is ACESFilmic.
      renderer={{ toneMapping: NoToneMapping }}
      background="#444488"
      camera={{ position: [0, 400, 1400], fov: 40, near: 1, far: 2500 }}
    >
      <ambientLight color="#c1c1c1" intensity={3} />
      <ToonSpheres />
      <Suspense fallback={null}>
        <AxisLabels />
      </Suspense>
      <ParticleLight />
      <ToonOutline outlineColor={outlineColor} thickness={thickness} alpha={alpha} />
      <DemoHelpers grid={false} minDistance={200} maxDistance={2000} />
    </Canvas>
  )
}

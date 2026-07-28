/**
 * mrt
 * R3F port of three.js `webgpu_mrt`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_mrt (~130 lines of JS)
 *
 * DEMONSTRATES
 * - Multiple Render Targets (MRT) on the main scene pass: one draw call writes
 *   final color (`output`), packed normals, diffuse albedo, and emissive into four
 *   separate G-buffer channels simultaneously (`scenePass.setMRT(mrt({...}))`),
 *   configured in `useRenderPipeline`'s setupCB per the MRT-goes-in-setupCB rule
 * - A custom scene pass built in setupCB (`pass(scene, camera, { minFilter,
 *   magFilter: NearestFilter })`) and registered under the `scenePass` key to
 *   override the hook's default — the "register to override" pattern, needed here
 *   because the default auto-created pass takes no render-target options
 * - `RenderPipeline.outputNode` composited from FOUR pass textures with
 *   `screenUV.x` step thresholds — a live split-screen debug view (final / normal /
 *   emissive / diffuse) built entirely from TSL, no extra render passes
 * - `renderPipeline.outputColorTransform = false` + `.renderOutput()` on just the
 *   'output' texture — only the beauty quadrant gets tone-mapped/color-managed,
 *   the raw G-buffer quadrants (normal/diffuse/emissive) stay untouched
 * - `renderer={{ requiredLimits: { maxColorAttachments: 5 } }}` — WebGPU MRT beyond
 *   the default attachment count needs an explicit device limit request, passed
 *   straight through the Canvas `renderer` prop to the WebGPURenderer constructor
 * - `useLoader(UltraHDRLoader, …)` for background + environment IBL (UPSTREAM B13:
 *   drei's Environment can't reach this loader, so it's wired directly)
 *
 * DIVERGENCE from original
 * - DamagedHelmet loaded via drei's `useGLTF` (Suspense-driven) instead of the
 *   original's manual `GLTFLoader().load()` callback — same multi-file `.gltf`
 *   variant (the CDN mirror of the three.js examples only ships that one, no
 *   glTF-Binary sibling)
 * - DemoHelpers baseline (orbit camera-controls only, `grid={false}`: the HDR
 *   environment already fills the frame and a ground grid would show through every
 *   quadrant, no showcase value) replaces the original's bare `OrbitControls`
 * - No leva controls — the original has none either; the four-way split is a fixed
 *   `screenUV.x` layout, not a parameter
 */
import { Suspense, useLayoutEffect } from 'react'
import { Canvas, useLoader, useRenderPipeline, useThree } from '@react-three/fiber/webgpu'
import { useGLTF } from '@react-three/drei/webgpu'
import {
  diffuseColor,
  emissive,
  mix,
  mrt,
  normalView,
  output,
  pass,
  packNormalToRGB,
  screenUV,
  step,
} from 'three/tsl'
import { UltraHDRLoader } from 'three/addons/loaders/UltraHDRLoader.js'
import { ACESFilmicToneMapping, EquirectangularReflectionMapping, NearestFilter, UnsignedByteType } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const HDR_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/equirectangular/royal_esplanade_2k.hdr.jpg'
const HELMET_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/DamagedHelmet/glTF/DamagedHelmet.gltf'

// Equirect HDR as both background and IBL environment — `.mapping` is read at
// shader-graph build time by every material's envMap, so it must land in a layout
// effect (AGENTS.md imperative-setup rule), before the first RAF render.
function HdrEnvironment() {
  const scene = useThree((s) => s.scene)
  const map = useLoader(UltraHDRLoader, HDR_URL)

  useLayoutEffect(() => {
    map.mapping = EquirectangularReflectionMapping
    scene.background = map
    scene.environment = map
    return () => {
      scene.background = null
      scene.environment = null
    }
  }, [scene, map])

  return null
}

function Helmet() {
  const { scene } = useGLTF(HELMET_URL)
  return <primitive object={scene} />
}

// Scene-pass MRT: final color + packed normal + diffuse albedo + emissive, split
// across the screen via `screenUV.x` thresholds. See header DEMONSTRATES.
function MrtPipeline() {
  useRenderPipeline(
    ({ renderPipeline, passes }) => {
      if (!renderPipeline) return

      const scenePass = passes.scenePass

      const outputTexture = scenePass.getTextureNode('output')
      const normalTexture = scenePass.getTextureNode('normal')
      const diffuseTexture = scenePass.getTextureNode('diffuse')
      const emissiveTexture = scenePass.getTextureNode('emissive')

      // Bandwidth optimization: these G-buffer channels don't need float precision.
      scenePass.getTexture('normal').type = UnsignedByteType
      scenePass.getTexture('diffuse').type = UnsignedByteType
      scenePass.getTexture('emissive').type = UnsignedByteType

      // Only the beauty quadrant should carry tone mapping/color-space transform —
      // the raw G-buffer quadrants must stay untouched, so the pipeline's automatic
      // transform is disabled and reapplied by hand via `.renderOutput()`.
      renderPipeline.outputColorTransform = false

      const withOutput = mix(outputTexture.renderOutput(), outputTexture, step(0.2, screenUV.x))
      const withNormal = mix(withOutput, normalTexture, step(0.4, screenUV.x))
      const withEmissive = mix(withNormal, emissiveTexture, step(0.6, screenUV.x))
      const withDiffuse = mix(withEmissive, diffuseTexture, step(0.8, screenUV.x))

      renderPipeline.outputNode = withDiffuse
    },
    ({ scene, camera }) => {
      // Register-to-override: the hook's default scenePass takes no render-target
      // options, so a custom one is built here (Nearest filtering, matching the
      // original) and returned under the `scenePass` key.
      const scenePass = pass(scene, camera, { minFilter: NearestFilter, magFilter: NearestFilter })
      scenePass.setMRT(
        mrt({
          output,
          normal: packNormalToRGB(normalView),
          diffuse: diffuseColor,
          emissive,
        }),
      )
      return { scenePass }
    },
  )

  return null
}

export default function Mrt() {
  return (
    <Canvas
      // Original sets ACESFilmic explicitly — mirrored deliberately (parity rule),
      // even though it happens to match fiber's Canvas default.
      renderer={{ toneMapping: ACESFilmicToneMapping, requiredLimits: { maxColorAttachments: 5 } }}
      camera={{ position: [-1.8, 0.6, 2.7], fov: 45, near: 0.25, far: 20 }}
    >
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes the displayed scene (AGENTS.md; corpus-wide repair, wave 8). */}
      <Suspense fallback={null}>
        <HdrEnvironment />
        <Helmet />
      </Suspense>
      <MrtPipeline />
      <DemoHelpers grid={false} target={[0, 0, -0.2]} minDistance={2} maxDistance={10} />
    </Canvas>
  )
}

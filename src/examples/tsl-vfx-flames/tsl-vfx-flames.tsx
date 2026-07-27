/**
 * tsl-vfx-flames
 * R3F port of three.js `webgpu_tsl_vfx_flames`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_tsl_vfx_flames (~190 lines of JS)
 *
 * DEMONSTRATES
 * - Bruno Simon's stylized flame VFX (inspired by @cmzw_): two `SpriteNodeMaterial`
 *   `colorNode` graphs (Flames.tsx) that paint animated licking fire from nothing but
 *   UV surgery — `spherizeUV` bulge, per-axis `pow` stretch, a travelling `sin`
 *   wobble — plus scrolling cellular/perlin noise taps and a hard `step` cutout; no
 *   geometry animation, no per-frame JS
 * - `billboarding()` as a `vertexNode` override: the sprite follows the camera
 *   horizontally only, so orbiting above still shows the flame standing upright
 *   (and replaces SpriteNodeMaterial's whole built-in billboard/center/rotation path)
 * - A 128x1 `CanvasTexture` gradient ramp as a color LUT, sampled by flame intensity
 *   (`texture(gradient, vec2(shape, 0))`) — the classic VFX toning trick
 * - Explicit level-0 sampling (`texture(map, uv, 0)`) for noise taps whose UVs scroll
 *   via `.mod(1)` — derivative-based mip selection would seam at the wrap boundary
 * - `useUniforms` run-time knob (`timeScale` multiplying the TSL `time` built-in
 *   everywhere) next to build-time graph constants — slow-mo with zero rebuilds
 *
 * DIVERGENCE from original
 * - `timeScale` uniform added (every `time` term becomes `time.mul(uTimeScale)`) and
 *   the five gradient stops exposed as leva colors repainting the CanvasTexture live —
 *   the original hard-codes all of them and has no GUI (its Inspector addon overlay is
 *   dropped repo-wide; leva is the panel)
 * - `sprite.center.set(0.5, 0)` omitted: `center` is only applied inside
 *   `SpriteNodeMaterial.setupPositionView`, which the `vertexNode = billboarding()`
 *   override bypasses entirely (NodeMaterial.setupVertex) — it is a no-op in the
 *   original too, verified against three/src/materials/nodes/SpriteNodeMaterial.js
 * - `.toVar()` added where the original assigns into bare expressions (flame 1's
 *   `cellularNoise`, flame 2's `shape`) — identical math, keeps `.assign()` targets
 *   real vars under three 0.185.1
 * - `useUniforms`' `UniformNode<T>` pins its TSL type param to `unknown` (documented
 *   fiber typing gap) — cast to `Node<'float'>` where the uniform feeds TSL math
 * - `renderer={{ toneMapping: NoToneMapping }}`: the original renders with the
 *   WebGPURenderer default; fiber's Canvas defaults to ACESFilmic, which mutes the
 *   white-hot core and the gradient's saturated magentas
 * - OrbitControls → DemoHelpers' camera-controls baseline (same 0.1/50 dolly range);
 *   grid disabled — the flames float in a dark void with no ground plane
 * - Split into a folder (this file + Flames.tsx): the single-file port runs past the
 *   ~200-line threshold — split by scene role (page shell/controls vs the flame node
 *   graphs, which need fiber hooks and so must live inside `<Canvas>`)
 * - Explicit `<Suspense fallback={null}>` around the flame subtree (the original has
 *   no async boundary at all): if useTexture's suspension bubbles up to Canvas's own
 *   boundary, fiber alpha.3 re-runs createRoot and the TSL `time` uniform stops
 *   updating — the whole scene freezes on its first frame. Bisected on this port;
 *   sprites/tsl-earth/refraction in this corpus exhibit the same latent freeze
 */
import { Suspense, useMemo } from 'react'
import { Canvas } from '@react-three/fiber/webgpu'
import { folder, useControls } from 'leva'
import { NoToneMapping } from 'three/webgpu'
import { DemoHelpers } from '../../utils/DemoHelpers'
import { Flames } from './Flames'

export default function TslVfxFlames() {
  const { timeScale, color1, color2, color3, color4, color5 } = useControls('tsl-vfx-flames', {
    timeScale: { value: 1, min: 0, max: 3, step: 0.01 },
    gradient: folder({
      color1: '#090033',
      color2: '#5f1f93',
      color3: '#e02e96',
      color4: '#ffbd80',
      color5: '#fff0db',
    }),
  })

  const gradientColors = useMemo(
    () => [color1, color2, color3, color4, color5],
    [color1, color2, color3, color4, color5],
  )

  return (
    <Canvas
      // NoToneMapping matches the original (WebGPURenderer default) — see header.
      renderer={{ toneMapping: NoToneMapping }}
      background="#201919"
      camera={{ position: [1, 1, 3], fov: 25, near: 0.1, far: 100 }}
    >
      {/* The Suspense boundary is load-bearing, not cosmetic: letting useTexture's
          suspension bubble to Canvas's own boundary re-runs createRoot ("R3F.createRoot
          should only be called once!") and permanently freezes the TSL `time` update
          loop — the flames render one frame and never lick. See header DIVERGENCE. */}
      <Suspense fallback={null}>
        <Flames timeScale={timeScale} gradientColors={gradientColors} />
      </Suspense>
      <DemoHelpers grid={false} minDistance={0.1} maxDistance={50} />
    </Canvas>
  )
}

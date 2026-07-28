/**
 * multiple-rendertargets
 * R3F port of three.js `webgpu_multiple_rendertargets`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_multiple_rendertargets (~90 lines of JS)
 *
 * DEMONSTRATES
 * - The simplest possible MRT: one channel named 'output' (beauty) and one named
 *   'normal' (world-space normals), split across the screen with a `screenUV.x` step
 * - `useRenderPipeline`'s auto-managed scene pass replaces the original's fully
 *   manual two-pass loop: the original hand-rolls its own `THREE.RenderTarget`, sets
 *   MRT GLOBALLY on the renderer (`renderer.setMRT(...)`), and drives
 *   `renderer.setRenderTarget(target) → render() → setRenderTarget(null) →
 *   renderPipeline.render()` by hand every frame in its own `render(time)` callback.
 *   `passes.scenePass.setMRT(...)` in `useRenderPipeline`'s setupCB does the same job
 *   declaratively, with no render callback at all — fiber's default WebGPU frame
 *   loop already calls `renderPipeline.render()` once a RenderPipeline exists on
 *   state (the same simplification the `rtt` port makes for single-target RTT)
 * - A bare `<nodeMaterial>` (no lighting model, just `colorNode`) tiling a diffuse
 *   texture over a TorusKnot via `uv().mul(vec2(...))`
 *
 * DIVERGENCE from original
 * - The manual per-frame `renderer.setRenderTarget`/`renderer.setMRT` dance and the
 *   standalone `RenderTarget` are dropped entirely — see DEMONSTRATES above
 * - Rotation driven by `useFrame`'s elapsed time instead of the original's raw
 *   `time` render-callback argument (`(time / 1000) * .4`) — same visual speed
 * - DemoHelpers baseline (camera-controls orbit) replaces the bare `OrbitControls`;
 *   grid disabled (`grid={false}` — the original is a solid dark background with no
 *   ground plane)
 * - No leva controls — the original has none, nothing dynamic to expose beyond the
 *   fixed `screenUV.x` split
 */
import { Suspense, useLayoutEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useRenderPipeline } from '@react-three/fiber/webgpu'
import { useTexture } from '@react-three/drei/webgpu'
import { mix, mrt, normalWorld, output, screenUV, step, texture, uv, vec2 } from 'three/tsl'
import { RepeatWrapping, SRGBColorSpace, TorusKnotGeometry } from 'three/webgpu'
import type { Mesh } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const DIFFUSE_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/hardwood2_diffuse.jpg'

// A bare NodeMaterial (no lighting model) tiling the diffuse texture 10x4 over the
// TorusKnot's UVs, matching the original's `texture(diffuse, uv().mul(vec2(10,4)))`.
function TorusKnot() {
  const map = useTexture(DIFFUSE_URL)
  const geometry = useMemo(() => new TorusKnotGeometry(1, 0.3, 128, 32), [])
  const ref = useRef<Mesh>(null)

  // `.colorSpace`/`.wrapS`/`.wrapT` are read at shader-graph build time (first RAF
  // render), same race as `.mapping` elsewhere in this repo — land them before that
  // (AGENTS.md imperative-setup rule).
  useLayoutEffect(() => {
    map.colorSpace = SRGBColorSpace
    map.wrapS = map.wrapT = RepeatWrapping
  }, [map])

  useFrame((state) => {
    if (ref.current) ref.current.rotation.y = state.elapsed * 0.4
  })

  return (
    <mesh ref={ref} geometry={geometry}>
      <nodeMaterial colorNode={texture(map, uv().mul(vec2(10, 4)))} />
    </mesh>
  )
}

// Scene-pass MRT: beauty ('output') + world-space normal, split down the middle of
// the screen. See header DEMONSTRATES.
function MrtPipeline() {
  useRenderPipeline(
    ({ renderPipeline, passes }) => {
      if (!renderPipeline) return
      const outputTexture = passes.scenePass.getTextureNode('output')
      const normalTexture = passes.scenePass.getTextureNode('normal')
      renderPipeline.outputNode = mix(outputTexture, normalTexture, step(0.5, screenUV.x))
    },
    ({ passes }) => {
      passes.scenePass.setMRT(mrt({ output, normal: normalWorld }))
    },
  )

  return null
}

export default function MultipleRendertargets() {
  return (
    <Canvas background="#222222" camera={{ position: [0, 0, 4], fov: 70, near: 0.1, far: 50 }}>
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes the displayed scene (AGENTS.md; corpus-wide repair, wave 8). */}
      <Suspense fallback={null}>
        <TorusKnot />
      </Suspense>
      <MrtPipeline />
      <DemoHelpers grid={false} minDistance={2} maxDistance={20} />
    </Canvas>
  )
}

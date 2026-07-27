/**
 * rtt
 * R3F port of three.js `webgpu_rtt`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_rtt (~138 lines of JS)
 *
 * DEMONSTRATES
 * - Render-to-texture as a first-class case of `useRenderPipeline`: the original's
 *   manual `RenderTarget` + `QuadMesh` two-pass render loop is exactly what the hook's
 *   default scene pass already does, so the port needs no manual RTT plumbing at all —
 *   `passes.scenePass.getTextureNode()` IS the rendered scene texture
 * - A pointer-driven TSL post-process (`hue(saturation(sceneColor, ...), ...)`) fed by
 *   `state.pointer` each frame through `useUniforms`, per the pipeline-dynamism rule:
 *   values a component introduces into the graph must live behind a uniform, never a
 *   render-callback closure, because pipeline callbacks don't re-run on render
 * - A node-material `colorNode` set declaratively via JSX (`colorNode={texture(...)}`)
 *   instead of the original's imperative `materialBox.colorNode = ...` assignment
 *
 * DIVERGENCE from original
 * - Mouse tracking: the original adds a manual `window.addEventListener('mousemove', ...)`
 *   and normalizes `offsetX/offsetY` by hand. Replaced with fiber's built-in `state.pointer`
 *   (NDC, -1..1) read inside `useFrame`, remapped to the 0..1 range the original's FX
 *   node expects — no DOM listener or resize handler needed, fiber tracks pointer/resize
 *   for the canvas automatically
 * - DemoHelpers baseline (grid + orbit camera controls) added; the original has a fixed
 *   camera and no ground reference. The grid renders through the same RTT scene pass as
 *   the box, so it gets hue/saturation-shifted too — an intentional showcase that the
 *   post pass sees the whole scene, not just the box
 * - `THREE.RenderTarget`/`QuadMesh`/manual `renderer.setRenderTarget` calls dropped
 *   entirely — `useRenderPipeline` owns that two-pass render loop
 * - No leva controls: the only dynamic input in the original is the mouse position,
 *   already interactive via pointer movement — there's no extra parameter worth exposing
 */
import { Suspense, useRef } from 'react'
import { Canvas, useFrame, useRenderPipeline, useUniforms } from '@react-three/fiber/webgpu'
import { useTexture } from '@react-three/drei/webgpu'
import { hue, saturation, texture } from 'three/tsl'
import type { Mesh, Node } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const UV_GRID_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/uv_grid_opengl.jpg'

// Spins at the original's fixed per-frame increment (not delta-scaled) to match its
// visual speed as authored.
function SpinningBox() {
  const map = useTexture(UV_GRID_URL)
  const ref = useRef<Mesh>(null)

  useFrame(() => {
    const box = ref.current
    if (!box) return
    box.rotation.x += 0.01
    box.rotation.y += 0.02
  })

  return (
    <mesh ref={ref}>
      <boxGeometry />
      <meshBasicNodeMaterial colorNode={texture(map)} />
    </mesh>
  )
}

// Render-to-texture FX: modulates the scene-pass output's hue/saturation based on
// pointer position, mirroring the original's `screenFXNode` uniform driven by mousemove.
function PostFX() {
  const { uMouseX, uMouseY } = useUniforms(() => ({ uMouseX: 0.5, uMouseY: 0.5 }))

  useFrame((state) => {
    // fiber's pointer is NDC (-1..1, y-up); remap to the 0..1 (y-down) range the
    // original derives from `offsetX/offsetY`.
    uMouseX.value = state.pointer.x * 0.5 + 0.5
    uMouseY.value = 1 - (state.pointer.y * 0.5 + 0.5)
  })

  useRenderPipeline(({ renderPipeline, passes }) => {
    if (!renderPipeline) return

    const sceneColor = passes.scenePass.getTextureNode()
    // Cast: fiber's `UniformNode<T>` pins the TSL node-type param to `unknown`, so it
    // never structurally narrows to `Node<'float'>` even though it is one at runtime
    // (documented fiber typing gap, see skinning-instancing).
    const mouseX = uMouseX as unknown as Node<'float'>
    const mouseY = uMouseY as unknown as Node<'float'>

    renderPipeline.outputNode = hue(saturation(sceneColor.rgb, mouseX.oneMinus()), mouseY)
  })

  return null
}

export default function Rtt() {
  return (
    <Canvas renderer background="#0066ff" camera={{ position: [0, 0, 3], fov: 70, near: 0.1, far: 10 }}>
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes the displayed scene (AGENTS.md; corpus-wide repair, wave 8). */}
      <Suspense fallback={null}>
        <SpinningBox />
      </Suspense>
      <PostFX />
      <DemoHelpers />
    </Canvas>
  )
}

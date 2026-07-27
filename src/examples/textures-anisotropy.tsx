/**
 * textures-anisotropy
 * R3F port of three.js `webgpu_textures_anisotropy`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_textures_anisotropy (~150 lines of JS)
 *
 * DEMONSTRATES
 * - Per-texture anisotropic filtering: two clones of one crate texture, tiled 512x512
 *   across a huge ground plane seen at a grazing angle — the pathological blur case
 *   anisotropic filtering exists for — sampled at different `texture.anisotropy`
 *   (left pane defaults to `renderer.getMaxAnisotropy()`, right pane to 1)
 * - Render-phase takeover (`useFrame(cb, { phase: 'render' })`) reproducing the
 *   original's scissored split screen: ONE camera, TWO scenes, rendered side by side
 *   into a single canvas via `setScissor`/`setScissorTest` (precedent:
 *   `camera/CameraRig.tsx` — this example IS about custom rendering, so taking over
 *   the default render job is the intended case per the Layer 1 rule)
 * - fiber's `createPortal` authoring both plain `THREE.Scene`s declaratively (fog,
 *   lights, ground mesh) — the idiomatic replacement for the original's imperative
 *   `sceneN.add(...)` calls
 * - `state.pointer`/`state.size` inside the render job replacing the original's manual
 *   `mousemove` + `resize` listeners for the mouse-sway camera
 *
 * DIVERGENCE from original
 * - The two bottom-corner DOM labels ("anisotropy: N") become leva selects — upgraded
 *   from read-only labels to live controls: each pane's anisotropy is adjustable
 *   (1/2/4/8/16), not locked to max-vs-1. Values are clamped to
 *   `renderer.getMaxAnisotropy()` (constant 16 on the WebGPU backend)
 * - Changing a pane's anisotropy re-clones the source texture (a fresh Texture object,
 *   swapped in via the `map` prop) instead of mutating `anisotropy` on a live texture —
 *   a new texture object is the reliable way to get a fresh WebGPU sampler. Superseded
 *   clones are left to GC: tiny 256px image, control-rate churn only, and the StrictMode
 *   rule forbids disposing memoized instances in effect cleanups
 * - The original leaves the canvas transparent over a light page background (#f1f1f1);
 *   here the renderer clears to that color directly — same look, no reliance on page CSS
 * - Camera starts at its no-mouse steady state (y=200) instead of lerping up from y=0
 * - DemoHelpers grid + orbit controls are both off (`grid={false} controls={false}`):
 *   the render takeover owns the camera (mouse sway), CameraControls' per-frame
 *   `update()` would fight it, and the default scene is never rendered anyway. Still
 *   mounted for the readiness signal
 */
import { Suspense, useEffect, useMemo } from 'react'
import { Canvas, createPortal, useFrame, useThree } from '@react-three/fiber/webgpu'
import { useTexture } from '@react-three/drei/webgpu'
import { useControls } from 'leva'
import { MathUtils, RepeatWrapping, Scene, SRGBColorSpace } from 'three/webgpu'
import type { Texture, WebGPURenderer } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const CRATE_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/crate.gif'
const ANISOTROPY_LEVELS = [1, 2, 4, 8, 16]
// Original: both scissor rects are (width/2 - 2) wide — a 2px clear-color seam
// separates the panes.
const PANE_SEAM_PX = 2
// Original page background; doubles as the seam/sky color (see DIVERGENCE).
const CLEAR_COLOR = 0xf1f1f1

// One configured clone per pane: same image source, its own anisotropy (and therefore
// its own WebGPU sampler). Re-clones when the leva control changes — see DIVERGENCE.
function useCrateTexture(anisotropy: number): Texture {
  const source = useTexture(CRATE_URL)
  return useMemo(() => {
    const texture = source.clone()
    texture.colorSpace = SRGBColorSpace
    texture.wrapS = texture.wrapT = RepeatWrapping
    texture.repeat.set(512, 512)
    texture.anisotropy = anisotropy
    texture.needsUpdate = true
    return texture
  }, [source, anisotropy])
}

// Scene contents for one pane — identical fog/lights/ground in both scenes, only the
// texture differs (the original's scene1/scene2 setup, authored declaratively).
function CrateGround({ texture }: { texture: Texture }) {
  return (
    <>
      <fog attach="fog" args={[0xf2f7ff, 1, 25000]} />
      <ambientLight color={0xeef0ff} intensity={3} />
      <directionalLight position={[1, 1, 1]} intensity={6} />
      <mesh rotation-x={-Math.PI / 2} scale={1000}>
        <planeGeometry args={[100, 100]} />
        <meshPhongMaterial color="#ffffff" map={texture} />
      </mesh>
    </>
  )
}

function AnisotropySplit({ leftAnisotropy, rightAnisotropy }: { leftAnisotropy: number; rightAnisotropy: number }) {
  const rawRenderer = useThree((state) => state.renderer)
  // Cast: fiber's `useThree` types `renderer` as the `WebGLRenderer | WebGPURenderer`
  // union even on the `/webgpu` entry (documented fiber typing gap, UPSTREAM.md B9);
  // this canvas only ever runs a WebGPURenderer.
  const renderer = rawRenderer as WebGPURenderer

  // Original: texture1.anisotropy = renderer.getMaxAnisotropy() — the WebGPU backend
  // reports a constant 16 (spec ceiling), so the leva default of 16 IS max; the clamp
  // keeps any device-reported lower bound honest.
  const maxAnisotropy = renderer.getMaxAnisotropy()
  const leftTexture = useCrateTexture(Math.min(leftAnisotropy, maxAnisotropy))
  const rightTexture = useCrateTexture(Math.min(rightAnisotropy, maxAnisotropy))

  // The two panes' scenes — plain THREE.Scenes outside the Canvas's own tree, populated
  // declaratively by the createPortal calls below.
  const scenes = useMemo(() => [new Scene(), new Scene()] as const, [])

  useEffect(() => {
    renderer.setClearColor(CLEAR_COLOR, 1)
    return () => renderer.setScissorTest(false)
  }, [renderer])

  // Render takeover: mouse-sway camera + two scissored renders of the same camera into
  // the two half-canvas panes (the original's hand-rolled `render()`).
  useFrame(
    (state) => {
      const { width, height } = state.size
      const camera = state.camera

      // Original easing: target x = pointer offset from center (px), target y = inverted
      // pointer offset + 200, height clamped to [50, 1000]. fiber's pointer is NDC
      // (-1..1, y-up), so scale by the half-extents to recover the original's pixels.
      const targetX = state.pointer.x * (width / 2)
      const targetY = state.pointer.y * (height / 2) + 200
      camera.position.x += (targetX - camera.position.x) * 0.05
      camera.position.y = MathUtils.clamp(camera.position.y + (targetY - camera.position.y) * 0.05, 50, 1000)
      camera.lookAt(0, 0, 0)

      // Full-canvas clear first: paints the seam between the panes (and the right-edge
      // sliver) that neither scissored render touches.
      renderer.setScissorTest(false)
      renderer.clear()
      renderer.setScissorTest(true)

      const halfWidth = width / 2
      renderer.setScissor(0, 0, halfWidth - PANE_SEAM_PX, height)
      renderer.render(scenes[0], camera)
      renderer.setScissor(halfWidth, 0, halfWidth - PANE_SEAM_PX, height)
      renderer.render(scenes[1], camera)
    },
    { phase: 'render' },
  )

  return (
    <>
      {createPortal(<CrateGround texture={leftTexture} />, scenes[0])}
      {createPortal(<CrateGround texture={rightTexture} />, scenes[1])}
    </>
  )
}

export default function TexturesAnisotropyExample() {
  const { left, right } = useControls('anisotropy', {
    left: { label: 'left pane', value: 16, options: ANISOTROPY_LEVELS },
    right: { label: 'right pane', value: 1, options: ANISOTROPY_LEVELS },
  })

  return (
    <Canvas renderer camera={{ fov: 35, near: 1, far: 25000, position: [0, 200, 1500] }}>
      <Suspense fallback={null}>
        <AnisotropySplit leftAnisotropy={left} rightAnisotropy={right} />
      </Suspense>
      <DemoHelpers grid={false} controls={false} />
    </Canvas>
  )
}

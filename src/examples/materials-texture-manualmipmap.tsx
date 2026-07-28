/**
 * materials-texture-manualmipmap
 * R3F port of three.js `webgpu_materials_texture_manualmipmap`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_materials_texture_manualmipmap (~180 lines of JS)
 *
 * DEMONSTRATES
 * - Manually authored mipmap chains: `Texture.mipmaps[level] = <canvas>` supplies each
 *   mip level explicitly (8 hand-drawn, distinctly colored canvases) instead of letting
 *   the renderer auto-generate them from the base image — three's texture uploader
 *   skips auto-generation the moment `mipmaps.length > 0` (verified in
 *   `renderers/common/Textures.js`'s `needsMipmaps`/upload path), so every mip level
 *   drawn here is exactly what gets sampled at that distance, made visible by an
 *   extreme `repeat.set(1000, 1000)` tiling floor
 * - `minFilter`/`magFilter` pairs side by side: linear pane (`LinearMipmapLinear` /
 *   `Linear`) vs nearest pane (`NearestMipmapNearest` / `Nearest`) — same render-phase
 *   split-screen takeover as `textures-anisotropy` (one camera, two portaled
 *   `THREE.Scene`s, `setScissor`), reused verbatim here since it's the same
 *   mouse-sway-camera + scissored-comparison shape as that original
 * - Disabling mipmapping outright on a loaded photo (`minFilter = magFilter =
 *   LinearFilter` vs `NearestFilter`, no mip chain at all) as the second half of the
 *   comparison — point-sampled photo pixelation next to the floor's mip-level popping
 *
 * DIVERGENCE from original
 * - Camera-sway math, split-screen scissor takeover, and `createPortal`-authored
 *   scenes are lifted directly from `textures-anisotropy` (same original-era authoring
 *   style; see that file's header for the derivation notes) — not re-derived here
 * - The original's on-screen filter-name labels (`#lbl_left`/`#lbl_right` DOM overlays)
 *   are dropped; the titleblock is shell furniture and per-pane captions would
 *   duplicate the DEMONSTRATES text above
 * - No leva controls: every dynamic input in the original (mouse sway) is already
 *   interactive; the filter pairing per pane is the fixed A/B comparison the example
 *   exists to teach, not a knob worth exposing
 */
import { Suspense, useEffect, useMemo } from 'react'
import { Canvas, createPortal, useFrame, useThree } from '@react-three/fiber/webgpu'
import { useTexture } from '@react-three/drei/webgpu'
import {
  CanvasTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  MathUtils,
  NearestFilter,
  NearestMipmapNearestFilter,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
} from 'three/webgpu'
import type { Texture, WebGPURenderer } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const PAINTING_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/758px-Canestra_di_frutta_(Caravaggio).jpg'
// Original: level size halves each step, one distinct color per level so the mip chain
// is visually legible as the floor recedes.
const MIPMAP_LEVELS: Array<[size: number, color: string]> = [
  [128, '#f00'],
  [64, '#0f0'],
  [32, '#00f'],
  [16, '#400'],
  [8, '#040'],
  [4, '#004'],
  [2, '#044'],
  [1, '#404'],
]
const PANE_SEAM_PX = 2

// One hand-drawn mip level — a mid-gray field with a colored two-square checker so
// each level reads as a distinct pattern, not just a flat tint (original: `mipmap()`).
function drawMipLevel(size: number, color: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#444'
  ctx.fillRect(0, 0, size, size)
  ctx.fillStyle = color
  ctx.fillRect(0, 0, size / 2, size / 2)
  ctx.fillRect(size / 2, size / 2, size / 2, size / 2)
  return canvas
}

// Builds the manually-mipmapped floor texture for one pane. `nearest` picks the
// point-sampled filter pair; both panes share the identical 8-level mip chain.
function buildFloorTexture(nearest: boolean): CanvasTexture {
  const [level0Size, level0Color] = MIPMAP_LEVELS[0]
  const level0 = drawMipLevel(level0Size, level0Color)
  const texture = new CanvasTexture(level0)
  texture.mipmaps[0] = level0
  for (let i = 1; i < MIPMAP_LEVELS.length; i++) {
    const [size, color] = MIPMAP_LEVELS[i]
    texture.mipmaps[i] = drawMipLevel(size, color)
  }
  texture.colorSpace = SRGBColorSpace
  texture.repeat.set(1000, 1000)
  texture.wrapS = texture.wrapT = RepeatWrapping
  if (nearest) {
    texture.magFilter = NearestFilter
    texture.minFilter = NearestMipmapNearestFilter
  } else {
    texture.minFilter = LinearMipmapLinearFilter
    texture.magFilter = LinearFilter
  }
  texture.needsUpdate = true
  return texture
}

// One pane's contents: the giant tiled mip-floor plus the framed painting, sized off
// the painting's natural pixel dimensions (original: `addPainting`).
function MipmapPane({ floorTexture, paintingTexture }: { floorTexture: Texture; paintingTexture: Texture }) {
  const image = paintingTexture.image as HTMLImageElement
  const paintingScaleX = image.width / 100
  const paintingScaleY = image.height / 100
  const frameScaleX = 1.1 * paintingScaleX
  const frameScaleY = 1.1 * paintingScaleY
  const floorHeight = -1.117 * (image.height / 2)

  return (
    <>
      <fog attach="fog" args={[0x000000, 1500, 4000]} />

      <mesh rotation-x={-Math.PI / 2} scale={1000} position-y={floorHeight}>
        <planeGeometry args={[100, 100]} />
        <meshBasicNodeMaterial map={floorTexture} />
      </mesh>

      <mesh scale={[paintingScaleX, paintingScaleY, 1]}>
        <planeGeometry args={[100, 100]} />
        <meshBasicNodeMaterial color="#ffffff" map={paintingTexture} />
      </mesh>
      <mesh position-z={-10} scale={[frameScaleX, frameScaleY, 1]}>
        <planeGeometry args={[100, 100]} />
        <meshBasicNodeMaterial color="#000000" />
      </mesh>
      <mesh
        rotation-x={-Math.PI / 2}
        position={[0, -1.1 * (image.height / 2), -1.1 * (image.height / 2)]}
        scale={[frameScaleX, frameScaleY, 1]}
      >
        <planeGeometry args={[100, 100]} />
        <meshBasicNodeMaterial color="#000000" transparent opacity={0.75} />
      </mesh>
    </>
  )
}

function ManualMipmapSplit() {
  const rawRenderer = useThree((state) => state.renderer)
  // Cast: fiber's `useThree` types `renderer` as the `WebGLRenderer | WebGPURenderer`
  // union even on the `/webgpu` entry (documented fiber typing gap, UPSTREAM.md B9);
  // this canvas only ever runs a WebGPURenderer.
  const renderer = rawRenderer as WebGPURenderer

  const paintingSource = useTexture(PAINTING_URL)
  const paintingLinear = useMemo(() => {
    const t = paintingSource.clone()
    t.colorSpace = SRGBColorSpace
    t.minFilter = t.magFilter = LinearFilter
    t.needsUpdate = true
    return t
  }, [paintingSource])
  const paintingNearest = useMemo(() => {
    const t = paintingSource.clone()
    t.colorSpace = SRGBColorSpace
    t.minFilter = t.magFilter = NearestFilter
    t.needsUpdate = true
    return t
  }, [paintingSource])

  const floorLinear = useMemo(() => buildFloorTexture(false), [])
  const floorNearest = useMemo(() => buildFloorTexture(true), [])

  const scenes = useMemo(() => [new Scene(), new Scene()] as const, [])

  useEffect(() => {
    renderer.setClearColor(0x000000, 1)
    return () => renderer.setScissorTest(false)
  }, [renderer])

  // Render takeover: mouse-sway camera + two scissored renders of the same camera into
  // the two half-canvas panes (original's hand-rolled `render()`; math shared with
  // `textures-anisotropy`).
  useFrame(
    (state) => {
      const { width, height } = state.size
      const camera = state.camera

      const targetX = state.pointer.x * (width / 2)
      const targetY = state.pointer.y * (height / 2) + 200
      camera.position.x += (targetX - camera.position.x) * 0.05
      camera.position.y = MathUtils.clamp(camera.position.y + (targetY - camera.position.y) * 0.05, 50, 1000)
      camera.lookAt(0, 0, 0)

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
      {createPortal(<MipmapPane floorTexture={floorLinear} paintingTexture={paintingLinear} />, scenes[0])}
      {createPortal(<MipmapPane floorTexture={floorNearest} paintingTexture={paintingNearest} />, scenes[1])}
    </>
  )
}

export default function MaterialsTextureManualMipmap() {
  return (
    <Canvas renderer camera={{ fov: 35, near: 1, far: 5000, position: [0, 0, 1500] }}>
      <Suspense fallback={null}>
        <ManualMipmapSplit />
      </Suspense>
      <DemoHelpers grid={false} controls={false} />
    </Canvas>
  )
}

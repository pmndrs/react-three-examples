/**
 * multiple-rendertargets-readback
 * R3F port of three.js `webgpu_multiple_rendertargets_readback`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_multiple_rendertargets_readback (~160 lines of JS)
 *
 * DEMONSTRATES
 * - `renderer.readRenderTargetPixelsAsync(...)`: reading a rendered G-buffer channel
 *   back to the CPU as a typed array, then re-uploading it into a `DataTexture` — a
 *   genuine GPU→CPU→GPU roundtrip, not just a texture-to-texture composite
 * - A fully manual, imperative render loop via `useFrame(callback, { phase: 'render' })`
 *   — this example IS about custom rendering (two G-buffer render targets, an async
 *   readback, a raw `QuadMesh` swapped between two materials), so it takes over the
 *   frame entirely instead of using `useRenderPipeline`'s declarative scene pass
 *   (per AGENTS.md: only take over `phase: 'render'` when the example is genuinely
 *   about custom rendering, and never call `renderer.render()` alongside the default
 *   loop otherwise)
 * - A dedicated LOW-resolution (512x512) render target for the readback path,
 *   separate from the full-resolution display target — reading GPU pixels back to
 *   the CPU is expensive, so the readback-only path never touches full canvas
 *   resolution (the original's own comment: "Be careful with the size! 512 is
 *   already big")
 * - Runtime material swap on a raw `QuadMesh` (`quadMesh.material = ...`) driving the
 *   final full-screen composite, selected by a leva dropdown mirroring the
 *   original's Inspector `selection` GUI ('mrt' / 'diffuse' / 'normal')
 *
 * DIVERGENCE from original
 * - leva `selection` dropdown replaces `renderer.inspector.createParameters(...)` —
 *   same three options, same default ('mrt')
 * - DemoHelpers baseline (camera-controls orbit, `grid={false}` — solid dark
 *   background, no ground plane in the original) replaces the bare `OrbitControls`
 * - Render-target resize is driven by `useThree`'s reactive `size` instead of a
 *   manual `window.addEventListener('resize', ...)` handler
 * - The original's `render(time)` is itself an `async function` awaited directly by
 *   `renderer.setAnimationLoop`; ported to a SYNCHRONOUS `useFrame` callback that
 *   kicks off the readback as a decoupled, throttled-to-one promise instead of
 *   awaiting it inline — fiber's frame scheduler never awaits a callback's return
 *   value, so an `async` `phase: 'render'` callback would let the next frame's call
 *   start before the previous one finishes its `await`, and the two would race on
 *   the renderer's global `setRenderTarget`/`setMRT` state
 * - BUG FIX vs. the original: `readbackTarget`'s two textures are explicitly named
 *   `'output'`/`'normal'`, matching `renderTarget`'s naming. The original never names
 *   them. `MRTNode.setup()` resolves each named MRT output by matching
 *   `texture.name` against the CURRENTLY BOUND render target's own textures — an
 *   unnamed target matches nothing, every output is silently skipped, and the
 *   fragment shader compiles with a zero-member output struct (a genuine WGSL
 *   validation error, reproduced while porting: "structures must have at least one
 *   member"). `sceneMRT` is one shared node config used against BOTH render targets,
 *   so both need matching names for either to compile
 */
import { Suspense, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber/webgpu'
import { useTexture } from '@react-three/drei/webgpu'
import { useControls } from 'leva'
import { mix, mrt, normalWorld, output, screenUV, step, texture, uv, vec2 } from 'three/tsl'
import {
  DataTexture,
  MeshBasicNodeMaterial,
  NearestFilter,
  NodeMaterial,
  QuadMesh,
  RenderTarget,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  TorusKnotGeometry,
  UnsignedByteType,
} from 'three/webgpu'
import type { Mesh, WebGPURenderer } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const DIFFUSE_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/hardwood2_diffuse.jpg'
// Readback size is intentionally small — GPU→CPU pixel reads are expensive, per the
// original's own comment ("Be careful with the size! 512 is already big").
const READBACK_SIZE = 512

type Selection = 'mrt' | 'diffuse' | 'normal'

// Same bare-NodeMaterial TorusKnot as `multiple-rendertargets` — this port keeps its
// own copy (each example file is self-contained, per this repo's convention).
function TorusKnot() {
  const map = useTexture(DIFFUSE_URL)
  const geometry = useMemo(() => new TorusKnotGeometry(1, 0.3, 128, 32), [])
  const ref = useRef<Mesh>(null)

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

// The entire custom render loop: G-buffer pass into either the full-res display
// target or the low-res readback target, an optional GPU→CPU pixel readback, and a
// raw QuadMesh composite as the final frame — see header DEMONSTRATES.
function ReadbackPipeline({ selection }: { selection: Selection }) {
  const rawRenderer = useThree((s) => s.renderer)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)

  // Non-node instances captured by a create-once render loop must stay identity
  // -stable across StrictMode re-renders — lazy useState, not useMemo (AGENTS.md:
  // pattern from compute-particles-snow).
  const [renderTarget] = useState(
    () => new RenderTarget(1, 1, { count: 2, minFilter: NearestFilter, magFilter: NearestFilter }),
  )
  const [readbackTarget] = useState(() => new RenderTarget(READBACK_SIZE, READBACK_SIZE, { count: 2 }))
  const [pixelBufferTexture] = useState(() => {
    const buffer = new Uint8Array(READBACK_SIZE ** 2 * 4).fill(0)
    const dataTexture = new DataTexture(buffer, READBACK_SIZE, READBACK_SIZE)
    dataTexture.type = UnsignedByteType
    dataTexture.format = RGBAFormat
    return dataTexture
  })
  const [readbackMaterial] = useState(() => {
    const material = new MeshBasicNodeMaterial()
    material.colorNode = texture(pixelBufferTexture)
    return material
  })
  const [displayMaterial] = useState(() => new NodeMaterial())
  const [quadMesh] = useState(() => new QuadMesh(displayMaterial))
  const [sceneMRT] = useState(() => mrt({ output, normal: normalWorld }))

  useLayoutEffect(() => {
    // MRTNode.setup() resolves each named output by matching `texture.name` against
    // the CURRENTLY BOUND render target's own textures (`getTextureIndex` in three's
    // MRTNode.js) — an unnamed target's textures match nothing, so every output gets
    // silently skipped and the WGSL struct compiles with zero members. `sceneMRT` is
    // shared across BOTH render targets below, so both need the same 'output'/'normal'
    // names, not just the full-res one (found via a real WGSL compile error switching
    // to the readback path — not present in the original's naming, which is why this
    // is a fix, not just a divergence).
    renderTarget.textures[0].name = 'output'
    renderTarget.textures[1].name = 'normal'
    readbackTarget.textures[0].name = 'output'
    readbackTarget.textures[1].name = 'normal'
    displayMaterial.colorNode = mix(
      texture(renderTarget.textures[0]),
      texture(renderTarget.textures[1]),
      step(0.5, screenUV.x),
    )
  }, [renderTarget, readbackTarget, displayMaterial])

  useLayoutEffect(() => {
    // WebGPU-only renderer calls fail strict tsc on fiber's WebGL|WebGPU union
    // (AGENTS.md B9).
    const renderer = rawRenderer as WebGPURenderer
    const dpr = renderer.getPixelRatio()
    renderTarget.setSize(Math.floor(size.width * dpr), Math.floor(size.height * dpr))
  }, [rawRenderer, renderTarget, size])

  // Tracks whether a readback is currently in flight, so at most one is ever
  // outstanding at a time.
  const readbackInFlight = useRef(false)

  useFrame(
    () => {
      // WebGPU-only calls (setMRT/setRenderTarget with a WebGPU target) fail strict
      // tsc on fiber's WebGL|WebGPU renderer union (AGENTS.md B9).
      const renderer = rawRenderer as WebGPURenderer
      const isReadback = selection !== 'mrt'

      renderer.setMRT(sceneMRT)
      renderer.setRenderTarget(isReadback ? readbackTarget : renderTarget)
      renderer.render(scene, camera)

      renderer.setMRT(null)
      renderer.setRenderTarget(null)

      if (isReadback) {
        quadMesh.material = readbackMaterial

        // The callback itself stays SYNCHRONOUS — fiber's frame scheduler never
        // awaits a useFrame callback's return value, so an `async` callback here
        // would let the NEXT frame's call start before this one finishes awaiting
        // the readback, and the two would stomp the renderer's global
        // setRenderTarget/setMRT state on top of each other (found via a WGSL
        // "structures must have at least one member" compile error under overlap —
        // AGENTS.md candidate: never `await` inside a `phase: 'render'` callback).
        // The GPU→CPU readback instead runs as a decoupled promise, throttled to
        // one in-flight request at a time; `quadMesh.render` below always runs
        // synchronously with whatever pixel data is currently in the texture
        // (visually one frame stale at most).
        if (!readbackInFlight.current) {
          readbackInFlight.current = true
          const { width, height } = readbackTarget
          const textureIndex = selection === 'diffuse' ? 0 : 1

          renderer
            .readRenderTargetPixelsAsync(readbackTarget, 0, 0, width, height, textureIndex)
            .then((pixels) => {
              pixelBufferTexture.image.data = pixels
              pixelBufferTexture.needsUpdate = true
            })
            .finally(() => {
              readbackInFlight.current = false
            })
        }
      } else {
        quadMesh.material = displayMaterial
      }

      quadMesh.render(renderer)
    },
    { phase: 'render' },
  )

  return null
}

export default function MultipleRendertargetsReadback() {
  const { selection } = useControls('multiple-rendertargets-readback', {
    selection: { value: 'mrt' as Selection, options: ['mrt', 'diffuse', 'normal'] as Selection[] },
  })

  return (
    <Canvas background="#222222" camera={{ position: [0, 0, 4], fov: 70, near: 0.1, far: 50 }}>
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes the displayed scene (AGENTS.md; corpus-wide repair, wave 8). */}
      <Suspense fallback={null}>
        <TorusKnot />
      </Suspense>
      <ReadbackPipeline selection={selection} />
      <DemoHelpers grid={false} minDistance={2} maxDistance={20} />
    </Canvas>
  )
}

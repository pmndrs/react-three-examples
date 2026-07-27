/**
 * compute-texture
 * R3F port of three.js `webgpu_compute_texture`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_compute_texture (~110 lines of JS)
 *
 * DEMONSTRATES
 * - GPU compute writing a texture: `Fn(() => ...)().compute(width * height)` builds a
 *   ComputeNode that runs one invocation per texel — `instanceIndex` is decomposed into
 *   `uvec2(x, y)` coords and `textureStore(tex, uv, rgba).toWriteOnly()` writes the
 *   pixel (a shadertoy-style sine interference pattern)
 * - `useGPUStorage`: fiber v10's create-if-not-exists home for the `StorageTexture` —
 *   StrictMode-safe, HMR-versioned, disposable via the returned `disposeStorage` util
 * - EXPLICIT dispatch — the compute-vs-render-graph distinction this corpus's texture
 *   examples pivot on: fiber has no dispatch hook, so `renderer.compute(computeNode)`
 *   is called imperatively in a `useEffect` (B9 renderer cast). Nothing re-runs the
 *   kernel per frame — contrast `procedural-texture`, whose `convertToTexture()` bake
 *   self-schedules inside the render graph, and `rtt`, whose pass renders every frame
 * - Uniform-driven recompute: the pattern scale flows into the compute graph via
 *   `useUniforms`, and each leva change mutates the uniform then re-dispatches ONCE —
 *   dispatch-on-demand, zero per-frame compute cost
 * - The same `StorageTexture` instance is written by compute and sampled by the
 *   fragment stage (`texture(patternTexture)` as `colorNode`) with no readback
 * - ROOT-LEVEL `useNodes` (deliberately unscoped): scoped useNodes names nodes
 *   `${scope}.${name}`, and for any node that reaches WGSL codegen (TextureNode
 *   bindings here) the dot is a runtime shader-compile error — UPSTREAM.md B16
 *
 * DIVERGENCE from original
 * - Camera: the original locks an `OrthographicCamera` sized so the unit plane exactly
 *   fills the viewport (2D preview) with a manual resize handler recomputing the
 *   frustum. Replaced with the corpus default perspective camera + DemoHelpers
 *   grid/orbit baseline (same rationale as procedural-texture); fiber owns resize
 * - The original computes exactly once at startup with the scale hard-coded (50.0);
 *   this port promotes it to a `useUniforms` uniform with a leva slider, re-dispatching
 *   the (otherwise identical) kernel once per change so the explicit-dispatch pattern
 *   is demonstrated live rather than only at mount
 * - The original renders a single static frame (`render()` after init/resize only);
 *   here the default frame loop runs for orbit controls — the compute node still runs
 *   only when dispatched
 * - `MeshBasicNodeMaterial({ color: 0x00ff00 })` fallback color dropped — `colorNode`
 *   fully overrides it, it never renders
 */
import { useEffect } from 'react'
import { useControls } from 'leva'
import { Canvas, useGPUStorage, useNodes, useThree, useUniforms } from '@react-three/fiber/webgpu'
import { Fn, float, instanceIndex, texture, textureStore, uvec2, vec4 } from 'three/tsl'
import { StorageTexture, type Node, type WebGPURenderer } from 'three/webgpu'
import { DemoHelpers } from '../utils/DemoHelpers'

const WIDTH = 512
const HEIGHT = 512

function ComputedPlane({ scale }: { scale: number }) {
  const rawRenderer = useThree((state) => state.renderer)
  // Cast: useThree types renderer as the WebGL/WebGPU union even on the `/webgpu` entry
  // (fiber typing gap, UPSTREAM.md B9) — `.compute()` exists only on WebGPURenderer.
  const renderer = rawRenderer as WebGPURenderer

  // The compute target. useGPUStorage is create-once (StrictMode-safe) and owns
  // disposal; the instance is stable across re-renders, so closing over it below is safe.
  const { patternTexture } = useGPUStorage(
    () => ({ patternTexture: new StorageTexture(WIDTH, HEIGHT) }),
    'computeTexture', // WGSL-identifier rule: camelCase scope, never kebab-case
  )

  const { uScale } = useUniforms(() => ({ uScale: scale }), 'computeTexture')

  // Kernel + sampler node, built once. We close over the typed hook returns instead of
  // reading them back through the creator-state ScopedStore: the store leaf widens to
  // fiber's `StorageLike`, and `textureStore()` wants a concrete `StorageTexture`.
  //
  // ROOT-LEVEL on purpose: SCOPED useNodes names nodes `${scope}.${name}`, and a
  // TextureNode's name becomes a WGSL binding identifier — the dot is a runtime
  // shader-compile error (upstream fiber bug, UPSTREAM.md B16; sibling of the B12
  // useUniforms `${scope}_${name}` rule, but here fiber itself inserts the invalid
  // character). Root-level names are the bare keys, which are valid WGSL.
  const { computeNode, colorNode } = useNodes(() => {
    const computeTexture = Fn(() => {
      // One invocation per texel: unravel the flat dispatch index into x/y.
      const posX = instanceIndex.mod(WIDTH)
      const posY = instanceIndex.div(WIDTH)
      const indexUV = uvec2(posX, posY)

      // Sine interference pattern — https://www.shadertoy.com/view/Xst3zN
      // Cast: fiber's UniformNode pins the TSL node-type param to `unknown`, so it never
      // narrows to Node<'float'> (documented fiber typing gap — see procedural-texture).
      const x = float(posX).div(uScale as unknown as Node<'float'>)
      const y = float(posY).div(uScale as unknown as Node<'float'>)

      const v1 = x.sin()
      const v2 = y.sin()
      const v3 = x.add(y).sin()
      const v4 = x.mul(x).add(y.mul(y)).sqrt().add(5.0).sin()
      const v = v1.add(v2, v3, v4)

      const r = v.sin()
      const g = v.add(Math.PI).sin()
      const b = v.add(Math.PI).sub(0.5).sin()

      textureStore(patternTexture, indexUV, vec4(r, g, b, 1)).toWriteOnly()
    })

    return {
      // .compute(count) wraps the kernel in a ComputeNode sized to the texture.
      computeNode: computeTexture().compute(WIDTH * HEIGHT),
      // The very texture the kernel writes, sampled as a regular texture node.
      colorNode: texture(patternTexture),
    }
  })

  // Explicit dispatch — the ONLY thing that ever runs the kernel. Runs at mount and
  // once per scale change. Safe to call the sync `compute()` from an effect: fiber
  // awaits `renderer.init()` before children render, so the backend exists. StrictMode's
  // double-invoke just writes the same pixels twice — idempotent.
  useEffect(() => {
    uScale.value = scale
    renderer.compute(computeNode)
  }, [renderer, computeNode, uScale, scale])

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <meshBasicNodeMaterial colorNode={colorNode} />
    </mesh>
  )
}

export default function ComputeTexture() {
  const { scale } = useControls('compute-texture', {
    scale: { value: 50, min: 10, max: 150, step: 1, label: 'pattern scale' },
  })

  return (
    <Canvas renderer background="#111111" camera={{ position: [0, 0, 3], fov: 50 }}>
      <ComputedPlane scale={scale} />
      <DemoHelpers />
    </Canvas>
  )
}

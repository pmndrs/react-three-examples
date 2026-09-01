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
 *   is called imperatively in a `useEffect`. Nothing re-runs the kernel per frame —
 *   contrast `procedural-texture`, whose `convertToTexture()` bake
 *   self-schedules inside the render graph, and `rtt`, whose pass renders every frame
 * - Uniform-driven recompute: the pattern scale flows into the compute graph via
 *   `useUniforms`, and each leva change mutates the uniform then re-dispatches ONCE —
 *   dispatch-on-demand, zero per-frame compute cost
 * - The same `StorageTexture` instance is written by compute and sampled by the
 *   fragment stage (`texture(patternTexture)` as `colorNode`) with no readback
 * - Scoped `useNodes` groups the compute and sampling graph in fiber's v10 node store
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
import { Fn, float, instanceIndex, texture, textureStore, uvec2, vec4 } from 'three/tsl'
import { StorageTexture } from 'three/webgpu'
import { Canvas, useGPUStorage, useNodes, useThree, useUniforms } from '@react-three/fiber/webgpu'
import { useControls } from 'leva'
import { DemoHelpers } from '../utils/DemoHelpers'

const WIDTH = 512
const HEIGHT = 512

function ComputedPlane() {
  //* Controls =====================================================
  const { scale } = useControls('compute-texture', {
    scale: { value: 50, min: 10, max: 150, step: 1, label: 'pattern scale' },
  })
  const { uScale } = useUniforms({ uScale: scale }, 'computeTexture')

  const renderer = useThree((state) => state.renderer)

  // The compute target. useGPUStorage is create-once (StrictMode-safe) and owns
  // disposal; the instance is stable across re-renders, so closing over it below is safe.
  const { patternTexture } = useGPUStorage(
    () => ({ patternTexture: new StorageTexture(WIDTH, HEIGHT) }),
    'computeTexture', // WGSL-identifier rule: camelCase scope, never kebab-case
  )

  //* Compute Graph =================================================
  const { computeNode, colorNode } = useNodes(
    () => {
      const computeTexture = Fn(() => {
        // One invocation per texel: unravel the flat dispatch index into x/y.
        const posX = instanceIndex.mod(WIDTH)
        const posY = instanceIndex.div(WIDTH)
        const indexUV = uvec2(posX, posY)

        // Sine interference pattern — https://www.shadertoy.com/view/Xst3zN
        const x = float(posX).div(uScale)
        const y = float(posY).div(uScale)

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
    },
    'computeTexture',
  )

  // Explicit dispatch — the ONLY thing that ever runs the kernel. Runs at mount and
  // once per scale change. Safe to call the sync `compute()` from an effect: fiber
  // awaits `renderer.init()` before children render, so the backend exists. StrictMode's
  // double-invoke just writes the same pixels twice — idempotent.
  useEffect(() => {
    renderer.compute(computeNode)
  }, [renderer, computeNode, scale])

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <meshBasicNodeMaterial colorNode={colorNode} />
    </mesh>
  )
}

export default function ComputeTexture() {
  return (
    <Canvas renderer background="#111111" camera={{ position: [0, 0, 3], fov: 50 }}>
      <ComputedPlane />
      <DemoHelpers />
    </Canvas>
  )
}

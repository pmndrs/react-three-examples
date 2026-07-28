/**
 * compute-texture-3d
 * R3F port of three.js `webgpu_compute_texture_3d`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_compute_texture_3d (~150 lines of JS)
 *
 * DEMONSTRATES
 * - A `Storage3DTexture` written by compute EVERY FRAME (`mx_noise_vec3(coord.add(time))`
 *   sampled per-voxel) and read the same frame by a fragment-stage raymarcher —
 *   the GPU-computed, continuously-EVOLVING cousin of this repo's `volume-cloud`,
 *   whose `Data3DTexture` is a CPU-baked, static bake-once volume
 * - `mx_noise_vec3` + the TSL builtin `time` node feeding a compute kernel directly
 *   (AGENTS.md: prefer builtins over hand-driven uniforms) — no JS-side clock plumbing
 * - `texture3D(storageTexture, null, 0)`: sampling a compute-WRITTEN 3D storage texture
 *   as an ordinary filtered volume texture in the fragment stage, no readback, no
 *   format conversion — the same GPU memory, two different TSL entry points
 * - `RaymarchingBox` reused for a second volume (see `volume-cloud` for the technique
 *   itself: front-to-back alpha compositing, early `Break()` near full opacity)
 * - `Storage3DTexture` cast at the fiber-hook boundary: `useGPUStorage`'s creator
 *   return type is `StorageTexture`, which `Storage3DTexture` structurally satisfies
 *   for everything the hook needs (`.dispose()`) — same documented gap as
 *   `volume-fire`'s `createStorage3D` (fiber's `StorageLike` union, UPSTREAM.md B19)
 *
 * DIVERGENCE from original
 * - The original threads the target texture through an OBJECT-DESTRUCTURED `Fn(({
 *   storageTexture }) => ...)`, called explicitly as `computeCloud({ storageTexture })`.
 *   Here the compute kernel is a zero-arg `Fn(() => ...)` closing over `cloudTexture`
 *   directly (it's already in scope in the same `useNodes` creator) — same
 *   simplification as this repo's `compute-geometry`, and it sidesteps the
 *   object-destructured Fn param typing gap (B10 family) entirely
 * - Added an `animationSpeed` leva knob (not in the original) scaling `time` before it
 *   reaches the noise coordinate — the standout feature vs. the static `volume-cloud`
 *   is the live evolution, so exposing its rate teaches the point directly; 0 freezes
 *   the volume, letting threshold/opacity/range be inspected on a still frame
 * - The sky dome (1x32 canvas-gradient `BackSide` sphere) and `NodeMaterial` box-volume
 *   shading are ported verbatim from `volume-cloud` (same technique, not re-derived) —
 *   duplicated rather than shared, per this corpus's one-file-per-example convention
 * - `renderer.inspector.createParameters` panel becomes leva (threshold/opacity/range/
 *   steps, same ranges and defaults, plus `animationSpeed`)
 * - `renderer={{ toneMapping: NoToneMapping }}` explicit — the original renders with
 *   the WebGPURenderer default; fiber's ACESFilmic default would mute the unlit
 *   additive cloud shading (same rationale as `volume-cloud`)
 * - OrbitControls (unrestricted in the original) -> DemoHelpers CameraControls, grid off
 */
import { useMemo, useState } from 'react'
import { useControls } from 'leva'
import { Canvas, useFrame, useNodes, useThree, useUniforms } from '@react-three/fiber/webgpu'
import {
  Break,
  Fn,
  If,
  instanceIndex,
  mx_noise_vec3,
  smoothstep,
  texture3D,
  textureStore,
  time,
  vec3,
  vec4,
} from 'three/tsl'
import { BackSide, CanvasTexture, NoToneMapping, SRGBColorSpace, Storage3DTexture } from 'three/webgpu'
import type { Node, StorageTexture, WebGPURenderer } from 'three/webgpu'
import { RaymarchingBox } from 'three/addons/tsl/utils/Raymarching.js'
import { DemoHelpers } from '../utils/DemoHelpers'

// Per-axis voxel resolution — 200^3 = 8M compute invocations/frame, matching the
// original exactly (a single cheap noise-write pass; real GPUs handle this at 60fps).
const GRID_SIZE = 200

interface CloudVolumeProps {
  threshold: number
  opacity: number
  range: number
  steps: number
  animationSpeed: number
}

function CloudVolume({ threshold, opacity, range, steps, animationSpeed }: CloudVolumeProps) {
  const rawRenderer = useThree((s) => s.renderer)
  // Cast: useThree types renderer as the WebGL/WebGPU union even on the `/webgpu`
  // entry (fiber typing gap, UPSTREAM.md B9) — `.compute()` exists only on WebGPURenderer.
  const renderer = rawRenderer as WebGPURenderer

  const { uThreshold, uOpacity, uRange, uSteps, uAnimSpeed } = useUniforms(
    { uThreshold: threshold, uOpacity: opacity, uRange: range, uSteps: steps, uAnimSpeed: animationSpeed },
    'computeTexture3d', // WGSL-identifier rule: camelCase scope, never kebab-case
  )
  // Casts: fiber's `UniformNode<T>` pins the TSL node-type param to `unknown`
  // (documented fiber typing gap — see volume-cloud et al.).
  const uThresholdNode = uThreshold as unknown as Node<'float'>
  const uOpacityNode = uOpacity as unknown as Node<'float'>
  const uRangeNode = uRange as unknown as Node<'float'>
  const uStepsNode = uSteps as unknown as Node<'float'>
  const uAnimSpeedNode = uAnimSpeed as unknown as Node<'float'>

  // Cast at the boundary: fiber's `StorageLike` union misses `Storage3DTexture`
  // even though the compute docs show one being stored (fiber typing gap — the
  // runtime handles it fine; same gap as volume-fire's createStorage3D, B19).
  //
  // Lazy useState, NOT useMemo: this instance is captured by the useNodes creator's
  // closure below, which only ever runs ONCE — a StrictMode re-run of a useMemo can
  // hand the component a DIFFERENT texture instance than the one the compute kernel
  // already targets (AGENTS.md's non-node-instance rule, pattern:
  // compute-particles-snow).
  const [cloudTexture] = useState<StorageTexture>(() => {
    const tex = new Storage3DTexture(GRID_SIZE, GRID_SIZE, GRID_SIZE)
    tex.generateMipmaps = false
    tex.name = 'cloud'
    return tex as unknown as StorageTexture
  })

  // ROOT-LEVEL useNodes on purpose (UPSTREAM.md B16): a scoped call would name entries
  // `${scope}.${name}`, and the raymarch material's texture-sample node reaches WGSL
  // codegen.
  const { computeNode, colorNode } = useNodes(() => {
    // Zero-arg Fn closing over cloudTexture directly — see header DIVERGENCE (the
    // original threads it through an object-destructured Fn param instead).
    const computeCloud = Fn(() => {
      const scale = 0.05
      const id = instanceIndex

      const x = id.mod(GRID_SIZE)
      const y = id.div(GRID_SIZE).mod(GRID_SIZE)
      const z = id.div(GRID_SIZE * GRID_SIZE)

      const coord3d = vec3(x, y, z)
      const centered = coord3d.sub(GRID_SIZE / 2).div(GRID_SIZE)
      const d = centered.length().oneMinus()

      const noiseCoord = coord3d.mul(scale / 1.5).add(time.mul(uAnimSpeedNode))
      const noise = mx_noise_vec3(noiseCoord).toConst('noise')
      const data = noise.mul(d).mul(d).toConst('data')

      textureStore(cloudTexture, vec3(x, y, z), vec4(vec3(data.x), 1.0))
    })

    const map = texture3D(cloudTexture, null, 0)

    const raymarchCloud = Fn(() => {
      const finalColor = vec4(0).toVar()

      RaymarchingBox(uStepsNode, ({ positionRay }) => {
        const mapValue = map.sample(positionRay.add(0.5)).r.toVar()

        mapValue.assign(
          smoothstep(uThresholdNode.sub(uRangeNode), uThresholdNode.add(uRangeNode), mapValue).mul(uOpacityNode),
        )

        const shading = map.sample(positionRay.add(vec3(-0.01))).r.sub(map.sample(positionRay.add(vec3(0.01))).r)
        const col = shading.mul(4.0).add(positionRay.x.add(positionRay.y).mul(0.5)).add(0.3)

        finalColor.rgb.addAssign(finalColor.a.oneMinus().mul(mapValue).mul(col))
        finalColor.a.addAssign(finalColor.a.oneMinus().mul(mapValue))

        If(finalColor.a.greaterThanEqual(0.95), () => {
          Break()
        })
      })

      return finalColor
    })

    return {
      computeNode: computeCloud().compute(GRID_SIZE * GRID_SIZE * GRID_SIZE),
      colorNode: raymarchCloud(),
    }
  })

  useFrame(
    () => {
      renderer.compute(computeNode)
    },
    { phase: 'update' },
  )

  return (
    <mesh rotation-y={Math.PI / 2}>
      <boxGeometry args={[10, 10, 10]} />
      <nodeMaterial colorNode={colorNode} side={BackSide} transparent />
    </mesh>
  )
}

function Sky() {
  // 1x32 vertical gradient painted on a 2D canvas — ported verbatim from volume-cloud.
  const skyMap = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 32

    const context = canvas.getContext('2d')
    if (context) {
      const gradient = context.createLinearGradient(0, 0, 0, 32)
      gradient.addColorStop(0.0, '#014a84')
      gradient.addColorStop(0.5, '#0561a0')
      gradient.addColorStop(1.0, '#437ab6')
      context.fillStyle = gradient
      context.fillRect(0, 0, 1, 32)
    }

    const map = new CanvasTexture(canvas)
    map.colorSpace = SRGBColorSpace
    return map
  }, [])

  return (
    <mesh>
      <sphereGeometry args={[10]} />
      <meshBasicNodeMaterial map={skyMap} side={BackSide} />
    </mesh>
  )
}

export default function ComputeTexture3D() {
  const { threshold, opacity, range, steps, animationSpeed } = useControls('compute-texture-3d', {
    threshold: { value: 0.08, min: 0, max: 1, step: 0.01 },
    opacity: { value: 0.08, min: 0, max: 1, step: 0.01 },
    range: { value: 0.1, min: 0, max: 1, step: 0.01 },
    steps: { value: 100, min: 0, max: 200, step: 1 },
    animationSpeed: { value: 1, min: 0, max: 3, step: 0.05, label: 'animation speed' },
  })

  return (
    <Canvas
      // Original renders with the WebGPURenderer default (no tone mapping) — explicit
      // here because fiber's Canvas defaults to ACESFilmic (see header DIVERGENCE).
      renderer={{ toneMapping: NoToneMapping }}
      camera={{ position: [0, 1, 1.5], fov: 60, near: 0.1, far: 100 }}
    >
      <Sky />
      <CloudVolume threshold={threshold} opacity={opacity} range={range} steps={steps} animationSpeed={animationSpeed} />
      <DemoHelpers grid={false} />
    </Canvas>
  )
}

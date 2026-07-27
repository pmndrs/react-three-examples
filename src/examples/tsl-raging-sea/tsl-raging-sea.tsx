/**
 * tsl-raging-sea
 * R3F port of three.js `webgpu_tsl_raging_sea`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_tsl_raging_sea (~160 lines of JS)
 *
 * DEMONSTRATES
 * - Bruno Simon's "raging sea" authored entirely in TSL on one
 *   `MeshStandardNodeMaterial` (Sea.tsx): `positionNode` displaces a 256x256-segment
 *   plane with two crossed sines (large swell) minus a fractal stack of
 *   `mx_noise_float` octaves (small chop), animated by the TSL `time` built-in —
 *   zero per-frame JS
 * - `normalNode` rebuilt from two neighbour elevation taps (finite differences →
 *   `cross` → `transformNormalToView`), so real lights track the displaced surface —
 *   the same shared-elevation-Fn trick as tsl-procedural-terrain, here with the
 *   tap shift itself a live uniform (`normalComputeShift`)
 * - `emissiveNode` as an elevation-driven ramp: `remap(high, low).pow(power)` runs
 *   REVERSED so wave troughs glow (light through thin water), giving the stormy
 *   pink-on-violet look without any extra light
 * - Build-time vs run-time in practice: the small-wave octave count is a uniform
 *   driving `Loop({ type: 'float', end: uSmallIterations, condition: '<=' })` — every
 *   leva knob (iterations included) mutates GPU uniforms live, no shader rebuilds
 * - `useUniforms` create-or-update semantics for the wave/emissive knobs, next to the
 *   leva → plain-material-accessor pattern for `color`/`roughness` (ordinary Standard
 *   fields need no uniform plumbing)
 *
 * DIVERGENCE from original
 * - `renderer.inspector.createParameters` GUI (Inspector addon) replaced with leva
 *   (same parameters, ranges, and defaults; emissive/waves folders); the Inspector
 *   overlay is dropped repo-wide
 * - `largeWavesFrequency` `uniform(vec2)` split into two float uniforms
 *   (`largeFrequencyX`/`largeFrequencyY`) — the original's GUI already exposes the
 *   axes as separate sliders, and per-axis floats keep the useUniforms record flat
 * - The `normalComputeShift.negate()` z-tap becomes `.sub(vec3(0, 0, shift))` — same
 *   math, avoids negating a uniform node
 * - `useUniforms`' `UniformNode<T>` pins its TSL type param to `unknown`, and Fn's
 *   destructured params are untyped (fiber gap + UPSTREAM.md B10) — cast to
 *   `Node<'float'|'vec3'>` with comments, same family as the galaxy/terrain ports
 * - OrbitControls → DemoHelpers' camera-controls baseline (same `target.y = -0.25`,
 *   `minDistance`/`maxDistance` 0.1/50); grid disabled — it would slice through the
 *   sea surface at y=0
 * - Camera far plane 10 → 100: the original's far plane clips the scene well before
 *   its own controls' maxDistance of 50
 * - `renderer={{ toneMapping: NoToneMapping }}`: the original renders with the
 *   WebGPURenderer default (no tone mapping); fiber's Canvas defaults to ACESFilmic,
 *   which visibly mutes the emissive glow — verified side-by-side against the live
 *   original
 * - Split into a folder (this file + Sea.tsx): the single-file port runs past the
 *   ~200-line threshold — split by scene role (page shell/light/controls vs the sea
 *   node graph, which needs fiber hooks and so must live inside `<Canvas>`)
 */
import { Canvas } from '@react-three/fiber/webgpu'
import { folder, useControls } from 'leva'
import { NoToneMapping } from 'three/webgpu'
import { DemoHelpers } from '../../utils/DemoHelpers'
import { Sea } from './Sea'

export default function TslRagingSea() {
  const { color, roughness, ...params } = useControls('tsl-raging-sea', {
    color: '#271442',
    roughness: { value: 0.15, min: 0, max: 1, step: 0.001 },
    emissive: folder({
      emissiveColor: { value: '#ff0a81', label: 'color' },
      emissiveLow: { value: -0.25, min: -1, max: 0, step: 0.001, label: 'low' },
      emissiveHigh: { value: 0.2, min: 0, max: 1, step: 0.001, label: 'high' },
      emissivePower: { value: 7, min: 1, max: 10, step: 1, label: 'power' },
    }),
    waves: folder({
      largeSpeed: { value: 1.25, min: 0, max: 5 },
      largeMultiplier: { value: 0.15, min: 0, max: 1 },
      largeFrequencyX: { value: 3, min: 0, max: 10 },
      largeFrequencyY: { value: 1, min: 0, max: 10 },
      smallIterations: { value: 3, min: 0, max: 5, step: 1 },
      smallFrequency: { value: 2, min: 0, max: 10 },
      smallSpeed: { value: 0.3, min: 0, max: 1 },
      smallMultiplier: { value: 0.18, min: 0, max: 1 },
      normalComputeShift: { value: 0.01, min: 0, max: 0.1, step: 0.0001 },
    }),
  })

  return (
    <Canvas
      // NoToneMapping matches the original (WebGPURenderer default) — fiber's Canvas
      // defaults to ACESFilmic, which mutes the emissive magenta glow this example
      // is built around.
      renderer={{ toneMapping: NoToneMapping }}
      background="#000000"
      camera={{ position: [1.25, 1.25, 1.25], fov: 50, near: 0.1, far: 100 }}
    >
      <directionalLight color="#ffffff" intensity={3} position={[-4, 2, 0]} />

      <Sea color={color} roughness={roughness} {...params} />

      <DemoHelpers grid={false} target={[0, -0.25, 0]} minDistance={0.1} maxDistance={50} />
    </Canvas>
  )
}

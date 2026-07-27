/**
 * mirror
 * R3F port of three.js `webgpu_mirror`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_mirror (~200 lines of JS)
 *
 * DEMONSTRATES
 * - TWO TSL `reflector()` nodes in one scene: a ground mirror masked by a decal's
 *   alpha channel (`texture(decal).a.mix(white, reflector)`) and a vertical
 *   blue-tinted mirror (`color.mul(0.1).add(reflector)`) — each reflector's `target`
 *   childed to its plane declaratively via `<primitive>`, inheriting the plane's
 *   transform exactly like the original's `plane.add(reflector.target)`
 * - Perturbing `reflector.uvNode` with normal-map-derived UV offsets whose strength
 *   is a live fiber `useUniforms` uniform (the original bakes the two scales in as
 *   constants) — procedural "rippled mirror" distortion with zero graph rebuilds
 * - The classic Phong mirror-room setup: emissive Phong sculpture, decay-0 point
 *   lights far outside the room bleeding color through the walls
 * - Declarative nested-mesh transforms replicating the original's imperative
 *   `rotateX()`/`rotateZ()` chains (Euler XYZ order = intrinsic X-then-Z when Y is 0)
 *
 * DIVERGENCE from original
 * - `OrbitControls` replaced by DemoHelpers' camera-controls (same target (0,40,0)
 *   and 10–400 dolly range); grid disabled — the decal-masked mirror floor IS the
 *   ground plane this example is about
 * - `renderer.inspector = new Inspector()` and the reflectors' `.toInspector()`
 *   labels dropped — this repo doesn't wire the Inspector RootState slot yet (same
 *   gap noted in `reflection` and `postprocessing-bloom-emissive`)
 * - Ground/wall normal-perturbation strengths (-0.08 / 0.1 hardcoded upstream) are
 *   leva sliders flowing through `useUniforms`, and the animation gained a `speed`
 *   slider; the original exposes zero user-facing parameters
 * - Animation retimed from `Date.now()`-based timers and per-frame increments to a
 *   delta-accumulated clock (frame-rate independent; identical motion at 60 fps)
 * - Tone mapping set to explicit `NoToneMapping`: parity with the original, which
 *   runs the WebGPURenderer default — fiber's Canvas would otherwise silently apply
 *   ACESFilmic and mute the emissive Phong palette (AGENTS.md v0.9 rule)
 */
import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber/webgpu'
import { useControls } from 'leva'
import { NoToneMapping } from 'three/webgpu'
import { DemoHelpers } from '../../utils/DemoHelpers'
import { Room } from './Room'
import { Spheres } from './Spheres'

export default function Mirror() {
  const { groundDistortion, wallDistortion, speed } = useControls('mirror', {
    groundDistortion: { value: -0.08, min: -0.3, max: 0.3, step: 0.005 },
    wallDistortion: { value: 0.1, min: 0, max: 0.3, step: 0.005 },
    speed: { value: 1, min: 0, max: 3, step: 0.05 },
  })

  return (
    <Canvas
      // Original runs the WebGPURenderer default (NoToneMapping) — deliberate, see header.
      renderer={{ toneMapping: NoToneMapping }}
      background="#000000"
      camera={{ position: [0, 75, 160], fov: 45, near: 1, far: 500 }}
    >
      {/* Room point lights: the original's decay-0 lights (physically off, look-critical).
          The three colored ones sit far OUTSIDE the room and tint the walls they face. */}
      <pointLight color="#e7e7e7" intensity={2.5} distance={250} decay={0} position={[0, 60, 0]} />
      <pointLight color="#00ff00" intensity={0.5} distance={1000} decay={0} position={[550, 50, 0]} />
      <pointLight color="#ff0000" intensity={0.5} distance={1000} decay={0} position={[-550, 50, 0]} />
      <pointLight color="#bbbbfe" intensity={0.5} distance={1000} decay={0} position={[0, 50, 550]} />

      {/* B17 gate: the Room suspends on its three hotlinked textures. */}
      <Suspense fallback={null}>
        <Room groundDistortion={groundDistortion} wallDistortion={wallDistortion} />
      </Suspense>
      <Spheres speed={speed} />

      <DemoHelpers grid={false} target={[0, 40, 0]} minDistance={10} maxDistance={400} />
    </Canvas>
  )
}

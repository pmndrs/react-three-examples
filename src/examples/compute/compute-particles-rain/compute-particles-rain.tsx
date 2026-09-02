/**
 * compute-particles-rain
 * R3F port of three.js `webgpu_compute_particles_rain`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_compute_particles_rain (~250 lines of JS)
 *
 * DEMONSTRATES
 * - GPU particles colliding with LIVE scene geometry: a top-down orthographic
 *   "collision camera" renders the colliders' `positionWorld` into a HalfFloat
 *   RenderTarget every frame (`scene.overrideMaterial` + `renderer.setRenderTarget`
 *   in a `useFrame({ before: 'render' })`, same save/mutate/restore dance as
 *   shadow-contact), and the compute kernel samples that texture as a heightmap —
 *   drops splash on a box you can drag through the rain and on a rotating monkey
 * - three.js layers as a render-pass filter in R3F: colliders `layers.enable(1)`
 *   in a `useLayoutEffect`, the collision camera enables ONLY layer 1, so the
 *   heightmap pass ignores the floor/particles and the main pass sees everything
 * - The compute pattern (per compute-particles): 4 `instancedArray` storage
 *   buffers in `useBuffers`, init/update kernels built once in `useNodes`,
 *   dispatched ONCE from a `useEffect` and PER-FRAME from the same
 *   `before: 'render'` callback that refreshes the heightmap — heightmap render,
 *   compute, main render, in the original's exact order
 * - Impact ripples with zero CPU involvement: on GPU-detected impact the kernel
 *   respawns the drop at the top AND writes the hit point + age into the ripple
 *   buffers; ring shape/opacity are TSL graphs of that age, placed by
 *   `positionNode = positionGeometry.add(buffer.toAttribute())` over a
 *   `mergeGeometries` flat+crossed-quads instance
 * - `billboarding({ position })` as a `vertexNode` for camera-facing rain streaks,
 *   and three's `Mesh.count` as a live draw-count throttle from leva
 *
 * DIVERGENCE from original
 * - Grid off — the near-black floor and the faint additive-looking streaks/ripples
 *   ARE the look here, a grid would wash them out
 * - The box lerp's `t` is clamped to 1: the original's unclamped `10 * delta`
 *   overshoots below ~10 fps, which matters on CI's software rasterizer
 * - `useBuffers`/`useNodes` are UNSCOPED with prefixed keys (fiber's scoped-store
 *   dot separator is WGSL-illegal, UPSTREAM.md B16); the original's
 *   `.setName('Particles')` label is dropped — fiber re-labels stored nodes by key
 */
import { Suspense } from 'react'
import { NoToneMapping } from 'three/webgpu'
import { Canvas } from '@react-three/fiber/webgpu'
import { DemoHelpers } from '../../../utils/DemoHelpers'
import { CollisionBox, Monkey } from './Colliders'
import { Rain } from './Rain'

export default function ComputeParticlesRain() {
  return (
    <Canvas
      renderer={{ toneMapping: NoToneMapping }}
      background="#000000"
      camera={{ position: [40, 8, 0], fov: 60, near: 0.1, far: 110 }}>
      <directionalLight position={[3, 17, 17]} intensity={0.5} />
      <ambientLight color="#111111" />

      {/* Ground: layer 0 only — the collision camera never sees it, so the "empty"
          heightmap reads y=0 (the black clear color), which IS the floor height. */}
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[1000, 1000]} />
        <meshBasicMaterial color="#050505" />
      </mesh>

      {/* Rain renders BEFORE the suspending subtree: its creator-mode
          useBuffers/useNodes write to the fiber store during render, and that
          write must land before a sibling suspension defers it to a pass where
          other components have already subscribed (B18's ordering rule, applied
          at the sibling level). */}
      <Rain />

      <CollisionBox />
      {/* B17 gate: the JSON fetch suspends; letting it reach Canvas's boundary
          re-runs createRoot and freezes every time-driven graph (AGENTS.md). */}
      <Suspense fallback={null}>
        <Monkey />
      </Suspense>

      <DemoHelpers grid={false} minDistance={5} maxDistance={50} />
    </Canvas>
  )
}

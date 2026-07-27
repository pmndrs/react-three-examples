/**
 * compute-particles
 * R3F port of three.js `webgpu_compute_particles`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_compute_particles (~200 lines of JS)
 *
 * DEMONSTRATES
 * - GPU-resident particle state: 200k positions/velocities/colors live in
 *   `instancedArray` storage buffers held by `useBuffers` (create-once,
 *   StrictMode-safe) — after the init dispatch the CPU never touches a particle
 *   (Particles.tsx)
 * - The three dispatch cadences of a compute simulation, side by side:
 *   (1) ONCE at mount — the init kernel, dispatched from a `useEffect` (fiber
 *       awaits `renderer.init()` before children render, so the sync
 *       `renderer.compute()` is safe; StrictMode's double-run is idempotent);
 *   (2) EVERY FRAME — the gravity/bounce step via `renderer.compute()` in a plain
 *       `useFrame({ phase: 'update' })`, which the scheduler runs before the
 *       default render phase. NOT `phase: 'render'` — dispatching compute is not
 *       a render takeover, the default loop still draws;
 *   (3) ON DEMAND — the "hit" kernel dispatched straight from an R3F pointer
 *       handler, no frame-loop involvement at all
 * - Compute kernels built once in `useNodes`: `Fn(() => {...})().compute(count)`,
 *   with a GPU-side `If()` for the floor bounce (run-time branch, not JS `if`)
 * - Rendering storage buffers with zero instance matrices: `SpriteNodeMaterial`
 *   `positionNode = positions.toAttribute()` on a single `<sprite count={N}>`
 *   (`frustumCulled=false` — positions exist only on the GPU, same rule as
 *   tsl-galaxy), `shapeCircle()` opacity + alpha-to-coverage for round points
 * - R3F pointer events replacing the original's manual Raycaster: `event.point`
 *   on an invisible ground plane IS the world-space hit, copied into a TSL
 *   `uniform(Vector3)` right before the hit dispatch
 *
 * DIVERGENCE from original
 * - The original's `renderer.inspector.createParameters` panel becomes leva
 *   (gravity/bounce/friction/size, same defaults and ranges); the Inspector
 *   addon itself is dropped (this repo's shell has no inspector; leva is the panel)
 * - Manual `Raycaster` + `pointermove` listener + `isOrbitControlsActive` flag
 *   (wired to OrbitControls start/end events) becomes an `onPointerMove` handler
 *   on the invisible plane, guarded by `event.buttons !== 0` — any held button
 *   means the pointer is driving camera-controls, so the ripple is skipped
 * - OrbitControls (damping, touch remap) becomes the DemoHelpers/camera-controls
 *   baseline with the original's target (0,-8,0) and dolly limits (5/200)
 * - The original's `GridHelper(90, 45, 0x303030)` becomes the DemoHelpers
 *   infinite grid (corpus baseline furniture)
 * - `useBuffers`/`useNodes` are used UNSCOPED with prefixed keys: scoped entries
 *   get debug-named `${scope}.${name}` by fiber and the dot reaches WGSL
 *   identifiers (storage-buffer struct names here) — runtime shader compile
 *   failure (fiber bug, UPSTREAM.md B16; this port extends its evidence from
 *   useNodes to useBuffers). The original's `.setName('Init Particles')` labels
 *   are dropped for the same reason — fiber re-labels stored nodes by key
 * - Kernel uniforms are fiber `useUniforms` driven by leva instead of module-scope
 *   `uniform()` consts, with the documented `as unknown as Node<'float'>` casts
 *   (fiber UniformNode typing gap). `uClickPos` stays a plain TSL `uniform()`
 *   inside the `useNodes` creator: it is mutated imperatively per pointer event and
 *   a React re-render must never write it back (same rationale as
 *   tsl-procedural-terrain's drag offset)
 * - Split into a folder (this file + Particles.tsx): the single-file port runs
 *   past the ~200-line threshold — split by scene role (page shell/controls vs
 *   the compute pipeline + sprite field, which needs fiber hooks and so must
 *   live inside `<Canvas>`)
 */
import { Canvas } from '@react-three/fiber/webgpu'
import { useControls } from 'leva'
import { DemoHelpers } from '../../utils/DemoHelpers'
import { Particles } from './Particles'

export default function ComputeParticles() {
  const { gravity, bounce, friction, size } = useControls('compute-particles', {
    gravity: { value: -0.00098, min: -0.0098, max: 0, step: 0.0001 },
    bounce: { value: 0.8, min: 0.1, max: 1, step: 0.01 },
    friction: { value: 0.99, min: 0.96, max: 0.99, step: 0.01 },
    size: { value: 0.12, min: 0.12, max: 0.5, step: 0.01 },
  })

  return (
    <Canvas renderer background="#000000" camera={{ position: [0, 5, 20], fov: 50, near: 0.1, far: 1000 }}>
      <Particles gravity={gravity} bounce={bounce} friction={friction} size={size} />
      <DemoHelpers target={[0, -8, 0]} minDistance={5} maxDistance={200} />
    </Canvas>
  )
}

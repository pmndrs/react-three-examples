/**
 * compute-birds
 * R3F port of three.js `webgpu_compute_birds`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_compute_birds (~380 lines of JS)
 *
 * DEMONSTRATES
 * - The classic GPGPU boids flock: 8192 birds whose position/velocity/wing-phase
 *   live in `instancedArray` storage buffers held by `useBuffers` (seeded once
 *   from random CPU arrays — after that the CPU never touches a bird)
 * - An O(N²) neighbour kernel in `useNodes`: TSL `Loop`/`Continue` over all birds
 *   with `If/ElseIf/Else` picking separation / alignment / cohesion per pair —
 *   all run-time GPU branching, driven live by leva-backed `useUniforms`
 * - Two kernels dispatched per frame in `useFrame({ phase: 'update' })` —
 *   velocity (flocking + pointer avoidance + speed limit) then position/phase
 *   integration — via `renderer.compute()` (B9 cast)
 * - A full vertex-stage takeover: base `<nodeMaterial vertexNode>` that flaps the
 *   wing-tip vertices (`vertexIndex` 4/7) by the phase buffer, orients each bird
 *   along its velocity with hand-built `mat3` rotations, and reads THREE storage
 *   buffers in the vertex stage — the original's
 *   `requiredLimits: { maxStorageBuffersInVertexStage: 3 }` forwarded through the
 *   Canvas `renderer` prop
 * - Pointer avoidance as ray → uniforms → kernel: the camera ray is rebuilt once
 *   per frame from the latest pointer NDC and fed to `uniform(Vector3)` pair;
 *   birds within 150 units of the ray line scatter (move the mouse to disturb)
 * - A gradient sky dome from a `varying` vec4 `colorNode`, and plain declarative
 *   `<fog attach="fog">` auto-wrapped into a fog node by the WebGPU renderer
 *
 * DIVERGENCE from original
 * - The original's `renderer.inspector.createParameters` panel becomes leva
 *   (separation/alignment/cohesion, same defaults/ranges/steps); the Inspector
 *   addon is dropped (this repo's shell has no inspector; leva is the panel)
 * - OrbitControls becomes the DemoHelpers/camera-controls baseline (grid off —
 *   the flock wheels in an open sky dome, the original has no ground)
 * - The original's window `pointermove` listener + per-frame manual `Raycaster`
 *   becomes an R3F `onPointerMove` on an invisible low-detail sphere; the handler
 *   only stores `event.pointer` NDC in a ref — the ray is still rebuilt once per
 *   frame and the NDC is parked at y=10 after every step, preserving the
 *   original's "birds are only disturbed while the mouse MOVES" semantics
 * - `InstancedMesh` becomes a plain `<mesh count={BIRDS}>` (rain pattern): the
 *   vertexNode does all placement from storage, no instance matrices exist; the
 *   `matrixAutoUpdate = false` micro-opt is dropped — fiber owns the matrices
 * - The unused `freedom` and `now` uniforms are dropped (the original declares
 *   them but no kernel reads them); `setPBO(true)` calls are dropped — they are
 *   a WebGL2-fallback affordance and this port is WebGPU-only
 * - `useBuffers`/`useNodes` are UNSCOPED with prefixed keys (fiber's scoped-store
 *   dot separator is WGSL-illegal, UPSTREAM.md B16); the original's `.setName()`
 *   labels are dropped — fiber re-labels stored nodes by key
 * - The vertex fn makes the original's implicit mat/vec promotions explicit
 *   (`vec4(position, 1.0)`, `.xyz`) — typed TSL has no mat4×vec3/mat3×vec4
 *   overloads (B10 family); the generated math is identical
 */
import { Canvas } from '@react-three/fiber/webgpu'
import { useControls } from 'leva'
import { NeutralToneMapping } from 'three/webgpu'
import { DemoHelpers } from '../../utils/DemoHelpers'
import { Birds } from './Birds'
import { Sky } from './Sky'

export default function ComputeBirds() {
  const { separation, alignment, cohesion } = useControls('compute-birds', {
    separation: { value: 15, min: 0, max: 100, step: 1 },
    alignment: { value: 20, min: 0, max: 100, step: 0.001 },
    cohesion: { value: 20, min: 0, max: 100, step: 0.025 },
  })

  return (
    <Canvas
      // Tone mapping matches the original's renderer setup exactly (parity rule).
      // The bird vertex stage reads position + velocity + phase storage — the
      // original's requiredLimits forwarded through the renderer prop.
      renderer={{
        toneMapping: NeutralToneMapping,
        requiredLimits: { maxStorageBuffersInVertexStage: 3 },
      }}
      camera={{ position: [0, 0, 1000], fov: 50, near: 1, far: 5000 }}
    >
      {/* Plain Fog set declaratively IS auto-wrapped into a fog node (AGENTS.md). */}
      <fog attach="fog" args={['#ffffff', 700, 3000]} />
      <Sky />
      <Birds separation={separation} alignment={alignment} cohesion={cohesion} />
      <DemoHelpers grid={false} />
    </Canvas>
  )
}

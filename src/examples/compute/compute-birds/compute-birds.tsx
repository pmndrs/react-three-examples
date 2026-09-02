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
 *   integration — via `renderer.compute()`
 * - A full vertex-stage takeover: base `<nodeMaterial vertexNode>` that flaps the
 *   wing-tip vertices (`vertexIndex` 4/7) by the phase buffer, orients each bird
 *   along its velocity with hand-built `mat3` rotations, and reads THREE storage
 *   buffers in the vertex stage — the original's
 *   `requiredLimits: { maxStorageBuffersInVertexStage: 3 }` forwarded through the
 *   Canvas `renderer` prop
 * - Pointer avoidance as ray → uniforms → kernel: the camera ray is rebuilt once
 *   per frame from the latest pointer NDC and fed to a `uniform(Vector3)` pair;
 *   birds within 150 units of the ray line scatter (move the mouse to disturb)
 * - A gradient sky dome from a `varying` vec4 `colorNode`, and plain declarative
 *   `<fog attach="fog">` auto-wrapped into a fog node by the WebGPU renderer
 *
 * DIVERGENCE from original
 * - The original's manual `Raycaster` + window `pointermove` listener becomes an
 *   R3F `onPointerMove` on an invisible low-detail sphere; the handler only
 *   stores `event.pointer` NDC in a ref — the ray is still rebuilt once per frame
 *   and the NDC is parked at y=10 after every step, preserving the original's
 *   "birds are only disturbed while the mouse MOVES" semantics
 * - `InstancedMesh` becomes a plain `<mesh count={BIRDS}>`: the vertexNode does
 *   all placement from storage, no instance matrices exist
 * - The unused `freedom` and `now` uniforms are dropped (the original declares
 *   them but no kernel reads them); `setPBO(true)` calls are dropped — they are
 *   a WebGL2-fallback affordance and this port is WebGPU-only
 */
import { NeutralToneMapping } from 'three/webgpu';
import { Canvas } from '@react-three/fiber/webgpu';
import { DemoHelpers } from '../../../utils/DemoHelpers';
import { Birds } from './Birds';
import { Sky } from './Sky';

export default function ComputeBirds() {
  return (
    <Canvas
      // The bird vertex stage reads position + velocity + phase storage — the
      // original's requiredLimits forwarded through the renderer prop.
      renderer={{
        toneMapping: NeutralToneMapping,
        requiredLimits: { maxStorageBuffersInVertexStage: 3 },
      }}
      camera={{ position: [0, 0, 1000], fov: 50, near: 1, far: 5000 }}>
      {/* Plain Fog set declaratively IS auto-wrapped into a fog node (AGENTS.md). */}
      <fog attach="fog" args={['#ffffff', 700, 3000]} />
      <Sky />
      <Birds />
      <DemoHelpers grid={false} />
    </Canvas>
  );
}

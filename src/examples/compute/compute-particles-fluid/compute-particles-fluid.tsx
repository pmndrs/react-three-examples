/**
 * compute-particles-fluid
 * An MLS-MPM fluid: tens of thousands of particles hand their momentum to a
 * background grid, the grid resolves pressure and viscosity, and the particles take
 * it back — sloshing inside an invisible rounded box you can stir with the pointer.
 * Original: https://threejs.org/examples/#webgpu_compute_particles_fluid
 *
 * DEMONSTRATES
 * - A five-kernel compute pipeline built once in `useNodes` and dispatched in order
 *   from one `useFrame({ phase: 'update' })`: clear grid, particle->grid x2,
 *   grid update, grid->particle
 * - Struct storage buffers from `useBuffers` — `instancedArray(data, struct({…}))`
 *   for the particles (position/velocity/affine matrix C) and an ATOMIC int struct
 *   for the grid, since WebGPU has no float atomics: the transfer kernels
 *   `atomicAdd` fixed-point integers into the cells that many threads share
 * - GPU-computed indirect dispatch: a one-thread kernel writes the workgroup counts
 *   into three `IndirectStorageBufferAttribute`s, and `renderer.compute(kernel,
 *   attribute)` dispatches from them, so the particle-count slider costs one uniform
 *   write and no CPU-side dispatch math
 * - TSL control flow that has to run per thread: `Loop` over the 3x3x3 B-spline
 *   neighbourhood, `If`/`Return` to skip empty cells, `mat3` transpose/strain math
 * - Pointer force from a RAY, not a point: R3F's event carries both the ray and its
 *   plane intersection, and the kernel pushes every particle near the ray line
 * - Vertex-stage storage reads — the particle mesh's `positionNode` offsets one
 *   shared icosahedron by its instance's simulated position, with the original's
 *   `requiredLimits: { maxStorageBuffersInVertexStage: 1 }` forwarded through the
 *   Canvas `renderer` prop
 *
 * DIVERGENCE from original
 * - The particle-count control writes only the uint uniform. The original also sets
 *   `kernel.count` on the three transfer kernels, which the renderer never reads once
 *   a dispatch is indirect (WebGPUBackend.compute returns before the count path).
 * - The UltraHDR environment loads via fiber's `useLoader` INSIDE the sim component,
 *   ordered after its creator hooks: the particle material carries a custom
 *   positionNode, so its first shader build must already see `scene.environment`
 *   (AGENTS.md B15) while creator hooks must precede the suspension (B18).
 */
import { Suspense } from 'react';
import { ACESFilmicToneMapping } from 'three/webgpu';
import { Canvas } from '@react-three/fiber/webgpu';

import { DemoHelpers } from '../../../utils/DemoHelpers';
import { FluidParticles } from './FluidParticles';

export default function ComputeParticlesFluid() {
  return (
    <Canvas
      // Tone mapping matches the original's renderer setup (parity rule);
      // requiredLimits mirrors its constructor — the particle vertex stage reads the
      // particle storage buffer.
      renderer={{
        toneMapping: ACESFilmicToneMapping,
        toneMappingExposure: 1.35,
        requiredLimits: { maxStorageBuffersInVertexStage: 1 },
      }}
      camera={{ position: [-1.3, 1.3, -1.3], fov: 40, near: 0.01, far: 10 }}>
      {/* FluidParticles suspends on the UltraHDR itself, creator hooks first — see
          its header comments (B15 + B18). The scene has no analytic lights: lighting
          is the environment map alone. */}
      <Suspense fallback={null}>
        <FluidParticles />
      </Suspense>

      <DemoHelpers grid={false} minDistance={1} maxDistance={3} maxPolarAngle={Math.PI * 0.35} />
    </Canvas>
  );
}

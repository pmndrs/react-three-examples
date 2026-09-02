/**
 * compute-water
 * A GPU heightfield water simulation: a wave-equation compute pipeline ripples a
 * pool surface that a flock of rubber ducks rides.
 * Original: https://threejs.org/examples/#webgpu_compute_water (~600 lines of JS)
 *
 * DEMONSTRATES
 * - The classic GPGPU heightfield water: ping-pong `instancedArray` height buffers
 *   (A/B + previous step) seeded once from CPU-side simplex noise, two mirrored
 *   wave-equation kernels built in `useNodes` and dispatched on the original's
 *   explicit 2-D shape — `[16, 16]` workgroups, `renderer.compute(kernel, [8, 8, 1])`
 *   — with the read buffer flipped per dispatch by a plain `uniform()` feeding TSL
 *   `select()`, zero shader rebuilds
 * - Vertex-stage storage-buffer reads: the water material's `positionNode` samples
 *   the live heightfield at `vertexIndex` and `normalNode` rebuilds lighting normals
 *   from four neighbour taps (`.toVertexStage()`), with the original's
 *   `requiredLimits: { maxStorageBuffersInVertexStage: 2 }` forwarded through the
 *   Canvas `renderer` prop
 * - Struct storage buffers: `struct({ position: 'vec3', velocity: 'vec2' })` +
 *   `instancedArray(data, DuckStruct)` drive 100 rubber ducks (Draco-compressed
 *   duck.glb via `useGLTF`, one InstancedMesh) that bob on the surface and are
 *   pushed around by the water gradient in their own per-duck kernel
 * - Pointer → uniform → dispatch: press-drag on an invisible interaction plane
 *   drives `mousePos`/`mouseSpeed` uniforms (refreshed per FRAME to keep the
 *   original's speed-decay semantics), and a frame-counter throttle maps the leva
 *   `speed` knob to the original's dispatch-every-`7 - speed`-frames cadence
 * - `controlsRef`'s escape hatch used for more than camera moves: Water disables
 *   orbiting for the duration of a disturb-drag, mirroring the original's
 *   `controls.enabled = false`
 *
 * DIVERGENCE from original
 * - Grid off: the pool floats at y≈0 on the HDR backdrop, and the infinite grid
 *   would slice straight through the water plane
 * - The HDR environment loads via fiber's `useLoader(HDRLoader)` INSIDE Water,
 *   ordered after its compute/material graphs are built — the water/duck materials
 *   carry custom position/normal nodes, so their first shader compile must already
 *   see `scene.environment` (AGENTS.md B15)
 * - duck.glb loads through drei `useGLTF`'s built-in Draco wiring, and the duck
 *   material is REBUILT as an explicit `<meshStandardNodeMaterial>` from the loaded
 *   map/color/roughness/metalness — the original mutates `material.positionNode` on
 *   the GLTF material in place, but loader materials here are core-three classes,
 *   not node materials (see Ducks.tsx)
 */
import { Suspense, useRef } from 'react'
import { ACESFilmicToneMapping } from 'three/webgpu'
import { Canvas } from '@react-three/fiber/webgpu'
import type CameraControlsImpl from 'camera-controls'
import { DemoHelpers } from '../../../utils/DemoHelpers'
import { Water } from './Water'

export default function ComputeWater() {
  // Escape hatch to the live camera-controls instance — Water disables orbiting for
  // the duration of a disturb-drag, like the original's `controls.enabled = false`.
  const controlsRef = useRef<CameraControlsImpl>(null)

  return (
    <Canvas
      // Tone mapping matches the original's renderer setup exactly (parity rule);
      // requiredLimits mirrors its constructor — the water vertex stage reads two
      // storage buffers (height A + B).
      renderer={{
        toneMapping: ACESFilmicToneMapping,
        toneMappingExposure: 0.5,
        requiredLimits: { maxStorageBuffersInVertexStage: 2 },
      }}
      camera={{ position: [0, 2, 4], fov: 75, near: 1, far: 3000 }}>
      <directionalLight position={[-1, 2.6, 1.4]} intensity={4} />

      {/* Water suspends on the HDR itself, after its own creator hooks — see its
          top-of-file comment. */}
      <Suspense fallback={null}>
        <Water controlsRef={controlsRef} />
      </Suspense>

      <DemoHelpers grid={false} controlsRef={controlsRef} />
    </Canvas>
  )
}

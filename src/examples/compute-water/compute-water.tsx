/**
 * compute-water
 * R3F port of three.js `webgpu_compute_water`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_compute_water (~600 lines of JS)
 *
 * DEMONSTRATES
 * - The classic GPGPU heightfield water: ping-pong `instancedArray` height buffers
 *   (A/B + previous step) seeded once from CPU-side simplex noise, two mirrored
 *   wave-equation kernels built in `useNodes` and dispatched on the original's
 *   explicit 2-D shape — `[16, 16]` workgroups, `renderer.compute(kernel, [8, 8, 1])`
 *   (B9 cast) — with the read buffer flipped per dispatch by a plain `uniform()`
 *   feeding TSL `select()`, zero shader rebuilds
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
 *
 * DIVERGENCE from original
 * - The original's `renderer.inspector.createParameters` panel becomes leva (mouse
 *   size/deep, viscosity, speed, ducks, wireframe — same ranges and defaults); the
 *   Inspector addon is dropped (this repo's shell has no inspector; leva is the panel)
 * - OrbitControls becomes the DemoHelpers/camera-controls baseline (grid off — the
 *   pool floats on the HDR backdrop at y≈0, the infinite grid would slice the water
 *   plane); orbiting is suspended through the `controlsRef` escape hatch while
 *   disturbing the water, mirroring the original's `controls.enabled = false`
 * - The original's manual per-frame `Raycaster` over tracked mouse coords becomes
 *   R3F pointer events on the invisible plane; the events only update a ref — the
 *   uniforms are still written once per frame in `useFrame`, preserving the
 *   original's "held-still pointer decays mouseSpeed to zero" behavior
 * - The HDR environment loads via fiber's `useLoader(HDRLoader)` INSIDE the sim
 *   component, ordered after its creator hooks, instead of a drei `<Environment>`
 *   sibling: the water/duck materials carry custom position/normal nodes, so their
 *   first shader build must already see `scene.environment` (AGENTS.md B15) while
 *   creator-hook components must not render after suspending siblings (B18) —
 *   self-suspending after the creator hooks satisfies both at once
 * - duck.glb loads through drei `useGLTF`'s built-in Draco wiring, and the duck
 *   material is REBUILT as an explicit `<meshStandardNodeMaterial>` from the loaded
 *   map/color/roughness/metalness — the original mutates `material.positionNode` on
 *   the GLTF material in place, but loader materials here are core-three classes,
 *   not node materials
 * - `useBuffers`/`useNodes` are UNSCOPED with prefixed keys (fiber's scoped-store
 *   dot separator is WGSL-illegal, UPSTREAM.md B16); the original's `.setName()`
 *   labels are dropped — fiber re-labels stored nodes by key
 * - `frustumCulled={false}` on the duck InstancedMesh: instance placement exists
 *   only in the storage buffer, three's culling sphere is the source duck at origin
 *   (AGENTS.md positionNode rule; the original carries the latent bug)
 * - The wireframe toggle binds material props directly plus a `needsUpdate` bump
 *   (WebGPU pipeline re-key) — the original flips `!wireframe` relative to current
 *   state; neighbour index math runs in float, exact for these indices — typed
 *   TSL has no integer min/max/mod overloads (B10 family), where the original
 *   mixes uint/int and lets TSL insert conversions; `matrixAutoUpdate = false`
 *   micro-opts are dropped — fiber owns the matrices
 */
import { Suspense, useRef } from 'react'
import { Canvas } from '@react-three/fiber/webgpu'
import { useControls } from 'leva'
import type CameraControlsImpl from 'camera-controls'
import { ACESFilmicToneMapping } from 'three/webgpu'
import { DemoHelpers } from '../../utils/DemoHelpers'
import { Water } from './Water'

export default function ComputeWater() {
  const { mouseSize, mouseDeep, viscosity, speed, ducks, wireframe } = useControls('compute-water', {
    mouseSize: { value: 0.12, min: 0.1, max: 0.3, step: 0.001 },
    mouseDeep: { value: 0.5, min: 0.1, max: 1, step: 0.01 },
    viscosity: { value: 0.96, min: 0.9, max: 0.96, step: 0.001 },
    speed: { value: 5, min: 1, max: 6, step: 1 },
    ducks: true,
    wireframe: false,
  })

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
      camera={{ position: [0, 2, 4], fov: 75, near: 1, far: 3000 }}
    >
      <directionalLight position={[-1, 2.6, 1.4]} intensity={4} />

      {/* Water suspends on the HDR itself, creator hooks first — see its header
          comments (B15 + B18) and the DIVERGENCE block above. */}
      <Suspense fallback={null}>
        <Water
          mouseSize={mouseSize}
          mouseDeep={mouseDeep}
          viscosity={viscosity}
          speed={speed}
          ducksEnabled={ducks}
          wireframe={wireframe}
          controlsRef={controlsRef}
        />
      </Suspense>

      <DemoHelpers grid={false} controlsRef={controlsRef} />
    </Canvas>
  )
}

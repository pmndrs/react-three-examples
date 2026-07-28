/**
 * compute-cloth
 * R3F port of three.js `webgpu_compute_cloth`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_compute_cloth (~540 lines of JS)
 *
 * DEMONSTRATES
 * - GPGPU verlet cloth: two compute kernels built once in `useNodes` — a per-SPRING
 *   force pass (Hooke's law over rest length) and a per-VERTEX integration pass
 *   (spring accumulation via a dynamic uint `Loop` over a flattened adjacency list,
 *   gravity, `triNoise3D` wind, sphere collision) — over seven `instancedArray`
 *   storage buffers from `useBuffers`
 * - Fixed-timestep sub-stepping: a `useFrame({ phase: 'update' })` accumulator runs
 *   the sim at 360 steps/s regardless of refresh rate, dispatching BOTH kernels per
 *   step via `renderer.compute()` (B9 cast) and mutating the sphere-position
 *   uniform per STEP, not per frame
 * - GPU-side control flow: `If(isFixed, () => Return())` early-out for pinned
 *   vertices, `select()` for spring force direction, uvec swizzles as storage indices
 * - Vertex-stage storage reads: the cloth's `positionNode` centres each render
 *   vertex on its 4 verlet vertices via a `uvec4` `attribute('vertexIds')`, and
 *   `normalNode` rebuilds lighting normals from the tangent x bitangent cross
 *   (`.toVertexStage()`), with the original's `requiredLimits:
 *   { maxStorageBuffersInVertexStage: 1 }` forwarded through the Canvas `renderer` prop
 * - Debug wireframe: verlet vertices as a `Mesh.count`-instanced SpriteNodeMaterial
 *   quad, springs as an InstancedBufferGeometry `Line` whose positionNode
 *   dereferences each spring's endpoints from the storage buffers
 *
 * DIVERGENCE from original
 * - The `renderer.inspector.createParameters` panel becomes leva (stiffness,
 *   wireframe, sphere, wind + the material folder: color, roughness, sheen,
 *   sheenRoughness, sheenColor — same ranges and defaults); the Inspector addon is
 *   dropped (this repo's shell has no inspector; leva is the panel)
 * - OrbitControls becomes the DemoHelpers/camera-controls baseline with the
 *   original's target and 1-3 dolly range; grid off — the cloth hangs in mid-air
 *   against the HDR backdrop, a ground grid would be scenery the original lacks
 * - The UltraHDR environment loads via fiber's `useLoader(UltraHDRLoader)` INSIDE
 *   the sim component, ordered after its creator hooks: custom-node materials in
 *   this unlit scene must see `scene.environment` on their first shader build
 *   (AGENTS.md B15) while creator hooks must precede the suspension (B18) — the
 *   original simply awaits the loader before building anything
 * - The original's `Fn(({ material }) => …)` positionNode mutates
 *   `material.normalNode` from inside the position graph; here the normal is a
 *   standalone `normalNode` graph with the same four taps and `.toVertexStage()`
 *   (compute-water's pattern) — declarative material props over mid-build mutation
 * - `.setPBO(true)` calls are dropped — they only matter for the WebGL fallback,
 *   which the original itself marks broken ("TODO: Fix example with WebGL
 *   backend"); this port is WebGPU-only
 * - The spring force buffer allocates `springCount` vec3 elements, not the
 *   original's `springCount * 3` over-allocation (only `springCount` are indexed)
 * - `useBuffers`/`useNodes` are UNSCOPED with prefixed keys (fiber's scoped-store
 *   dot separator is WGSL-illegal, UPSTREAM.md B16); the original's `.setName()`
 *   labels are dropped — fiber re-labels stored nodes by key
 * - `THREE.Timer` + the setAnimationLoop accumulator becomes the same 360 steps/s
 *   accumulator off `useFrame`'s `state.delta`, with the original's 1/60 clamp
 */
import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber/webgpu'
import { useControls } from 'leva'
import { NeutralToneMapping } from 'three/webgpu'
import { DemoHelpers } from '../../utils/DemoHelpers'
import { Cloth } from './Cloth'

export default function ComputeCloth() {
  const { stiffness, wireframe, sphere, wind } = useControls('compute-cloth', {
    stiffness: { value: 0.2, min: 0.1, max: 0.5, step: 0.01 },
    wireframe: false,
    sphere: true,
    wind: { value: 1, min: 0, max: 5, step: 0.1 },
  })

  const { color, roughness, sheen, sheenRoughness, sheenColor } = useControls('material', {
    color: '#204080',
    roughness: { value: 1, min: 0, max: 1, step: 0.01 },
    sheen: { value: 1, min: 0, max: 1, step: 0.01 },
    sheenRoughness: { value: 0.5, min: 0, max: 1, step: 0.01 },
    sheenColor: '#ffffff',
  })

  return (
    <Canvas
      // Tone mapping matches the original's renderer setup (parity rule);
      // requiredLimits mirrors its constructor — the cloth vertex stage reads the
      // verlet position storage buffer.
      renderer={{
        toneMapping: NeutralToneMapping,
        requiredLimits: { maxStorageBuffersInVertexStage: 1 },
      }}
      camera={{ position: [-1.6, -0.1, -1.6], fov: 40, near: 0.01, far: 10 }}
    >
      {/* Cloth suspends on the UltraHDR itself, creator hooks first — see its
          header comments (B15 + B18) and the DIVERGENCE block above. The scene has
          no analytic lights: lighting is the environment map alone. */}
      <Suspense fallback={null}>
        <Cloth
          stiffness={stiffness}
          wind={wind}
          sphereEnabled={sphere}
          wireframe={wireframe}
          color={color}
          roughness={roughness}
          sheen={sheen}
          sheenRoughness={sheenRoughness}
          sheenColor={sheenColor}
        />
      </Suspense>

      <DemoHelpers grid={false} target={[0, -0.1, 0]} minDistance={1} maxDistance={3} />
    </Canvas>
  )
}

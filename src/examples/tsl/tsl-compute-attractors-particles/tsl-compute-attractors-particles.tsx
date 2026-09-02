/**
 * tsl-compute-attractors-particles
 * R3F port of three.js `webgpu_tsl_compute_attractors_particles`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_tsl_compute_attractors_particles (~280 lines of JS)
 *
 * DEMONSTRATES
 * - A 262k-particle Lorenz-style attractor field where the CPU never touches a
 *   particle: positions/velocities live in `instancedArray` storage buffers held
 *   by `useBuffers`; two compute kernels built once in `useNodes` do everything
 *   (AttractorParticles.tsx)
 * - Two of the compute dispatch cadences side by side: the init kernel ONCE from
 *   a `useEffect` (re-dispatched on the leva Reset button via a counter state),
 *   the physics step EVERY FRAME via `renderer.compute()` in
 *   `useFrame({ phase: 'update' })`
 * - `uniformArray` as GPU-indexable per-attractor state: a TSL `Loop` over the
 *   attractor count reads `.element(i)` for position and rotation axis; the
 *   array's Vector3s are LIVE, so a leva change is one `Vector3.set()` away from
 *   the shader — no rebuild
 * - N-body-ish forces in TSL: inverse-square gravity plus an axis-crossed
 *   "spinning" force per attractor, a GPU `If()` speed clamp (run-time branch,
 *   not JS `if`), velocity damping, and a `mod()` wrap-around bounding box
 * - Rendering storage buffers with `SpriteNodeMaterial`: `positionNode =
 *   positions.toAttribute()`, additive-blended speed-ramped color
 *   (`mix(colorA, colorB, speed)`), and a per-particle mass multiplier shared
 *   between the physics kernel and the sprite `scaleNode`
 *
 * DIVERGENCE from original
 * - The per-attractor TransformControls gizmos (translate/rotate modes + the
 *   `controlsMode` dropdown) become direct leva x/y/z position controls per
 *   attractor; the rotation axes stay fixed at the original's defaults. The
 *   ring + arrow helper meshes are kept, rebuilt declaratively
 *   (AttractorHelpers.tsx), with the original's `helperVisible` toggle
 * - `attractorsLength` uint uniform → build-time constant (3): with gizmos gone
 *   the attractor count can't change at runtime, so the Loop bound is baked
 * - Added a `timeScale` slider — the original declares the uniform but never
 *   exposes it (handy as a slow-motion/pause control)
 * - Ambient + directional lights dropped: every material in the scene is unlit
 *   (additive sprite color graph, MeshBasicMaterial helpers) — they had no
 *   visible effect in the original either
 * - `InstancedMesh` + `PlaneGeometry` becomes `<sprite count>` (same
 *   SpriteNodeMaterial path, less boilerplate), with `frustumCulled=false` —
 *   positions exist only on the GPU (same rule as tsl-galaxy/compute-particles)
 * - Kernel uniforms are fiber `useUniforms` driven by leva instead of module-scope
 *   `uniform()` consts. `useBuffers`/`useNodes` are UNSCOPED with prefixed keys
 *   (fiber's scoped `${scope}.${name}` debug names are WGSL-illegal, UPSTREAM.md
 *   B16), which also drops the original's `.setName('Update Particles')` — fiber
 *   re-labels stored nodes by key
 * - OrbitControls becomes the DemoHelpers/camera-controls baseline with the
 *   original's dolly limits (0.1/50); grid off (particles float in a black void)
 */
import { Canvas } from '@react-three/fiber/webgpu';
import { useControls } from 'leva';

import { DemoHelpers } from '../../../utils/DemoHelpers';
import { ATTRACTOR_DEFAULT_POSITIONS } from './attractors';
import { AttractorHelpers } from './AttractorHelpers';
import { AttractorParticles } from './AttractorParticles';

const [defaultA, defaultB, defaultC] = ATTRACTOR_DEFAULT_POSITIONS;

export default function TslComputeAttractorsParticles() {
  // Attractor positions are consumed by BOTH AttractorParticles (the uniformArray)
  // and AttractorHelpers (the gizmo meshes) — a genuine shared value, so it stays
  // here rather than being duplicated in either child. `particles`' own knobs live
  // next to AttractorParticles, the only thing that reads them.
  const { attractor1, attractor2, attractor3, helpers } = useControls('attractors', {
    attractor1: { value: { x: defaultA.x, y: defaultA.y, z: defaultA.z }, step: 0.1 },
    attractor2: { value: { x: defaultB.x, y: defaultB.y, z: defaultB.z }, step: 0.1 },
    attractor3: { value: { x: defaultC.x, y: defaultC.y, z: defaultC.z }, step: 0.1 },
    helpers: true,
  });

  const attractorPositions = [attractor1, attractor2, attractor3];

  return (
    <Canvas renderer background="#000000" camera={{ position: [3, 5, 8], fov: 25, near: 0.1, far: 100 }}>
      <AttractorParticles attractorPositions={attractorPositions} />
      <AttractorHelpers positions={attractorPositions} visible={helpers} />
      <DemoHelpers grid={false} minDistance={0.1} maxDistance={50} />
    </Canvas>
  );
}

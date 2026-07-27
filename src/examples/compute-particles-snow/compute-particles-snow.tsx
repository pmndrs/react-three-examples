/**
 * compute-particles-snow
 * R3F port of three.js `webgpu_compute_particles_snow`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_compute_particles_snow (~300 lines of JS)
 *
 * DEMONSTRATES
 * - GPU snow accumulation via two storage buffers: falling flakes integrate in
 *   `snowPositions` while a kernel-side `If().Else()` freezes landed flakes into
 *   `snowStaticPositions` — the settled copies feed back into the collision height
 *   map, so snow stacks on snow (SnowParticles.tsx)
 * - GPU collision against the whole scene: a top-down orthographic camera renders
 *   world-height (`scene.overrideMaterial` with `colorNode = positionWorld.y`) into
 *   a RedFormat RenderTarget every frame in `useFrame({ phase: 'update' })`, and the
 *   update kernel samples that texture to decide each flake's landing height — the
 *   WebGPU renderer transfers each material's `positionNode` onto the override
 *   material, which is what lets the instanced settled flakes raise the map
 * - three.js layers as render-pass routing: falling flakes on layer 2 (main camera
 *   only), settled flakes on layer 1 (collision camera only), scenery on layer 0
 *   (both) — wired declaratively with fiber `layers-mask` dash-path props
 * - Instanced drawing straight from storage buffers: plain `<mesh count={100000}>`
 *   with `positionNode = positionLocal.mul(scale).add(buffer.toAttribute())`
 *   (`frustumCulled=false` — positions exist only on the GPU)
 * - `useRenderPipeline` composing the scene pass with an additive half-res gaussian
 *   soft-focus, a vignette, and a separate `pass(teapotMesh, camera)` object pass
 *   blurred/boosted into the tree-topper's glow (SnowPostFX.tsx)
 * - Compute dispatch cadences side by side: init ONCE at mount and ON DEMAND from a
 *   leva reset button (one nonce-keyed effect covers both), simulation stepped
 *   PER-FRAME right after the collision pre-pass
 *
 * DIVERGENCE from original
 * - The original has no GUI (only the Inspector addon): leva adds `driftSpeed`
 *   (the original's hard-coded `speed = .4` wobble constant, now uniform-driven),
 *   `fallSpeed` (multiplier on the per-flake fall velocity, original ×1), and a
 *   "reset snow" button that re-dispatches the init kernel
 * - The Inspector addon and all `.toInspector()` tags are dropped — this repo's
 *   shell has no inspector; leva is the panel
 * - OrbitControls (target (0,10,0), dolly 25–35, maxPolarAngle π/1.7, autoRotate
 *   −0.7) becomes the DemoHelpers/camera-controls baseline with the same limits;
 *   grid disabled — the scene has its own fading snowy floor
 * - `useBuffers`/`useNodes` are used UNSCOPED with prefixed keys (fiber scoped-store
 *   WGSL bug, UPSTREAM.md B16); the original's `.setName('Init Particles')` labels
 *   are dropped — fiber names stored nodes by key
 * - The floor rotates the MESH instead of baking `rotateX` into the geometry
 *   (StrictMode would double-rotate an onUpdate mutation), so its radial opacity
 *   mask reads `positionLocal.xy` instead of `.xz` — identical result
 * - The landing-height sample takes `.x` of the RedFormat texel explicitly; the
 *   original compares `position.y` against the raw vec4 sample and lets TSL
 *   broadcasting resolve it — same value
 * - `renderer={{ toneMapping: ACESFilmicToneMapping }}` written explicitly (corpus
 *   tone-mapping rule); it matches both the original and fiber's default
 * - Split into a folder (page shell / SnowParticles compute+collision / SnowScenery /
 *   SnowPostFX) — the single file would far exceed the ~200-line threshold
 */
import { useState } from 'react'
import { Canvas } from '@react-three/fiber/webgpu'
import { button, useControls } from 'leva'
import { TeapotGeometry } from 'three/addons/geometries/TeapotGeometry.js'
import { ACESFilmicToneMapping, Mesh, MeshBasicNodeMaterial } from 'three/webgpu'
import { DemoHelpers } from '../../utils/DemoHelpers'
import { SnowParticles } from './SnowParticles'
import { SnowPostFX } from './SnowPostFX'
import { SnowScenery } from './SnowScenery'

export default function ComputeParticlesSnow() {
  // The glowing tree-topper. Created imperatively — lazy useState keeps ONE instance
  // across StrictMode's double render — because two consumers need the same object:
  // the scene mounts it via <primitive>, and SnowPostFX feeds it to pass() for the
  // standalone glow pass.
  const [teapot] = useState(() => {
    const mesh = new Mesh(new TeapotGeometry(0.5, 18), new MeshBasicNodeMaterial({ color: 0xfcfb9e }))
    mesh.position.y = 18
    return mesh
  })

  const [resetNonce, setResetNonce] = useState(0)
  const { driftSpeed, fallSpeed } = useControls('compute-particles-snow', {
    driftSpeed: { value: 0.4, min: 0, max: 2, step: 0.01 },
    fallSpeed: { value: 1, min: 0, max: 5, step: 0.05 },
    'reset snow': button(() => setResetNonce((nonce) => nonce + 1)),
  })

  return (
    <Canvas
      // The original sets ACESFilmic explicitly — same as fiber's Canvas default,
      // but the corpus rule is to decide tone mapping deliberately on every port.
      renderer={{ toneMapping: ACESFilmicToneMapping }}
      camera={{ position: [20, 2, 20], fov: 60, near: 0.1, far: 100 }}
    >
      <fog attach="fog" args={['#0f3c37', 5, 40]} />
      <SnowScenery />
      <primitive object={teapot} />
      <SnowParticles driftSpeed={driftSpeed} fallSpeed={fallSpeed} resetNonce={resetNonce} />
      <SnowPostFX teapot={teapot} />
      <DemoHelpers
        grid={false}
        target={[0, 10, 0]}
        minDistance={25}
        maxDistance={35}
        maxPolarAngle={Math.PI / 1.7}
        autoRotate
        autoRotateSpeed={-0.7}
      />
    </Canvas>
  )
}

/**
 * reflection
 * R3F port of three.js `webgpu_reflection`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_reflection (~250 lines of JS)
 *
 * DEMONSTRATES
 * - TSL `reflector()` driving a `MeshPhongNodeMaterial.emissiveNode`: a mirrored render
 *   target sampled through a normal-map-perturbed UV, blended additively onto the
 *   floor's diffuse checkerboard instead of replacing it (`ReflectiveFloor.tsx`)
 * - A fully custom instanced mesh built from raw `instancedBufferAttribute`s (position/
 *   normal/color/packed-size-time-seed) driving `positionNode`/`colorNode`/
 *   `emissiveNode` on one `MeshStandardNodeMaterial` — no `InstancedMesh` class, just
 *   `mesh.count` (three.js's own manual-instancing escape hatch, same pattern as
 *   `skinning-instancing`) (`Tree.tsx`)
 * - A TSL `scene.backgroundNode` gradient (`normalWorldGeometry.y.mix(...)`) in place of
 *   a flat color/HDR Canvas background
 * - `useRenderPipeline` composing a depth-driven `gaussianBlur` with a `screenUV`
 *   vignette via `blendOverlay` into one `outputNode` (`PostFX.tsx`)
 * - Plain `THREE.Fog` set declaratively (`<fog attach="fog">`), auto-wrapped into a fog
 *   node by the WebGPU renderer (Layer 1 fog rule — no custom TSL fog graph needed here)
 *
 * DIVERGENCE from original
 * - TWEEN.js dropped: this repo carries no tween dependency, so the two traveling-pulse
 *   "effector" uniforms (`uniformEffector1/2` in the original) are driven by a
 *   hand-rolled sinusoidal-in-out ramp inside `Tree.tsx`'s `useFrame`, matching the
 *   original's -0.2→1.2 range, 3s period, and 0.8s stagger between the two pulses.
 *   Speed is exposed via leva (`effectorSpeed`) instead of being hardcoded
 * - `OrbitControls`'s `autoRotate` reproduced via DemoHelpers `autoRotate` (prop added
 *   to CameraControls after this port flagged the gap; camera-controls has no built-in
 *   flag, the wrapper increments azimuth at OrbitControls-compatible speed);
 *   min/max dolly distance (1–10) forwarded, orbit/look-at target (0,1,0) matches the
 *   original's `camera.lookAt`/`controls.target`
 * - `renderer.inspector = new Inspector()` dropped — this repo doesn't wire the
 *   Inspector RootState slot yet (same gap noted in `postprocessing-bloom-emissive`)
 * - `scene.backgroundNode` is set through a cast (`SceneBackground` below) —
 *   `@types/three`'s `Scene` interface doesn't declare it, the same documented gap as
 *   `sprites.tsx`'s `fogNode` cast (not a fiber/drei gap, so no UPSTREAM.md entry)
 * - The reflector's `resolutionScale` is fixed at the original's hardcoded 0.2 rather
 *   than exposed via leva: it sizes an internal render target at construction time, so
 *   a live control would mean recreating (and leaking) a GPU render target per change
 * - leva controls added: `effectorSpeed` (traveling-pulse speed) and `vignetteStrength`
 *   (post-process vignette offset, default 0.2 matches the original's hardcoded value).
 *   The original exposes zero user-facing parameters (only OrbitControls plus a
 *   debug-only `Inspector` panel)
 * - DemoHelpers' camera-controls orbit swaps in for `OrbitControls`; grid disabled
 *   (`grid={false}`) — the floor box + its reflection IS the ground plane this example
 *   is about, and an infinite world-space grid at a different height would clash with it
 */
import { Suspense, useEffect } from 'react'
import { Canvas, useThree } from '@react-three/fiber/webgpu'
import { folder, useControls } from 'leva'
import { color, normalWorldGeometry } from 'three/tsl'
import { ACESFilmicToneMapping } from 'three/webgpu'
import type { Node } from 'three/webgpu'
import { DemoHelpers } from '../../utils/DemoHelpers'
import { PostFX } from './PostFX'
import { ReflectiveFloor } from './ReflectiveFloor'
import { Tree } from './Tree'

// Scene-level TSL background gradient (up-facing world normal → horizon color mix).
// Cast: `@types/three`'s `Scene` doesn't declare `backgroundNode` even though the
// webgpu renderer reads it directly off the live scene instance (same duck-typed gap
// as `sprites.tsx`'s `fogNode` cast).
function SceneBackground() {
  const scene = useThree((s) => s.scene)

  useEffect(() => {
    const withBackgroundNode = scene as unknown as { backgroundNode: Node | null }
    withBackgroundNode.backgroundNode = normalWorldGeometry.y.mix(color('#4195a4'), color('#0066ff'))
    return () => {
      withBackgroundNode.backgroundNode = null
    }
  }, [scene])

  return null
}

export default function Reflection() {
  const { effectorSpeed, vignetteStrength } = useControls('reflection', {
    Tree: folder({
      effectorSpeed: { value: 1, min: 0.1, max: 3, step: 0.05 },
    }),
    Post: folder({
      vignetteStrength: { value: 0.2, min: 0, max: 0.6, step: 0.01 },
    }),
  })

  return (
    <Canvas
      renderer={{ toneMapping: ACESFilmicToneMapping }}
      shadows
      camera={{ position: [4, 2, 4], fov: 50, near: 0.25, far: 30 }}
    >
      <fog attach="fog" args={['#4195a4', 1, 20]} />
      <directionalLight
        color="#ffe499"
        intensity={2}
        position={[7, 5, 7]}
        castShadow
        shadow-camera-zoom={1.5}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0001}
      />
      <directionalLight color="#0487e2" intensity={0.5} position={[7, -5, 7]} />
      <SceneBackground />
      <Suspense fallback={null}>
        <ReflectiveFloor />
      </Suspense>
      <Tree effectorSpeed={effectorSpeed} />
      <PostFX vignetteStrength={vignetteStrength} />
      <DemoHelpers grid={false} target={[0, 1, 0]} minDistance={1} maxDistance={10} autoRotate autoRotateSpeed={1} />
    </Canvas>
  )
}

/**
 * reflection-blurred
 * R3F port of three.js `webgpu_reflection_blurred`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_reflection_blurred (~210 lines of JS)
 *
 * DEMONSTRATES
 * - TSL `reflector({ depth: true, bounces: false })` + the `hashBlur` display addon:
 *   the mirror's color is masked by its own depth output inside a `sample()` callback,
 *   hash-blurred, then depth-remapped so the reflection sharpens near contact and
 *   blurs with distance — a roughness-style blurred planar reflection, all inside one
 *   `MeshStandardNodeMaterial.colorNode` (`BlurredFloor.tsx`)
 * - Live reflection knobs: three.js `uniform()` nodes (roughness, blur radius) mutated
 *   from leva effects, plus `reflection.reflector.resolutionScale` mutated directly —
 *   the reflector resizes its render target per frame, so the scale is live-tunable
 * - `PointLight.colorNode` override: the light's color driven by the same animated TSL
 *   ripple-ring graph that colors the floor, so the glow rings actually illuminate
 * - A TSL `scene.backgroundNode` gradient hue-cycled with `time`
 * - `rangeFogFactor(7, 25).oneMinus()` as a distance-falloff OPACITY (fog-as-alpha on a
 *   transparent floor) instead of scene fog
 *
 * DIVERGENCE from original
 * - The Inspector `createParameters` GUI becomes leva: `roughness` (0–1), `radius`
 *   (0–1) and `resolutionScale` (0.25–1) with the original's defaults and ranges
 * - `OrbitControls` becomes DemoHelpers' CameraControls: dolly limits 1–10, polar limit
 *   π/2 and target (0, 0.5, 0) forwarded; autoRotate stays off (commented out in the
 *   original too). Grid disabled — the 50×50 reflective floor IS the ground plane
 * - The original's `drawCircle` TSL `Fn` is a plain node-builder function here: every
 *   call site passes build-time constants, so runtime `Fn` parameters (and the B10
 *   param casts they'd need) buy nothing; its `dist1.assign(fract(...))` step is
 *   inlined into the fract chain
 * - `THREE.Timer` + manual mixer pump dropped — drei's `useAnimations` drives the
 *   mixer from fiber's frame loop (`Michelle.tsx`)
 * - `renderer.inspector = new Inspector()` dropped — this repo doesn't wire the
 *   Inspector RootState slot yet (same gap noted in `reflection`)
 * - `scene.backgroundNode` and `floorLight.colorNode` are set through documented casts
 *   (@types/three doesn't declare either duck-typed field; runtime reads verified —
 *   same B11-family gap as the `reflection` cousin)
 */
import { Suspense, useEffect, useMemo } from 'react'
import { Canvas, useThree } from '@react-three/fiber/webgpu'
import { useControls } from 'leva'
import { useTexture } from '@react-three/drei/webgpu'
import { color, hue, mix, normalWorld, time, vec3 } from 'three/tsl'
import { DoubleSide, NeutralToneMapping, SRGBColorSpace } from 'three/webgpu'
import type { Node } from 'three/webgpu'
import { DemoHelpers } from '../../utils/DemoHelpers'
import { BlurredFloor } from './BlurredFloor'
import { Michelle } from './Michelle'

const UV_GRID_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/uv_grid_directx.jpg'

// Scene-level TSL background: an up-facing world-normal gradient toward deep blue,
// continuously hue-cycled with `time`. Cast: `@types/three`'s `Scene` doesn't declare
// `backgroundNode` even though the WebGPU renderer reads it off the live scene
// instance (same documented gap as the `reflection` cousin and `sprites.tsx`).
function SceneBackground() {
  const scene = useThree((s) => s.scene)

  useEffect(() => {
    const withBackgroundNode = scene as unknown as { backgroundNode: Node | null }
    withBackgroundNode.backgroundNode = hue(mix(vec3(0), color(0x0066ff), normalWorld.y).mul(0.1), time)
    return () => {
      withBackgroundNode.backgroundNode = null
    }
  }, [scene])

  return null
}

// The original's debug UV plane behind the dancer — handy for judging how the blur
// smears a high-frequency texture in the reflection.
function UvPlane() {
  const uvMap = useTexture(UV_GRID_URL)

  useMemo(() => {
    uvMap.colorSpace = SRGBColorSpace
  }, [uvMap])

  return (
    <mesh position={[0, 1, -3]}>
      <planeGeometry args={[2, 2]} />
      <meshStandardNodeMaterial map={uvMap} side={DoubleSide} />
    </mesh>
  )
}

export default function ReflectionBlurred() {
  const { roughness, radius, resolutionScale } = useControls('reflection-blurred', {
    roughness: { value: 0.9, min: 0, max: 1, step: 0.01 },
    radius: { value: 0.2, min: 0, max: 1, step: 0.01 },
    resolutionScale: { value: 0.5, min: 0.25, max: 1, step: 0.05 },
  })

  return (
    <Canvas
      renderer={{ toneMapping: NeutralToneMapping, toneMappingExposure: 1.3 }}
      camera={{ position: [-2.5, 2, 2.5], fov: 50, near: 0.25, far: 30 }}
    >
      <SceneBackground />
      <hemisphereLight color={0xffffff} groundColor={0x0066ff} intensity={10} />
      <BlurredFloor roughness={roughness} radius={radius} resolutionScale={resolutionScale} />
      <Suspense fallback={null}>
        <Michelle />
      </Suspense>
      <Suspense fallback={null}>
        <UvPlane />
      </Suspense>
      <DemoHelpers grid={false} target={[0, 0.5, 0]} minDistance={1} maxDistance={10} maxPolarAngle={Math.PI / 2} />
    </Canvas>
  )
}

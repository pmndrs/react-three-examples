/**
 * portal
 * R3F port of three.js `webgpu_portal`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_portal (~140 lines of JS)
 *
 * DEMONSTRATES
 * - A TSL `pass(scene, camera).context({ getUV: () => screenUV })` node used directly
 *   as a plane's `colorNode`: the plane renders a SECOND, fully independent scene from
 *   the same camera, with no `useRenderPipeline`/render-target plumbing at all — the
 *   node graph owns the sub-render, resolved wherever the material gets drawn
 *   (`PortalWindow.tsx`)
 * - fiber's `createPortal` to declaratively mount a scene's worth of lights + model
 *   into a plain `THREE.Scene` instance that is never part of the Canvas's own render
 *   tree — the idiomatic R3F way to author a second scene, replacing the original's
 *   imperative `scenePortal.add(...)` calls
 * - Two independent `scene.backgroundNode` TSL graphs: a `normalWorld` view-direction
 *   gradient on the main scene, an animated `mx_worley_noise_float` on the portal scene
 * - `useAnimations` called twice against two different root objects (the loaded GLTF
 *   scene, and a `.clone()` of it) sharing one `animations` array — two independent
 *   `AnimationMixer`s playing the same clip in lockstep (`PortalModels.tsx`)
 *
 * DIVERGENCE from original
 * - `renderer.inspector = new Inspector()` dropped — this repo doesn't wire the
 *   RootState Inspector slot yet (same gap noted in `postprocessing-bloom-emissive`,
 *   `reflection`)
 * - `THREE.Timer` + manual `renderer.setAnimationLoop` dropped: `useAnimations`' own
 *   internal `useFrame(mixer.update)` drives both mixers off fiber's frame loop
 * - `OrbitControls` replaced by DemoHelpers' camera-controls orbit; target matches the
 *   original's `controls.target.set(0, 1, 0)`
 * - `renderer.toneMappingExposure` (0.15 in the original) exposed via leva instead of
 *   hardcoded — same WebGPURenderer-property escape hatch as `sky.tsx`/`tonemapping.tsx`
 * - The portal-scene point light is a second `<pointLight>` with identical params
 *   rather than a literal `light.clone()` — declaratively equivalent, no visible
 *   difference
 * - Portal-ghost wireframe/noise effect applied to every mesh in the cloned model via
 *   `.traverse()` rather than the original's two hardcoded child indices
 *   (`children[0].children[0]`/`[1]`) — see `PortalModels.tsx` header
 */
import { Suspense, useEffect, useMemo } from 'react'
import { Canvas, createPortal, useThree } from '@react-three/fiber/webgpu'
import { useControls } from 'leva'
import { color, mx_worley_noise_float, normalWorld, time, vec2 } from 'three/tsl'
import { LinearToneMapping, Scene } from 'three/webgpu'
import type { Node } from 'three/webgpu'
import { DemoHelpers } from '../../utils/DemoHelpers'
import { PortalGhost, XbotModel } from './PortalModels'
import { PortalWindow } from './PortalWindow'

// original: camera.position.set(2.5, 1, 3); camera.position.multiplyScalar(0.8)
const CAMERA_POSITION: [number, number, number] = [2, 0.8, 2.4]

// Main scene's TSL background: a view-direction gradient. Cast: `@types/three`'s
// `Scene` doesn't declare `backgroundNode` even though the webgpu renderer reads it
// directly off the live scene instance (documented duck-typed gap, see
// reflection.tsx/sprites.tsx headers).
function SceneBackground() {
  const scene = useThree((s) => s.scene)

  useEffect(() => {
    const withBackgroundNode = scene as unknown as { backgroundNode: Node | null }
    withBackgroundNode.backgroundNode = normalWorld.y.mix(color(0x0066ff), color(0xff0066))
    return () => {
      withBackgroundNode.backgroundNode = null
    }
  }, [scene])

  return null
}

// WebGPURenderer property, not a TSL uniform — same escape hatch as
// sky.tsx/tonemapping.tsx's exposure controls.
function ToneMappingExposure({ exposure }: { exposure: number }) {
  const renderer = useThree((s) => s.renderer)

  useEffect(() => {
    renderer.toneMappingExposure = exposure
  }, [renderer, exposure])

  return null
}

export default function Portal() {
  const { exposure } = useControls('portal', {
    exposure: { value: 0.15, min: 0, max: 1, step: 0.01 },
  })

  // The portal's destination scene: a plain THREE.Scene that never joins the Canvas's
  // own scene graph. `createPortal` below feeds its lights/model in declaratively; the
  // TSL `pass()` node in PortalWindow is what actually renders it (see header
  // DEMONSTRATES).
  const scenePortal = useMemo(() => {
    const scene = new Scene()
    scene.name = 'Portal Scene'
    const withBackgroundNode = scene as unknown as { backgroundNode: Node | null }
    withBackgroundNode.backgroundNode = mx_worley_noise_float(normalWorld.mul(20).add(vec2(0, time.oneMinus()))).mul(
      color(0x0066ff),
    )
    return scene
  }, [])

  return (
    <Canvas
      renderer={{ toneMapping: LinearToneMapping }}
      camera={{ position: CAMERA_POSITION, fov: 50, near: 0.01, far: 30 }}
    >
      <SceneBackground />
      <ToneMappingExposure exposure={exposure} />
      <hemisphereLight args={['#ff0066', '#0066ff', 7]} />
      <pointLight position={[0, 1, 5]} power={17000} />
      <Suspense fallback={null}>
        <XbotModel />
        {createPortal(
          <>
            <pointLight position={[0, 1, 5]} power={17000} />
            <PortalGhost />
          </>,
          scenePortal,
        )}
      </Suspense>
      <PortalWindow portalScene={scenePortal} />
      <DemoHelpers target={[0, 1, 0]} />
    </Canvas>
  )
}

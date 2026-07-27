/**
 * animation-retargeting
 * R3F port of three.js `webgpu_animation_retargeting`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_animation_retargeting (~230 lines of JS)
 *
 * DEMONSTRATES
 * - `SkeletonUtils.retargetClip` (three/addons): baking a source model's animation
 *   clip onto a differently-rigged target's skeleton — a full-hierarchy `Skeleton`
 *   built from a `SkeletonHelper` (not the SkinnedMesh's own, possibly-partial one) as
 *   the retarget source, per-bone `localOffsets` correcting rest-pose rotation
 *   differences between the two rigs, and a `hip`/`scale` pair reconciling the
 *   target's uniform scale (`RetargetedModels.tsx`)
 * - The retargeted clip applied directly to the target's `SkinnedMesh` via a second
 *   `useAnimations(clips, root)` call (root = the skin, not the scene) — matches the
 *   original's explicit comment on why (`retargetClip` outputs track paths relative
 *   to the skin's own bones)
 * - `reflector()` TSL node as a transparent floor `colorNode` (a three-line version of
 *   reflection/ReflectiveFloor.tsx's fuller reflection + normal-map recipe) (`Floor.tsx`)
 * - A hand-authored TSL `Fn` (`lightSpeed`, forked from a Shadertoy) dodge-blended
 *   with a hue-cycling vignette into `scene.backgroundNode` (`background.ts`)
 *
 * DIVERGENCE from original
 * - `renderer.inspector` GUI toggle replaced by a leva `showHelpers` boolean (same
 *   Inspector-not-wired-yet gap as reflection/portal/postprocessing-bloom-emissive)
 * - `SkeletonUtils.RetargetClipOptions` doesn't declare `localOffsets` in @types/three
 *   even though the runtime reads it — typed via an intersection (`RetargetedModels.tsx`,
 *   an @types/three gap, not fiber/drei, so no UPSTREAM.md entry)
 * - Target SkinnedMesh found via `.traverse()` + `isSkinnedMesh` instead of the
 *   original's hardcoded `scene.children[0].children[0]` (same divergence already
 *   established in portal/PortalModels.tsx)
 * - Model position/rotation/scale set declaratively via JSX props instead of the
 *   original's imperative mutation; only the retargeting bake itself (an inherently
 *   imperative API) stays inside a `useMemo` escape hatch
 * - `THREE.Timer` + manual `renderer.setAnimationLoop` dropped: `useAnimations`'s own
 *   internal frame-loop hook drives both mixers (same simplification as portal.tsx)
 * - `OrbitControls` replaced by DemoHelpers' camera-controls orbit; target, min/max
 *   distance, and `maxPolarAngle` match the original's `controls` settings exactly
 * - No shadows enabled: the original never sets `castShadow` on its directional light
 *   despite `floor.receiveShadow = true` — matched as-is (nothing would render either way)
 */
import { Suspense, useEffect } from 'react'
import { Canvas, useThree } from '@react-three/fiber/webgpu'
import { useControls } from 'leva'
import { NeutralToneMapping } from 'three/webgpu'
import type { Node } from 'three/webgpu'
import { DemoHelpers } from '../../utils/DemoHelpers'
import { retargetingBackground } from './background'
import { Floor } from './Floor'
import { RetargetedModels } from './RetargetedModels'

// Cast: `@types/three`'s `Scene` doesn't declare `backgroundNode` even though the
// webgpu renderer reads it directly off the live scene instance (documented duck-typed
// gap, see reflection.tsx/portal.tsx/sprites.tsx headers).
function SceneBackground() {
  const scene = useThree((s) => s.scene)

  useEffect(() => {
    const withBackgroundNode = scene as unknown as { backgroundNode: Node | null }
    withBackgroundNode.backgroundNode = retargetingBackground
    return () => {
      withBackgroundNode.backgroundNode = null
    }
  }, [scene])

  return null
}

export default function AnimationRetargeting() {
  const { showHelpers } = useControls('animation-retargeting', {
    showHelpers: false,
  })

  return (
    <Canvas
      renderer={{ toneMapping: NeutralToneMapping }}
      camera={{ position: [0, 1, 4], fov: 40, near: 0.25, far: 50 }}
    >
      <SceneBackground />
      <hemisphereLight args={['#e9c0a5', '#0175ad', 5]} />
      <directionalLight color="#fff9ea" intensity={4} position={[2, 5, 2]} />
      <Suspense fallback={null}>
        <RetargetedModels showHelpers={showHelpers} />
      </Suspense>
      <Floor />
      <DemoHelpers target={[0, 1, 0]} minDistance={3} maxDistance={12} maxPolarAngle={Math.PI / 2} />
    </Canvas>
  )
}

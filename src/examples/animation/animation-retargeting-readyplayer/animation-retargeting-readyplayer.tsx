/**
 * animation-retargeting-readyplayer
 * R3F port of three.js `webgpu_animation_retargeting_readyplayer`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_animation_retargeting_readyplayer
 * (~220 lines of JS)
 *
 * DEMONSTRATES
 * - `SkeletonUtils.retargetClip` (three/addons) baking a Mixamo animation onto a
 *   readyplayer.me avatar's differently-named rig — the direct neighbour of
 *   `animation-retargeting`, but with a `getBoneName` FUNCTION (Mixamo's rig is
 *   every target bone name prefixed with `mixamorig`) standing in for that example's
 *   per-bone name/rotation lookup tables, since these two rigs already share rest
 *   poses (`RetargetedModels.tsx`)
 * - `useFBX` (drei) for the Mixamo source — `.animations` arrives on the returned
 *   `Group` the same way `useGLTF`'s does, so the rest of the retarget/playback
 *   pipeline is unchanged from the GLTF-sourced sibling example
 * - The retargeted clip applied directly to the target's `SkinnedMesh` via a second
 *   `useAnimations(clips, root)` call (root = the skin, not the scene)
 * - A two-tone TSL `scene.backgroundNode` (horizontal color mix + a radial glow) and
 *   a `reflector()` floor, both simple enough to stay inline here rather than in
 *   their own files (contrast `animation-retargeting/background.ts` and `Floor.tsx`)
 *
 * DIVERGENCE from original
 * - `renderer.inspector` GUI toggle replaced by a leva `showHelpers` boolean (same
 *   gap as `animation-retargeting`)
 * - Target `SkinnedMesh` found via `.traverse()` + `isSkinnedMesh` instead of the
 *   original's hardcoded `scene.children[0].children[1]` (every skinned mesh on this
 *   rig shares one skeleton, so any of them works — same divergence already
 *   established in `animation-retargeting/RetargetedModels.tsx`)
 * - Model position/scale set declaratively via JSX props; only the retargeting bake
 *   itself stays inside a `useMemo` escape hatch
 * - `OrbitControls` replaced by DemoHelpers' camera-controls orbit; target, min/max
 *   distance, and `maxPolarAngle` match the original's `controls` settings exactly
 * - No shadows enabled: the original never sets `castShadow` on any light despite
 *   `floor.receiveShadow = true` — matched as-is (nothing would render either way,
 *   same no-op already noted in `animation-retargeting`)
 */
import { Suspense, useEffect } from 'react';
import { color, positionWorld, reflector, screenUV, vec2, vec4 } from 'three/tsl';
import { NeutralToneMapping } from 'three/webgpu';
import type { Node } from 'three/webgpu';
import { Canvas, useThree } from '@react-three/fiber/webgpu';
import { DemoHelpers } from '../../../utils/DemoHelpers';
import { RetargetedModels } from './RetargetedModels';

// Two-tone backdrop: a horizontal color mix plus a radial glow near the floor,
// ported verbatim from the original's init().
const horizontalEffect = screenUV.x.mix(color(0x13172b), color(0x311649));
const lightEffect = screenUV.distance(vec2(0.5, 1.0)).oneMinus().mul(color(0x0c5d68));
const readyplayerBackground = horizontalEffect.add(lightEffect);

// Cast: `@types/three`'s `Scene` doesn't declare `backgroundNode` even though the
// WebGPU renderer reads it directly off the live scene instance (documented duck-typed
// gap, see animation-retargeting/animation-retargeting.tsx's SceneBackground).
function SceneBackground() {
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    const withBackgroundNode = scene as unknown as { backgroundNode: Node | null };
    withBackgroundNode.backgroundNode = readyplayerBackground;
    return () => {
      withBackgroundNode.backgroundNode = null;
    };
  }, [scene]);

  return null;
}

// A faint reflective floor, fading out with distance from the origin — small enough
// to keep inline (contrast animation-retargeting/Floor.tsx's fuller version).
function Floor() {
  const reflection = reflector();
  const reflectionMask = positionWorld.xz.distance(0).mul(0.1).clamp().oneMinus();

  return (
    <>
      <mesh receiveShadow>
        <boxGeometry args={[50, 0.001, 50]} />
        <nodeMaterial colorNode={vec4(reflection.rgb, reflectionMask)} opacity={0.2} transparent />
      </mesh>
      <primitive object={reflection.target} rotation-x={-Math.PI / 2} />
    </>
  );
}

export default function AnimationRetargetingReadyplayer() {
  return (
    <Canvas
      renderer={{ toneMapping: NeutralToneMapping }}
      camera={{ position: [0, 3, 5], fov: 40, near: 0.25, far: 50 }}>
      <SceneBackground />
      <hemisphereLight args={['#311649', '#0c5d68', 10]} />
      <directionalLight color="#ffffff" intensity={10} position={[0, 5, -5]} />
      <directionalLight color="#fff9ea" intensity={4} position={[3, 5, 3]} />
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes the displayed scene (AGENTS.md; corpus-wide repair, wave 8). */}
      <Suspense fallback={null}>
        <RetargetedModels />
      </Suspense>
      <Floor />
      <DemoHelpers target={[0, 1, 0]} minDistance={3} maxDistance={12} maxPolarAngle={Math.PI / 2} />
    </Canvas>
  );
}

/**
 * postprocessing-dof-basic
 * A bathroom diorama with a hand-rolled depth of field: the scene pass, a box-blurred
 * copy of it, and a smoothstep over per-pixel view depth choosing between them. Click
 * anything to pull focus onto that spot.
 * Original: https://threejs.org/examples/#webgpu_postprocessing_dof_basic
 *
 * DEMONSTRATES
 * - DoF built from primitives rather than a canned pass: `boxBlur()` over the scene
 *   color, `smoothstep(min, max, |viewZ - focusZ|)` as the mask, `mix()` between sharp
 *   and blurred — the whole effect is four TSL lines
 * - Click-to-focus for free: R3F already raycasts, so `event.point` on a `<group>`
 *   replaces the original's Raycaster + pointer-coordinate + listener plumbing
 * - Handing a live `Vector3` to `useUniforms` and mutating it in `useFrame` — the focus
 *   point is expressed in VIEW space, so it has to be recomputed as the camera moves
 * - FXAA after a manual `renderOutput()` (`outputColorTransform = false`) because FXAA
 *   reads sRGB — the same color-space contract as `postprocessing-fxaa`
 * - An UltraHDR (`.hdr.jpg`) environment through `useLoader(UltraHDRLoader, …)`, which
 *   drei's `<Environment>` can't select a loader for (UPSTREAM B13)
 *
 * DIVERGENCE from original
 * - Focus eases with exponential damping in `useFrame` instead of TWEEN.js's 500ms
 *   cubic tween — same read, without a tween library or its module-global update pump.
 */
import { Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { mix, renderOutput, smoothstep } from 'three/tsl';
import { EquirectangularReflectionMapping, NeutralToneMapping, Vector3 } from 'three/webgpu';
import { boxBlur } from 'three/addons/tsl/display/boxBlur.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import { UltraHDRLoader } from 'three/addons/loaders/UltraHDRLoader.js';
import { Canvas, useFrame, useLoader, useRenderPipeline, useThree, useUniforms } from '@react-three/fiber/webgpu';
import { useAnimations, useGLTF } from '@react-three/drei/webgpu';
import { useControls } from 'leva';

import { DemoHelpers } from '../../utils/DemoHelpers';

const MODEL_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/bath_day.glb';
const HDR_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/equirectangular/spruit_sunrise_2k.hdr.jpg';

// The glb ships exactly one clip; playing it by name rather than by index is the
// repo convention (`gltf.animations[0]` upstream).
const IDLE_CLIP = 'Take 001';

const INITIAL_FOCUS = [1, 1.75, -0.4] as const; // the rubber duck, roughly
const FOCUS_DAMPING = 8; // higher = snappier pull-focus

interface FocusProps {
  /** World-space point the focus eases toward; written by the click handler. */
  focusTargetRef: React.RefObject<Vector3>;
}

//* Scene =========================================================

function SunriseEnvironment() {
  const scene = useThree((s) => s.scene);
  const envMap = useLoader(UltraHDRLoader, HDR_URL);

  // `.mapping` and the environment rotation are read at shader-graph build time on
  // the first render, so they have to land before it.
  useLayoutEffect(() => {
    envMap.mapping = EquirectangularReflectionMapping;
    scene.environment = envMap;
    scene.environmentRotation.y = Math.PI * -0.5;
    return () => {
      scene.environment = null;
    };
  }, [scene, envMap]);

  return null;
}

function BathDay({ focusTargetRef }: FocusProps) {
  const { scene, animations } = useGLTF(MODEL_URL, { draco: true });
  const { actions } = useAnimations(animations, scene);

  useEffect(() => {
    actions[IDLE_CLIP]?.play();
  }, [actions]);

  // The <group> wrapper is what makes click-to-focus a one-liner: R3F's event system
  // has already raycast the subtree, so `event.point` is the hit position.
  return (
    <group onClick={(event) => focusTargetRef.current.copy(event.point)}>
      <primitive object={scene} />
    </group>
  );
}

//* Post-processing ===============================================

function DofPipeline({ focusTargetRef }: FocusProps) {
  const controls = useControls('DoF Basic', {
    minDistance: { value: 1, min: 0, max: 3, step: 0.01, label: 'min distance' },
    maxDistance: { value: 3, min: 0, max: 5, step: 0.01, label: 'max distance' },
    blurSize: { value: 2, min: 1, max: 3, step: 1, label: 'blur size' },
    blurSpread: { value: 4, min: 1, max: 7, step: 1, label: 'blur spread' },
  });

  // This Vector3 IS the uniform's value — mutating it below is the entire sync path.
  // Held in lazy useState, not useMemo: useUniforms is create-once and closes over it.
  const [focusPointView] = useState(() => new Vector3());
  const focusPointRef = useRef(new Vector3(...INITIAL_FOCUS));
  const uniforms = useUniforms({ ...controls, focusPointView });

  useFrame(({ camera, delta }) => {
    focusPointRef.current.lerp(focusTargetRef.current, 1 - Math.exp(-FOCUS_DAMPING * delta));
    camera.updateMatrixWorld();
    focusPointView.copy(focusPointRef.current).applyMatrix4(camera.matrixWorldInverse);
  });

  useRenderPipeline(({ renderPipeline, passes }) => {
    renderPipeline.outputColorTransform = false; // fxaa() wants sRGB input

    const scenePassColor = passes.scenePass.getTextureNode();
    const scenePassViewZ = passes.scenePass.getViewZNode();
    const scenePassBlurred = boxBlur(scenePassColor, { size: uniforms.blurSize, separation: uniforms.blurSpread });

    // Simple DoF, after lettier.github.io/3d-game-shaders-for-beginners/depth-of-field
    const blur = smoothstep(
      uniforms.minDistance,
      uniforms.maxDistance,
      scenePassViewZ.sub(uniforms.focusPointView.z).abs(),
    );
    renderPipeline.outputNode = fxaa(renderOutput(mix(scenePassColor, scenePassBlurred, blur)));
  });

  return null;
}

export default function PostprocessingDofBasic() {
  // Shared by the click handler (writer) and the pipeline (reader) — one hop up from
  // both, as plain data rather than drilled leva state.
  const focusTargetRef = useRef(new Vector3(...INITIAL_FOCUS));

  return (
    <Canvas
      // Original sets NeutralToneMapping; fiber would default to ACESFilmic.
      renderer={{ toneMapping: NeutralToneMapping }}
      background="#90d5ff"
      camera={{ position: [-6, 5, 6], fov: 60, near: 0.1, far: 100 }}>
      {/* Creator hooks run before the suspending siblings below (B18). */}
      <DofPipeline focusTargetRef={focusTargetRef} />
      <Suspense fallback={null}>
        <SunriseEnvironment />
        <BathDay focusTargetRef={focusTargetRef} />
      </Suspense>
      <DemoHelpers grid={false} target={[0, 2, 0]} />
    </Canvas>
  );
}

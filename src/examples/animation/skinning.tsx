/**
 * skinning
 * R3F port of three.js `webgpu_skinning`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_skinning (~123 lines of JS)
 *
 * DEMONSTRATES
 * - The baseline skinned-mesh pipeline: `useGLTF` + `useAnimations` replacing manual
 *   `GLTFLoader`/`AnimationMixer` wiring, with the model's one clip played immediately
 *   on load
 * - A TSL `scene.backgroundNode` sky gradient (`screenUV.y.mix(...)`) in place of a
 *   flat background color
 * - A point light attached to the camera declaratively —
 *   `<PerspectiveCamera makeDefault><pointLight/></PerspectiveCamera>` — the JSX form
 *   of the original's `camera.add(light)`
 *
 * DIVERGENCE from original
 * - No leva controls — the original ships no GUI either
 * - `renderer.toneMapping`/`toneMappingExposure` (Linear, 0.4) set once via
 *   `<Canvas renderer={{...}}>` instead of imperative assignment
 * - DemoHelpers' camera-controls orbit replaces the original's fixed, non-interactive
 *   camera; `target` matches the original's `camera.lookAt(0, 1, 0)`
 */
import { Suspense, useEffect } from 'react';
import { color, screenUV } from 'three/tsl';
import { LinearToneMapping } from 'three/webgpu';
import { Canvas, useThree } from '@react-three/fiber/webgpu';
import { PerspectiveCamera, useAnimations, useGLTF } from '@react-three/drei/webgpu';
import { DemoHelpers } from '../../utils/DemoHelpers';

const MICHELLE_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/Michelle.glb';

// Vertical sky gradient, ported verbatim from the original's init().
const skyBackground = screenUV.y.mix(color(0x66bbff), color(0x4466ff));

// `@types/three` declares `backgroundNode` on `Scene` directly (0.185.1), so no cast
// is needed.
function SceneBackground() {
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    const withBackgroundNode = scene;
    withBackgroundNode.backgroundNode = skyBackground;
    return () => {
      withBackgroundNode.backgroundNode = null;
    };
  }, [scene]);

  return null;
}

function Michelle() {
  const { scene, animations } = useGLTF(MICHELLE_URL);
  const { actions } = useAnimations(animations, scene);

  useEffect(() => {
    // Michelle.glb ships exactly one clip — safe to play without naming it (same
    // no-ambiguity idiom as animation-retargeting/RetargetedModels.tsx's source model).
    Object.values(actions)[0]?.play();
  }, [actions]);

  return <primitive object={scene} />;
}

export default function Skinning() {
  return (
    <Canvas renderer={{ toneMapping: LinearToneMapping, toneMappingExposure: 0.4 }}>
      <SceneBackground />
      {/* Declarative headlight: the child light is the JSX form of camera.add(light). */}
      <PerspectiveCamera makeDefault position={[1, 2, 3]} fov={50} near={0.01} far={100}>
        <pointLight color="#ffffff" power={2500} distance={100} />
      </PerspectiveCamera>
      <ambientLight color="#4466ff" intensity={1} />
      <Suspense fallback={null}>
        <Michelle />
      </Suspense>
      <DemoHelpers grid={false} target={[0, 1, 0]} />
    </Canvas>
  );
}

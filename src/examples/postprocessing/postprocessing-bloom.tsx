/**
 * postprocessing-bloom
 * A glowing ion drive. The whole frame blooms above its own bright pixels — the
 * simplest shape bloom takes, before MRT makes it selective.
 * Original: https://threejs.org/examples/#webgpu_postprocessing_bloom
 *
 * DEMONSTRATES
 * - `useRenderPipeline`: one bloom pass added straight back onto the scene color
 * - Driving a pass's own `uniform()`-backed fields from leva by assigning uniform
 *   nodes onto them — the pipeline callback runs ONCE, so a closed-over prop would
 *   freeze at its first value
 * - A point light attached to the camera, declaratively
 * - `useAnimations` playing the model's single clip by name
 */
import { Suspense, useEffect } from 'react';
import { ReinhardToneMapping } from 'three/webgpu';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { Canvas, useRenderPipeline, useThree, useUniforms } from '@react-three/fiber/webgpu';
import { PerspectiveCamera, useAnimations, useGLTF } from '@react-three/drei/webgpu';
import { useControls } from 'leva';

import { DemoHelpers } from '../../utils/DemoHelpers';

const SHIP_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/PrimaryIonDrive.glb';

//* Scene =========================================================

function PrimaryIonDrive() {
  const { scene, animations } = useGLTF(SHIP_URL);
  const { actions } = useAnimations(animations, scene);

  useEffect(() => {
    // By name, never Object.values(actions) — read off the clip since the GLTF
    // doesn't document it.
    const name = animations[0]?.name;
    if (name) actions[name]?.play();
  }, [actions, animations]);

  return <primitive object={scene} />;
}

//* Post-processing ===============================================

function PostFX() {
  const { exposure, ...bloomValues } = useControls('Bloom', {
    threshold: { value: 0, min: 0, max: 1, step: 0.01 },
    strength: { value: 1, min: 0, max: 3, step: 0.01 },
    radius: { value: 0, min: 0, max: 1, step: 0.01 },
    exposure: { value: 1, min: 0.1, max: 2, step: 0.01 },
  });
  const uniforms = useUniforms(bloomValues);
  const renderer = useThree((state) => state.renderer);

  useRenderPipeline(({ renderPipeline, passes }) => {
    const scenePassColor = passes.scenePass.getTextureNode();
    const bloomPass = bloom(scenePassColor);
    // bloom() builds its own uniforms; swap ours in before the shader compiles and
    // leva drives the pass with no pipeline rebuild.
    bloomPass.threshold = uniforms.threshold;
    bloomPass.strength = uniforms.strength;
    bloomPass.radius = uniforms.radius;
    renderPipeline.outputNode = scenePassColor.add(bloomPass);
  });

  // Exposure is a renderer property, not a node — no place in the graph. pow(v, 4) is
  // the original's curve, which just makes the slider feel even.
  useEffect(() => {
    renderer.toneMappingExposure = exposure ** 4;
  }, [renderer, exposure]);

  return null;
}

export default function PostprocessingBloom() {
  return (
    // The original picks Reinhard deliberately; fiber would otherwise default to ACES.
    <Canvas renderer={{ toneMapping: ReinhardToneMapping }}>
      {/* The child light is the declarative form of the original's camera.add(light). */}
      <PerspectiveCamera makeDefault position={[-5, 2.5, -3.5]} fov={40} near={1} far={100}>
        <pointLight color="#ffffff" intensity={100} />
      </PerspectiveCamera>
      <ambientLight color="#cccccc" />
      <Suspense fallback={null}>
        <PrimaryIonDrive />
      </Suspense>
      <PostFX />
      <DemoHelpers grid={false} minDistance={3} maxDistance={8} maxPolarAngle={Math.PI * 0.5} />
    </Canvas>
  );
}

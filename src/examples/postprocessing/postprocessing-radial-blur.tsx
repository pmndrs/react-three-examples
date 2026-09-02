/**
 * postprocessing-radial-blur
 * A slowly turning cloud of 100 flat-shaded tetrahedra, streaked outward from the
 * centre of the screen by a radial blur — the cheap "light shafts" trick.
 * Original: https://threejs.org/examples/#webgpu_postprocessing_radial_blur
 *
 * DEMONSTRATES
 * - Pipeline dynamism pattern (c), the textbook case: `radialBlur()` is an `Fn()`
 *   helper taking an options object, so there is no pass instance to assign onto —
 *   three/tsl `uniform()`s are created in the mainCB, passed in, registered by
 *   returning them, and mutated from an effect
 * - Two of those uniforms are `int` (sample count, exposure), which `useUniforms`
 *   cannot produce at all — the other half of why (c) exists
 * - A uniform LOOP bound: `count` drives `Loop()` inside the effect, so changing it
 *   is a `.value` write, not a shader rebuild
 * - `enabled` swapping `renderPipeline.outputNode` between the blur and the raw scene
 *   pass — pattern (d), with the read-back cast AGENTS.md exempts from rule 5
 * - 100 instances placed and coloured once in `useLayoutEffect`, before the WebGPU
 *   shader graph reads the mesh
 */
import { useEffect, useLayoutEffect, useRef } from 'react';
import { Color, NeutralToneMapping, Object3D, Vector2 } from 'three/webgpu';
import type { InstancedMesh, Group, UniformNode } from 'three/webgpu';
import { float, int, uniform } from 'three/tsl';
import { radialBlur } from 'three/addons/tsl/display/radialBlur.js';
import { Canvas, useFrame, useRenderPipeline } from '@react-three/fiber/webgpu';
import { useControls } from 'leva';

import { DemoHelpers } from '../../utils/DemoHelpers';

const COUNT = 100;

//* Scene =========================================================

function Tetrahedrons() {
  const { animated } = useControls('Scene', { animated: true });
  const groupRef = useRef<Group>(null);
  const meshRef = useRef<InstancedMesh>(null);

  // Transforms and per-instance colors, written BEFORE the first RAF render: the
  // WebGPU shader-graph build reads the mesh once, and setColorAt has to have created
  // the instanceColor buffer by then.
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new Object3D();
    const color = new Color();
    const center = new Vector2();

    for (let i = 0; i < COUNT; i++) {
      dummy.position.set(Math.random() * 50 - 25, Math.random() * 50 - 25, Math.random() * 50 - 25);

      // Push anything too near the screen centre outwards — the blur origin is there,
      // and a tetrahedron sitting on it would smear into a solid blob.
      center.set(dummy.position.x, dummy.position.y);
      if (center.length() < 6) {
        center.normalize().multiplyScalar(6);
        dummy.position.x = center.x;
        dummy.position.y = center.y;
      }

      dummy.scale.setScalar(Math.random() * 2 + 1);
      dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      mesh.setColorAt(i, color.setHSL(0.55 + (i / COUNT) * 0.15, 1, 0.2));
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  useFrame(({ delta }) => {
    if (!animated) return;
    const group = groupRef.current;
    if (!group) return;
    group.rotation.y += delta * 0.1;
  });

  return (
    <group ref={groupRef}>
      <instancedMesh ref={meshRef} args={[undefined, undefined, COUNT]}>
        <tetrahedronGeometry />
        <meshStandardNodeMaterial flatShading />
      </instancedMesh>
    </group>
  );
}

//* Post-processing ===============================================

function RadialBlurPipeline() {
  const { enabled, weight, decay, count, exposure } = useControls('Radial Blur', {
    enabled: true,
    weight: { value: 0.9, min: 0, max: 1, step: 0.01 },
    decay: { value: 0.95, min: 0, max: 1, step: 0.01 },
    count: { label: 'sample count', value: 32, min: 16, max: 64, step: 1 },
    // Step 1 because the node reads this as an int; the original's slider is
    // continuous and truncates on the way in.
    exposure: { value: 5, min: 1, max: 10, step: 1 },
  });

  const { renderPipeline, passes } = useRenderPipeline(({ renderPipeline, passes }) => {
    // Initial values come from the closure ONCE (pipeline callbacks never re-run on
    // re-render); every later change flows through the registered uniforms below.
    const uWeight = uniform(float(weight));
    const uDecay = uniform(float(decay));
    const uCount = uniform(int(count));
    const uExposure = uniform(int(exposure));

    const blurPass = radialBlur(passes.scenePass, {
      weight: uWeight,
      decay: uDecay,
      count: uCount,
      exposure: uExposure,
    });
    renderPipeline.outputNode = blurPass;

    return { blurPass, uWeight, uDecay, uCount, uExposure };
  });

  useEffect(() => {
    // Only `.value` is touched, so the node-type params can stay unknown.
    const uWeight = passes.uWeight as UniformNode<unknown, number> | undefined;
    const uDecay = passes.uDecay as UniformNode<unknown, number> | undefined;
    const uCount = passes.uCount as UniformNode<unknown, number> | undefined;
    const uExposure = passes.uExposure as UniformNode<unknown, number> | undefined;
    if (!uWeight || !uDecay || !uCount || !uExposure) return;
    uWeight.value = weight;
    uDecay.value = decay;
    uCount.value = count;
    uExposure.value = exposure;
  }, [passes, weight, decay, count, exposure]);

  useEffect(() => {
    const blurPass = passes.blurPass as ReturnType<typeof radialBlur> | undefined;
    if (!renderPipeline || !blurPass) return;
    renderPipeline.outputNode = enabled ? blurPass : passes.scenePass;
    renderPipeline.needsUpdate = true;
  }, [renderPipeline, passes, enabled]);

  return null;
}

export default function PostprocessingRadialBlur() {
  return (
    <Canvas
      renderer={{ toneMapping: NeutralToneMapping }}
      background="#000000"
      camera={{ position: [0, 0, 50], fov: 45, near: 0.1, far: 200 }}>
      <RadialBlurPipeline />
      <Tetrahedrons />
      <hemisphereLight color="#ffffff" groundColor="#8d8d8d" position={[0, 1000, 0]} />
      <pointLight color="#ffffff" intensity={1000} />
      <DemoHelpers grid={false} maxDistance={150} />
    </Canvas>
  );
}

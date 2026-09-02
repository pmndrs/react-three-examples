/**
 * postprocessing-anamorphic
 * 200 spheres bobbing on independent phases against a shader backdrop, bloomed
 * through a custom horizontal-only high-pass for the stretched "anamorphic" streak.
 * Original: https://threejs.org/examples/#webgpu_postprocessing_anamorphic
 *
 * DEMONSTRATES
 * - Overriding `bloom()`'s high-pass filter (`bloomPass.highPassFn`) with a custom
 *   TSL `Fn`: `rtt()` renders the bright-pass once, then a falloff-weighted `Loop()`
 *   blurs it horizontally only — the anamorphic streak, built from nodes the
 *   original example defines inline
 * - `scene.backgroundNode` as a radial-gradient `Fn()` instead of a texture — a
 *   shader IS the background, no asset at all
 * - `positionLocal` displaced by `instanceIndex` as a per-instance phase offset —
 *   200 spheres bobbing on independent sine phases from ONE shared position node,
 *   GPU-only, zero per-frame CPU work
 * - Driving `bloom()`'s own `.strength`/`.radius`/`.threshold` fields from leva by
 *   assigning `useUniforms` nodes onto them before the shader compiles
 */
import { useLayoutEffect, useMemo } from 'react';
import {
  Fn,
  Loop,
  color,
  float,
  instanceIndex,
  luminance,
  mix,
  positionLocal,
  rtt,
  screenUV,
  smoothstep,
  time,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
  viewportSize,
} from 'three/tsl';
import {
  Color,
  IcosahedronGeometry,
  InstancedMesh,
  MeshBasicNodeMaterial,
  MirroredRepeatWrapping,
  NeutralToneMapping,
  Object3D,
} from 'three/webgpu';
import type { Node } from 'three/webgpu';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { Canvas, useRenderPipeline, useThree, useUniforms } from '@react-three/fiber/webgpu';
import { useControls } from 'leva';

import { DemoHelpers } from '../../utils/DemoHelpers';

const SPHERE_COUNT = 200;

//* Scene =========================================================

// Radial gradient backdrop — a shader, not a texture.
const gradientBackgroundNode = Fn(() => {
  const dist = screenUV.distance(0.5).mul(2.0);
  return mix(color(0x111111), color(0x000000), dist);
})();

function SceneBackground() {
  const scene = useThree((s) => s.scene);

  // `scene.backgroundNode` is duck-typed by the WebGPU renderer but not declared on
  // `@types/three`'s `Scene` (AGENTS.md B11). Set in a layout effect — read at
  // first-render shader-graph build time.
  useLayoutEffect(() => {
    const withBackgroundNode = scene as unknown as { backgroundNode: Node | null };
    withBackgroundNode.backgroundNode = gradientBackgroundNode;
    return () => {
      withBackgroundNode.backgroundNode = null;
    };
  }, [scene]);

  return null;
}

const dummy = new Object3D();

// Custom high-pass: `rtt()` renders the bright-pass once, then a falloff-weighted
// `Loop()` blurs it horizontally only — the anamorphic streak, ported from the
// original's inline `highPassFn` override. Untyped `Record<string, unknown>` param:
// fiber's `three/tsl` `Fn` overloads don't cover object-destructured params (B21).
const anamorphicHighPass = Fn((inputs: Record<string, unknown>) => {
  const input = inputs.input as Node<'vec4'>;
  const threshold = inputs.threshold as Node<'float'>;
  const smoothWidth = inputs.smoothWidth as Node<'float'>;
  const samples = uniform(80);

  const v = luminance(input.rgb);
  const alpha = smoothstep(threshold, threshold.add(smoothWidth), v);
  const brightPass = rtt(mix(vec4(0), input, alpha), null, null, {
    wrapS: MirroredRepeatWrapping,
    wrapT: MirroredRepeatWrapping,
  });

  const total = vec4(0).toVar();
  const halfSamples = samples.div(2);
  const invSize = vec2(1.0).div(viewportSize);

  Loop({ start: halfSamples.negate(), end: halfSamples }, ({ i }) => {
    let softness = float(i).abs().div(halfSamples).oneMinus();
    softness = softness.pow(2.0);

    const shiftedUV = vec2(uv().x.add(invSize.x.mul(i).mul(4.0)), uv().y);
    total.addAssign(brightPass.sample(shiftedUV).mul(softness));
  });

  return total.div(samples.div(3.0));
});

function InstancedSpheres() {
  const { timeScale } = useControls('Anamorphic', {
    timeScale: { value: 0.5, min: 0, max: 1, step: 0.01 },
  });
  const uniforms = useUniforms({ timeScale });

  const geometry = useMemo(() => new IcosahedronGeometry(0.1, 3), []);

  const material = useMemo(() => {
    const mat = new MeshBasicNodeMaterial({ color: 0xffffff });
    // instanceIndex as a per-instance phase offset, animated fully GPU-side.
    mat.positionNode = positionLocal.add(
      vec3(0, time.add(instanceIndex.toFloat().mul(0.5)).mul(uniforms.timeScale).sin().mul(5.0), 0),
    );
    return mat;
  }, [uniforms.timeScale]);

  return (
    <instancedMesh
      args={[geometry, material, SPHERE_COUNT]}
      // positionNode relocates instances outside the geometry's bounds (tsl-galaxy pattern).
      frustumCulled={false}
      ref={(mesh: InstancedMesh | null) => {
        if (!mesh) return;
        const colorObj = new Color();
        const rand = () => (Math.random() - 0.5) * 20;
        for (let i = 0; i < SPHERE_COUNT; i++) {
          dummy.position.set(rand(), rand(), rand());
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
          colorObj.setHex(Math.random() * 0xffffff);
          mesh.setColorAt(i, colorObj);
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }}
    />
  );
}

//* Post-processing ===============================================

function PostFX() {
  const { intensity, threshold, tintColor, radius } = useControls('Anamorphic', {
    intensity: { value: 5.0, min: 0, max: 10, step: 0.1 },
    threshold: { value: 0.3, min: 0, max: 0.9, step: 0.01 },
    tintColor: { value: '#7a8aff' },
    radius: { value: 0.0, min: 0, max: 1, step: 0.01 },
  });
  const uniforms = useUniforms({ intensity, threshold, tintColor, radius });

  useRenderPipeline(({ renderPipeline, passes }) => {
    const scenePassColor = passes.scenePass.getTextureNode();
    const bloomPass = bloom(scenePassColor);
    // bloom() builds its own uniforms; swap ours in before the shader compiles.
    bloomPass.strength = uniforms.intensity;
    bloomPass.radius = uniforms.radius;
    bloomPass.threshold = uniforms.threshold;
    bloomPass.setResolutionScale(0.25);

    // `highPassFn`'s declared type is `(params) => void`; the runtime (and the
    // addon's own default) returns a Node — documented @types gap, cast once.
    bloomPass.highPassFn = anamorphicHighPass as unknown as typeof bloomPass.highPassFn;

    renderPipeline.outputNode = scenePassColor.add(bloomPass.mul(uniforms.tintColor));
  });

  return null;
}

export default function PostprocessingAnamorphic() {
  return (
    // Original sets NeutralToneMapping explicitly (not fiber's ACESFilmic default).
    <Canvas
      renderer={{ toneMapping: NeutralToneMapping }}
      camera={{ position: [0, 0, 20], fov: 45, near: 0.25, far: 250 }}>
      <SceneBackground />
      <InstancedSpheres />
      <PostFX />
      <DemoHelpers grid={false} minDistance={2} maxDistance={25} />
    </Canvas>
  );
}

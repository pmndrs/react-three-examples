/**
 * postprocessing-glitch
 * A hundred random flat-shaded spheres, tumbling behind a digital glitch effect: RGB
 * tearing, scanline jumps and static, cycling on its own between calm and chaotic.
 * Original: https://threejs.org/examples/#webgl_postprocessing_glitch
 *
 * DEMONSTRATES
 * - A hand-ported TSL effect (`glitchNode.ts`): r185 ships no `GlitchNode`, so the
 *   addon's GLSL `DigitalGlitch` shader is rewritten directly in `Fn()`/`If()`/
 *   `.toVar()` — pattern (c) from AGENTS.md § Post-processing (no node-class instance
 *   to assign onto, so the uniforms are built ourselves and handed in)
 * - Every uniform the effect reads is FRAME-LOOP owned (`Math.random()` every frame,
 *   not a React value), so they're plain `uniform()` nodes from `useNodes`, mutated
 *   directly in `useFrame` — never `useUniforms`, which would snap them back on the
 *   next re-render (AGENTS.md)
 * - `InstancedMesh` built once in a `useLayoutEffect` (the shader/bounding-sphere state
 *   the first render depends on), matching the original's one-time random placement
 *
 * DIVERGENCE from original
 * - The "WARNING: photosensitive epilepsy" click-through overlay is the repo shell's
 *   job to add globally if it wants one, not a per-example concern — dropped, matching
 *   how every other example skips the original's own page chrome.
 */
import { useLayoutEffect, useMemo, useRef } from 'react';
import { Color, DataTexture, FloatType, MathUtils, NoToneMapping, Object3D, RedFormat } from 'three/webgpu';
import type { Group, InstancedMesh } from 'three/webgpu';
import { uniform } from 'three/tsl';
import { Canvas, useFrame, useNodes, useRenderPipeline } from '@react-three/fiber/webgpu';
import { useControls } from 'leva';

import { DemoHelpers } from '../../../utils/DemoHelpers';
import { glitch } from './glitchNode';

const COUNT = 100;
const DISP_SIZE = 64;

//* Scene =========================================================

function GlitchScene() {
  const groupRef = useRef<Group>(null);
  const meshRef = useRef<InstancedMesh>(null);

  // One-time random placement — the shader/bounding-sphere state the first render
  // depends on, so this runs before paint rather than in a passive effect.
  useLayoutEffect(() => {
    const mesh = meshRef.current!;
    const dummy = new Object3D();
    const color = new Color();
    for (let i = 0; i < COUNT; i++) {
      dummy.position
        .set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
        .normalize()
        .multiplyScalar(Math.random() * 400);
      dummy.rotation.set(Math.random() * 2, Math.random() * 2, Math.random() * 2);
      dummy.scale.setScalar(Math.random() * 50);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      color.setHex(Math.random() * 0xffffff);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, []);

  // Original: rotation.x += 0.005, rotation.y += 0.01 per frame at an assumed 60fps.
  useFrame(({ delta }) => {
    const group = groupRef.current!;
    group.rotation.x += delta * 0.3;
    group.rotation.y += delta * 0.6;
  });

  return (
    <>
      <fog attach="fog" args={['#000000', 1, 1000]} />
      <ambientLight color="#cccccc" />
      <directionalLight intensity={3} position={[1, 1, 1]} />
      <group ref={groupRef}>
        <instancedMesh ref={meshRef} args={[undefined, undefined, COUNT]}>
          <sphereGeometry args={[1, 4, 4]} />
          <meshPhongNodeMaterial flatShading />
        </instancedMesh>
      </group>
    </>
  );
}

//* Post-processing ===============================================

function GlitchPipeline() {
  const { goWild } = useControls('Glitch', { goWild: { value: false, label: 'Glitch me wild' } });

  // The displacement map for the tear-band lookup — built once, matching the
  // original's `_generateHeightmap()`.
  const dispMap = useMemo(() => {
    const data = new Float32Array(DISP_SIZE * DISP_SIZE);
    for (let i = 0; i < data.length; i++) data[i] = MathUtils.randFloat(0, 1);
    const texture = new DataTexture(data, DISP_SIZE, DISP_SIZE, RedFormat, FloatType);
    texture.needsUpdate = true;
    return texture;
  }, []);

  // All eight are rewritten by Math.random() every frame below — frame-loop owned,
  // so plain create-once uniform() nodes, never useUniforms (AGENTS.md).
  const glitchUniforms = useNodes(() => ({
    byp: uniform(0),
    amount: uniform(0.08),
    angle: uniform(0.02),
    seed: uniform(0.02),
    seedX: uniform(0.02),
    seedY: uniform(0.02),
    distortionX: uniform(0.5),
    distortionY: uniform(0.6),
    colS: uniform(0.05),
  }));

  useRenderPipeline(({ renderPipeline, passes }) => {
    const sceneTexture = passes.scenePass.getTextureNode();
    renderPipeline.outputNode = glitch(sceneTexture, dispMap, glitchUniforms);
  });

  // Mirrors GlitchPass.render(): most frames either hold the current distortion or
  // bypass entirely; every `randX` frames (120-240) a fresh, stronger glitch burst
  // starts, with a settling tail at 1/5 the cycle length. `goWild` skips the holds
  // and bypasses — every frame gets a fresh burst.
  const curF = useRef(0);
  const randX = useRef(MathUtils.randInt(120, 240));

  useFrame(() => {
    glitchUniforms.byp.value = 0;
    glitchUniforms.seed.value = Math.random();

    if (curF.current % randX.current === 0 || goWild) {
      glitchUniforms.amount.value = Math.random() / 30;
      glitchUniforms.angle.value = MathUtils.randFloat(-Math.PI, Math.PI);
      glitchUniforms.seedX.value = MathUtils.randFloat(-1, 1);
      glitchUniforms.seedY.value = MathUtils.randFloat(-1, 1);
      glitchUniforms.distortionX.value = MathUtils.randFloat(0, 1);
      glitchUniforms.distortionY.value = MathUtils.randFloat(0, 1);
      curF.current = 0;
      randX.current = MathUtils.randInt(120, 240);
    } else if (curF.current % randX.current < randX.current / 5) {
      glitchUniforms.amount.value = Math.random() / 90;
      glitchUniforms.angle.value = MathUtils.randFloat(-Math.PI, Math.PI);
      glitchUniforms.distortionX.value = MathUtils.randFloat(0, 1);
      glitchUniforms.distortionY.value = MathUtils.randFloat(0, 1);
      glitchUniforms.seedX.value = MathUtils.randFloat(-0.3, 0.3);
      glitchUniforms.seedY.value = MathUtils.randFloat(-0.3, 0.3);
    } else if (!goWild) {
      glitchUniforms.byp.value = 1;
    }

    curF.current += 1;
  });

  return null;
}

export default function PostprocessingGlitch() {
  return (
    <Canvas
      // The original never sets tone mapping (WebGPURenderer default is none); fiber's
      // Canvas would otherwise default to ACESFilmic.
      renderer={{ toneMapping: NoToneMapping }}
      background="#000000"
      camera={{ position: [0, 0, 400], fov: 70, near: 1, far: 1000 }}>
      {/* GlitchPipeline (a creator-hook component) before the scene, per AGENTS.md's
          B18 mount-order rule. */}
      <GlitchPipeline />
      <GlitchScene />
      <DemoHelpers grid={false} />
    </Canvas>
  );
}

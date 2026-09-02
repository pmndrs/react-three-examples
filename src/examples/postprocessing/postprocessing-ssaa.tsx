/**
 * postprocessing-ssaa
 * 120 tumbling coloured spheres antialiased by brute force: SSAA re-renders the whole
 * scene once per jitter sample and accumulates the results, up to 32 times a frame.
 * Original: https://threejs.org/examples/#webgpu_postprocessing_ssaa
 *
 * DEMONSTRATES
 * - Replacing the pipeline's default scene pass instead of stacking one after it:
 *   `ssaaPass(scene, camera)` IS the render pass, returned from the setupCB under the
 *   `scenePass` key (the register-to-override pattern, cf. `mrt`)
 * - `options.samples = 0` — SSAA copies its sample target's depth into the pass target,
 *   which a multisampled target can't do, and fiber's Canvas defaults to 4x MSAA
 * - Knobs that are NOT uniforms: `sampleLevel` is a plain JS field read in the pass's
 *   own `updateBefore`, and clear colour/alpha live on the renderer — so these reach
 *   the effect through effects on the read-back pass, not through `useUniforms`
 * - `camera.setViewOffset` under SSAA: the pass saves the camera's view offset, adds
 *   its own sub-pixel jitter on top, then restores it — so an off-centre frustum keeps
 *   antialiasing correctly
 * - `<instancedMesh>` with per-instance colour (`setColorAt`) written once in
 *   `useLayoutEffect`, before the first render computes the bounding sphere
 */
import { useEffect, useLayoutEffect, useRef } from 'react';
import { Color, NoToneMapping, Object3D } from 'three/webgpu';
import type { InstancedMesh } from 'three/webgpu';
import { ssaaPass } from 'three/addons/tsl/display/SSAAPassNode.js';
import { Canvas, useFrame, useRenderPipeline, useThree } from '@react-three/fiber/webgpu';
import { useControls } from 'leva';

import { DemoHelpers } from '../../utils/DemoHelpers';

const COUNT = 120;

// The original's two dropdowns, verbatim.
const SAMPLE_LEVELS = { '0: 1 sample': 0, '1: 2': 1, '2: 4': 2, '3: 8': 3, '4: 16': 4, '5: 32': 5 };
const CLEAR_COLORS = { black: '#000000', white: '#ffffff', blue: '#0000ff', green: '#00ff00', red: '#ff0000' };

// Three coloured point lights around the camera plus a dim ambient fill — a small data
// array beats three near-identical JSX blocks.
const LIGHTS = [
  { color: '#efffef', position: [-10, -10, 10] },
  { color: '#ffefef', position: [-10, 10, 10] },
  { color: '#efefff', position: [10, -10, 10] },
] as const;

//* Scene =========================================================

function SphereField() {
  const { autoRotate } = useControls('SSAA', { autoRotate: true });
  const meshRef = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new Object3D();
    const color = new Color();
    for (let i = 0; i < COUNT; i++) {
      dummy.position.set(Math.random() * 4 - 2, Math.random() * 4 - 2, Math.random() * 4 - 2);
      dummy.rotation.set(Math.random(), Math.random(), Math.random());
      dummy.scale.setScalar(Math.random() * 0.2 + 0.05);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, color.setHSL(Math.random(), 1, 0.3));
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  useFrame(({ delta }) => {
    const mesh = meshRef.current;
    if (!mesh || !autoRotate) return;
    mesh.rotation.x += delta * 0.25;
    mesh.rotation.y += delta * 0.5;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, COUNT]}>
      <sphereGeometry args={[3, 48, 24]} />
      <meshStandardMaterial />
    </instancedMesh>
  );
}

//* Post-processing ===============================================

function SsaaPipeline() {
  const { sampleLevel, clearColor, clearAlpha, viewOffsetX } = useControls('SSAA', {
    sampleLevel: { value: 3, options: SAMPLE_LEVELS },
    clearColor: { value: '#000000', options: CLEAR_COLORS },
    clearAlpha: { value: 1, min: 0, max: 1 },
    viewOffsetX: { value: 0, min: -100, max: 100 },
  });

  const renderer = useThree((s) => s.renderer);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);

  const { passes } = useRenderPipeline(
    ({ renderPipeline, passes }) => {
      // SSAA copies its sample target's depth into the pass target, which a
      // multisampled target can't do — and every pass otherwise inherits the
      // renderer's sample count, which fiber's Canvas defaults to 4.
      passes.scenePass.options.samples = 0;
      renderPipeline.outputNode = passes.scenePass.getTextureNode();
    },
    // Register-to-override: SSAA replaces the scene pass rather than post-processing
    // its result, so it is returned under the `scenePass` key (cf. `mrt`).
    ({ scene, camera }) => ({ scenePass: ssaaPass(scene, camera) }),
  );

  // `sampleLevel` is a plain field the pass reads every frame in updateBefore — there
  // is no uniform to write, so the read-back pass is mutated directly.
  useEffect(() => {
    const scenePass = passes.scenePass as ReturnType<typeof ssaaPass> | undefined;
    if (scenePass) scenePass.sampleLevel = sampleLevel;
  }, [passes, sampleLevel]);

  // Each accumulation sample is cleared with the renderer's clear colour, so the
  // supersampled result carries the clear alpha through unpremultiplied.
  useEffect(() => {
    renderer.setClearColor(clearColor, clearAlpha);
  }, [renderer, clearColor, clearAlpha]);

  // An off-centre frustum: SSAA saves this offset, jitters on top of it per sample and
  // restores it afterwards.
  useEffect(() => {
    camera.setViewOffset(size.width, size.height, viewOffsetX, 0, size.width, size.height);
    camera.updateProjectionMatrix();
    return () => camera.clearViewOffset();
  }, [camera, size, viewOffsetX]);

  return null;
}

export default function PostprocessingSsaa() {
  return (
    <Canvas
      // Original never sets a tone mapping (WebGPURenderer default) — fiber's Canvas
      // would otherwise default to ACESFilmic.
      renderer={{ toneMapping: NoToneMapping }}
      camera={{ position: [0, 0, 7], fov: 65, near: 3, far: 10 }}>
      <SsaaPipeline />
      {LIGHTS.map(({ color, position }) => (
        <pointLight key={color} color={color} intensity={500} position={position} />
      ))}
      <ambientLight intensity={0.2} />
      <SphereField />
      {/* near/far are 3/10 in the original — dolly limits keep the field inside them. */}
      <DemoHelpers grid={false} minDistance={4} maxDistance={9} />
    </Canvas>
  );
}

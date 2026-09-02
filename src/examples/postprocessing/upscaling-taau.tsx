/**
 * upscaling-taau
 * The same Littlest Tokyo diorama as `upscaling-fsr1`, rendered at half resolution and
 * reconstructed by TAAU — temporal anti-aliased upsampling. It jitters the camera a
 * fraction of a pixel each frame and reprojects the accumulated history through the
 * motion vectors, so detail is recovered from previous frames rather than invented.
 * Original: https://threejs.org/examples/#webgpu_upscaling_taau
 *
 * DEMONSTRATES
 * - What a temporal upscaler needs from the scene pass: an MRT G-buffer of colour +
 *   `velocity`, plus depth, wired in the setupCB before the graph is built
 * - `options.samples = 0` — TAAU resolves and copies depth, which a multisampled
 *   target can't give it; every pass otherwise inherits the renderer's sample count
 *   (fiber defaults to 4x, and WebGPU rejects the mismatch outright)
 * - Two pass-dynamism patterns side by side: `sharpness` rides a `useUniforms` node
 *   assigned onto `sharpen().sharpness` (pattern (b) — SharpenNode reads the field in
 *   `setup()`), while the two booleans swap whole graphs on `outputNode` (pattern (d))
 * - `setResolutionScale()` as a plain method call in an effect — it resizes a render
 *   target, so it can't ride a uniform
 */
import { Suspense, useEffect } from 'react';
import { NoToneMapping, PMREMGenerator } from 'three/webgpu';
import { mrt, output, velocity } from 'three/tsl';
import { sharpen } from 'three/addons/tsl/display/SharpenNode.js';
import { taau } from 'three/addons/tsl/display/TAAUNode.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Canvas, useRenderPipeline, useThree, useUniforms } from '@react-three/fiber/webgpu';
import { useAnimations, useGLTF } from '@react-three/drei/webgpu';
import { useControls } from 'leva';

import { DemoHelpers } from '../../utils/DemoHelpers';

const MODEL_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/LittlestTokyo.glb';

// The glb's only clip. Played by name — this repo never plays by index.
const TOKYO_CLIP = 'Take 001';

//* Scene =========================================================

function LittlestTokyo() {
  const { scene, animations } = useGLTF(MODEL_URL, { draco: true });
  const { actions } = useAnimations(animations, scene);

  useEffect(() => {
    actions[TOKYO_CLIP]?.play();
  }, [actions]);

  return <primitive object={scene} scale={0.01} />;
}

// RoomEnvironment through PMREM — a scene-level write with no JSX prop. Synchronous,
// so nothing here suspends.
function RoomLighting() {
  const renderer = useThree((state) => state.renderer);
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    const environment = new RoomEnvironment();
    const pmremGenerator = new PMREMGenerator(renderer);
    const envRT = pmremGenerator.fromScene(environment, 0.04);
    scene.environment = envRT.texture;
    environment.dispose();
    pmremGenerator.dispose();

    return () => {
      scene.environment = null;
      envRT.dispose();
    };
  }, [renderer, scene]);

  return null;
}

//* Post-processing ===============================================

function TAAUPipeline() {
  const { upscaleMethod, resolutionScale, sharpening, sharpness } = useControls('TAAU', {
    upscaleMethod: { value: 'TAAU', options: ['Bilinear', 'TAAU'] },
    resolutionScale: { value: 0.5, min: 0.25, max: 1, step: 0.25, label: 'resolution scale' },
    sharpening: true,
    sharpness: { value: 0.2, min: 0, max: 2, step: 0.05 },
  });
  const uniforms = useUniforms({ sharpness });

  const { renderPipeline, passes } = useRenderPipeline(
    ({ renderPipeline, passes, camera }) => {
      const scenePassColor = passes.scenePass.getTextureNode('output');
      const scenePassDepth = passes.scenePass.getTextureNode('depth');
      const scenePassVelocity = passes.scenePass.getTextureNode('velocity');

      const taauPass = taau(scenePassColor, scenePassDepth, scenePassVelocity, camera);

      // Pattern (b): construct with the default, then assign the live uniform onto the
      // field. SharpenNode reads `this.sharpness` in setup(), so the swap lands before
      // the shader compiles — passing it as the factory ARGUMENT is what silently
      // freezes a knob (AGENTS.md B29).
      const sharpenPass = sharpen(taauPass.getTextureNode());
      sharpenPass.sharpness = uniforms.sharpness;

      renderPipeline.outputNode = sharpenPass;
      return { taauPass, sharpenPass };
    },
    ({ passes }) => {
      // TAAU reprojects the previous frame through the motion vectors and resolves
      // depth — neither survives a multisampled target.
      passes.scenePass.options.samples = 0;
      passes.scenePass.setMRT(mrt({ output, velocity }));
    },
  );

  // How much smaller than the canvas the scene renders. A method on the pass, so it
  // can't ride a uniform; the next frame's setSize() resizes the target. `passes` is
  // empty until the pipeline has been built, hence the guard.
  useEffect(() => {
    passes.scenePass?.setResolutionScale(resolutionScale);
  }, [passes, resolutionScale]);

  // Pattern (d): both toggles swap entire graphs, so all three candidates are read
  // back off `passes`. The casts are the documented carve-out — `PassRecord` is
  // `Record<string, any>`, so they ADD type information rather than hide an error.
  useEffect(() => {
    const taauPass = passes.taauPass as ReturnType<typeof taau> | undefined;
    const sharpenPass = passes.sharpenPass as ReturnType<typeof sharpen> | undefined;
    const scenePass = passes.scenePass;
    if (!renderPipeline || !taauPass || !sharpenPass || !scenePass) return;

    if (upscaleMethod !== 'TAAU') renderPipeline.outputNode = scenePass;
    else renderPipeline.outputNode = sharpening ? sharpenPass : taauPass;
    renderPipeline.needsUpdate = true;
  }, [renderPipeline, passes, upscaleMethod, sharpening]);

  return null;
}

export default function UpscalingTaau() {
  return (
    <Canvas
      // The original never sets a tone mapping (WebGPURenderer's default).
      renderer={{ toneMapping: NoToneMapping }}
      background="#bfe3dd"
      camera={{ position: [-0.5, 0, 12], fov: 25, near: 0.1, far: 100 }}>
      {/* Ahead of the suspending model: a creator-hook component mounted after a
          suspending sibling is the B18 trigger (AGENTS.md). */}
      <TAAUPipeline />
      <RoomLighting />

      <Suspense fallback={null}>
        <LittlestTokyo />
      </Suspense>

      <DemoHelpers grid={false} target={[-0.5, 0, 0]} />
    </Canvas>
  );
}

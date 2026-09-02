/**
 * upscaling-fsr1
 * The Littlest Tokyo diorama rendered at a fraction of the window's resolution and
 * blown back up by AMD FidelityFX Super Resolution 1. Flip `upscaleMethod` to
 * Bilinear to see what the same half-res frame looks like without it.
 * Original: https://threejs.org/examples/#webgpu_upscaling_fsr1
 *
 * DEMONSTRATES
 * - Rendering the scene pass smaller than the canvas: `scenePass.setResolutionScale()`
 *   is a plain method, not a uniform — it resizes a render target, so it belongs in an
 *   effect, and `PassNode.setSize()` picks the new scale up on the next frame
 * - The structural output toggle (AGENTS.md post-processing pattern (d)): a boolean
 *   that swaps the whole `outputNode` between two graphs has no field to assign onto,
 *   so both are registered from the mainCB and read back off `passes`
 * - `fsr1()` — an EASU edge-adaptive upsample followed by an RCAS sharpen, each into
 *   its own render target inside the node
 * - Where the controls go: both knobs drive the pipeline, so they live in the pipeline
 *   component rather than the page root
 */
import { Suspense, useEffect } from 'react';
import { NoToneMapping, PMREMGenerator } from 'three/webgpu';
import { fsr1 } from 'three/addons/tsl/display/FSR1Node.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Canvas, useRenderPipeline, useThree } from '@react-three/fiber/webgpu';
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

function FSR1Pipeline() {
  const { upscaleMethod, resolutionScale } = useControls('FSR1', {
    upscaleMethod: { value: 'FSR1', options: ['Bilinear', 'FSR1'] },
    resolutionScale: { value: 0.5, min: 0.25, max: 1, step: 0.25, label: 'resolution scale' },
  });

  const { renderPipeline, passes } = useRenderPipeline(({ renderPipeline, passes }) => {
    const fsr1Pass = fsr1(passes.scenePass);
    renderPipeline.outputNode = fsr1Pass;
    return { fsr1Pass };
  });

  // How much smaller than the canvas the scene renders. A method on the pass, so it
  // can't ride a uniform; the next frame's setSize() resizes the target. `passes` is
  // empty until the pipeline has been built, hence the guard.
  useEffect(() => {
    passes.scenePass?.setResolutionScale(resolutionScale);
  }, [passes, resolutionScale]);

  // Pattern (d): the toggle swaps entire graphs, so both are read back off `passes`.
  // The cast is the documented carve-out — `PassRecord` is `Record<string, any>`, so
  // this ADDS type information rather than hiding an error.
  useEffect(() => {
    const fsr1Pass = passes.fsr1Pass as ReturnType<typeof fsr1> | undefined;
    const scenePass = passes.scenePass;
    if (!renderPipeline || !fsr1Pass || !scenePass) return;
    renderPipeline.outputNode = upscaleMethod === 'FSR1' ? fsr1Pass : scenePass;
    renderPipeline.needsUpdate = true;
  }, [renderPipeline, passes, upscaleMethod]);

  return null;
}

export default function UpscalingFsr1() {
  return (
    <Canvas
      // The original never sets a tone mapping (WebGPURenderer's default).
      renderer={{ toneMapping: NoToneMapping }}
      background="#bfe3dd"
      camera={{ position: [-0.5, 0, 12], fov: 25, near: 0.1, far: 100 }}>
      {/* Ahead of the suspending model: a creator-hook component mounted after a
          suspending sibling is the B18 trigger (AGENTS.md). */}
      <FSR1Pipeline />
      <RoomLighting />

      <Suspense fallback={null}>
        <LittlestTokyo />
      </Suspense>

      <DemoHelpers grid={false} target={[-0.5, 0, 0]} />
    </Canvas>
  );
}

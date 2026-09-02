/**
 * generator-city
 * A few blocks of procedurally generated Neo-Gothic terracotta skyscrapers at
 * sunset, seeded once and regenerated live.
 * Original: https://threejs.org/examples/#webgpu_generator_city (~165 lines of JS)
 *
 * DEMONSTRATES
 * - three.js's `CityGenerator` addon: a fixed block/street layout computed once at
 *   construction, with `city.build()` re-run on every seed change — `build()`
 *   disposes its own previous output internally, so no manual geometry cleanup is
 *   needed on rebuild (pattern: `custom-fog/TerrainForest.tsx`) (`City.tsx`)
 * - A bloom pass added straight back onto the scene color
 *   (`scenePassColor.add(bloomPass)`), with `bloomPass.strength` swapped for a live
 *   `useUniforms` node before the shader compiles (pattern: `postprocessing-bloom`)
 * - `SkyMesh` reparented by hand between a hidden bake scene and the visible scene,
 *   baked into `scene.environment` for IBL (`Sky.tsx`, shared shape with
 *   `generator-building/Sky.tsx` — this one's shadow frustum is a fixed box sized to
 *   the whole layout rather than fit to a single tower)
 *
 * DIVERGENCE from original
 * - `renderer.inspector.createParameters` dat.gui panel replaced with leva (seed,
 *   time of day, exposure, bloom strength)
 * - `FirstPersonControls` (WASD fly-through) replaced by DemoHelpers' CameraControls
 *   orbit; target matches the original's `controls.lookAt(35, 55, 0)`
 */
import { useEffect } from 'react';
import { ACESFilmicToneMapping } from 'three/webgpu';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';

import { Canvas, useRenderPipeline, useThree, useUniforms } from '@react-three/fiber/webgpu';
import { useControls } from 'leva';

import { DemoHelpers } from '../../../utils/DemoHelpers';
import { City } from './City';
import { Sky } from './Sky';

//* Post-processing ===============================================

function BloomPipeline() {
  const { exposure, strength } = useControls('generator-city', {
    exposure: { value: 0.45, min: 0.01, max: 1, step: 0.01 },
    strength: { value: 0.05, min: 0, max: 2, step: 0.01, label: 'bloom' },
  });
  const { strength: strengthNode } = useUniforms({ strength });
  const renderer = useThree((state) => state.renderer);

  useRenderPipeline(({ renderPipeline, passes }) => {
    const scenePassColor = passes.scenePass.getTextureNode('output');
    const bloomPass = bloom(scenePassColor, 0.05, 0, 0);
    // bloom() builds its own strength/radius/threshold uniforms; swap ours in before
    // the shader compiles, so leva drives the pass with no rebuild.
    bloomPass.strength = strengthNode;
    renderPipeline.outputNode = scenePassColor.add(bloomPass);
  });

  // Renderer property, not a node — no place in the graph.
  useEffect(() => {
    renderer.toneMappingExposure = exposure;
  }, [renderer, exposure]);

  return null;
}

//* Scene ==========================================================

export default function GeneratorCity() {
  const { seed, timeOfDay } = useControls('generator-city', {
    seed: { value: 94, min: 0, max: 100, step: 1 },
    timeOfDay: { value: 6.4, min: 6, max: 18, step: 0.1, label: 'time of day' },
  });

  return (
    <Canvas
      shadows
      renderer={{ toneMapping: ACESFilmicToneMapping }}
      camera={{ position: [-35, 55, -100], fov: 55, near: 1, far: 20000 }}>
      <Sky timeOfDay={timeOfDay} />
      <City seed={seed} />
      <BloomPipeline />
      <DemoHelpers grid={false} target={[35, 55, 0]} minDistance={20} maxDistance={800} />
    </Canvas>
  );
}

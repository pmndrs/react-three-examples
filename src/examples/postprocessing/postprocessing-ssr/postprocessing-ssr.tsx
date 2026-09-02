/**
 * postprocessing-ssr
 * A steampunk camera on a polished metal disc — every reflection in the floor is
 * ray-marched from the screen-space G-buffer, not from a cube map.
 * Original: https://threejs.org/examples/#webgpu_postprocessing_ssr
 *
 * DEMONSTRATES
 * - A G-buffer built with one `mrt()` call: beauty, RGB-packed view normals, and
 *   `vec2(metalness, roughness)` packed into a single extra attachment
 * - `ssr()` consuming that G-buffer, with its uniform-backed knobs swapped for live
 *   `useUniforms` nodes and its two BUILD-time constants (blur quality, binary
 *   refinement) assigned as plain values that rebake the shader
 * - Additive compositing: SSR returns premultiplied color, so it is `add`ed over the
 *   beauty pass before `smaa()` resolves the edges
 * - A TSL `scene.backgroundNode` radial gradient built from `screenUV`
 * - Where a control belongs: the SSR knobs sit with the pipeline, the model roughness
 *   sits with the model whose materials it mutates
 */
import { Suspense, useEffect } from 'react';
import { color, screenUV } from 'three/tsl';
import { ACESFilmicToneMapping, PMREMGenerator } from 'three/webgpu';
import type { Node } from 'three/webgpu';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Canvas, useThree } from '@react-three/fiber/webgpu';

import { DemoHelpers } from '../../../utils/DemoHelpers';
import { SSRPipeline } from './SSRPipeline';
import { SteampunkCamera } from './SteampunkCamera';

//* Scene =========================================================

// RoomEnvironment → PMREM → scene.environment, plus the screen-space gradient
// backdrop. Both are node/scene-level writes the JSX tree has no prop for; the
// `backgroundNode` cast is the documented `@types/three` gap (AGENTS.md B11).
function Backdrop() {
  const renderer = useThree((s) => s.renderer);
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    const environment = new RoomEnvironment();
    const pmremGenerator = new PMREMGenerator(renderer);
    const envRT = pmremGenerator.fromScene(environment, 0.04);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 1.25;
    environment.dispose();
    pmremGenerator.dispose();

    const withBackgroundNode = scene as unknown as { backgroundNode: Node | null };
    // `.mix` is mixElement — the CALLING node is the factor, so the vignette distance
    // drives the blend from the warm center color to the darker rim.
    withBackgroundNode.backgroundNode = screenUV.distance(0.5).remap(0, 0.5).mix(color(0x888877), color(0x776666));

    return () => {
      scene.environment = null;
      withBackgroundNode.backgroundNode = null;
      envRT.dispose();
    };
  }, [renderer, scene]);

  return null;
}

export default function PostprocessingSSR() {
  return (
    <Canvas
      renderer={{ toneMapping: ACESFilmicToneMapping }}
      camera={{ position: [3, 2, 3], fov: 35, near: 0.1, far: 50 }}>
      {/* SSRPipeline (a creator-hook component: useRenderPipeline + useUniforms)
          renders BEFORE the suspending model — a creator hook after a suspending
          sibling can escalate into the B17 pixel freeze (AGENTS.md). */}
      <SSRPipeline />
      <Backdrop />

      {/* The mirror: a metalness-1 disc is what makes the reflections legible. */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.8}>
        <circleGeometry args={[2, 64]} />
        <meshStandardMaterial color="#ffffff" metalness={1} roughness={0.5} />
      </mesh>

      <Suspense fallback={null}>
        <SteampunkCamera />
      </Suspense>

      <DemoHelpers grid={false} />
    </Canvas>
  );
}

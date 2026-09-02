/**
 * custom-fog-scattering
 * A stand of 156 procedurally-generated pines dissolving into a bright fog bank, with
 * a post-processing pass that blurs distant pixels more than near ones — simulating
 * how real fog scatters light.
 * Original: https://threejs.org/examples/#webgpu_custom_fog_scattering (~180 lines of JS)
 *
 * DEMONSTRATES
 * - Two fog effects layered on top of each other: a declarative `<fogExp2>` (auto-
 *   wrapped into a fog node) fades every silhouette into the fog color during the
 *   normal scene pass, THEN a post-processing pass gaussian-blurs the same pass's
 *   color texture and mixes toward the blur by `densityFogFactor` — the "scattering"
 *   the header describes, distance haze that also softens focus
 * - `gaussianBlur(scenePassColor, vec2(scattering), 4, { resolutionScale: 0.5 })` —
 *   the addon's own half-resolution blur target keeps the pass cheap
 * - Toggling the whole effect at runtime by swapping `renderPipeline.outputNode`
 *   between the composited and the bypass node, then `renderPipeline.needsUpdate =
 *   true` (pattern: `postprocessing-sobel`) — a `.value` mutation alone can't switch
 *   between two structurally different graphs
 * - three.js's `TreeGenerator` addon building six seeded pine variants once, instanced
 *   across a jittered grid (`Forest.tsx`) — no lights anywhere; the flat black
 *   silhouette material lets the fog alone do the shaping
 *
 * DIVERGENCE from original
 * - `FirstPersonControls` (WASD fly-through) replaced by DemoHelpers' CameraControls
 *   orbit (house baseline); grid disabled — the ground here IS the fogged forest floor
 * - `density` and `scattering` are shared by the fog and the post pass, so leva lives
 *   in this shared parent (house rule) and flows down as plain props/uniforms, not a
 *   `reference()` node bound to `scene.fog` — leva is already the single source of
 *   truth, so nothing needs to read it back off the live Fog instance
 */
import { useEffect } from 'react';
import { densityFogFactor, mix, vec2 } from 'three/tsl';
import type { Node } from 'three/webgpu';
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js';
import { Canvas, useRenderPipeline, useUniforms } from '@react-three/fiber/webgpu';
import { useControls } from 'leva';

import { DemoHelpers } from '../../../utils/DemoHelpers';
import { Forest } from './Forest';

const FOG_COLOR = '#c6cace'; // a bright, cool haze — the background matches it below

//* Post-processing ===============================================

interface ScatteringFogProps {
  density: number;
  scattering: number;
  scatteringEnabled: boolean;
}

function ScatteringFog({ density, scattering, scatteringEnabled }: ScatteringFogProps) {
  const { fogDensity, fogScattering } = useUniforms({ fogDensity: density, fogScattering: scattering });

  const { renderPipeline, passes } = useRenderPipeline(({ renderPipeline, passes }) => {
    const scenePassColor = passes.scenePass.getTextureNode('output');
    const scenePassViewZ = passes.scenePass.getViewZNode();

    // Blur pass, always downsampled to improve performance.
    const sceneColorBlurred = gaussianBlur(scenePassColor, vec2(fogScattering), 4, { resolutionScale: 0.5 });
    const fogFactor = densityFogFactor(fogDensity).context({ getViewZ: () => scenePassViewZ });
    const compositeNode = mix(scenePassColor, sceneColorBlurred, fogFactor);

    renderPipeline.outputNode = compositeNode;

    return { scenePassColor, compositeNode };
  });

  // Toggling scattering swaps the WHOLE output graph (bypass vs. composited) — not a
  // `.value` mutation, so it needs the explicit needsUpdate dance (see header).
  useEffect(() => {
    const scenePassColor = passes.scenePassColor as Node | undefined;
    const compositeNode = passes.compositeNode as Node | undefined;
    if (!renderPipeline || !scenePassColor || !compositeNode) return;
    renderPipeline.outputNode = scatteringEnabled ? compositeNode : scenePassColor;
    renderPipeline.needsUpdate = true;
  }, [renderPipeline, passes, scatteringEnabled]);

  return null;
}

export default function CustomFogScattering() {
  // Shared by the scene-level fog and the post pass — see header DIVERGENCE.
  const { density, scattering, scatteringEnabled } = useControls('custom-fog-scattering', {
    density: { value: 0.11, min: 0.025, max: 0.16, step: 0.0005, label: 'fog density' },
    scattering: { value: 2, min: 0, max: 5, label: 'scattering factor' },
    scatteringEnabled: { value: true, label: 'enable scattering' },
  });

  return (
    <Canvas background={FOG_COLOR} camera={{ position: [0.4, 1.7, 9], fov: 55, near: 0.1, far: 120 }}>
      <fogExp2 attach="fog" args={[FOG_COLOR, density]} />
      <Forest />
      <ScatteringFog density={density} scattering={scattering} scatteringEnabled={scatteringEnabled} />
      <DemoHelpers grid={false} target={[-0.2, 1.7, -8]} minDistance={0.5} maxDistance={60} />
    </Canvas>
  );
}

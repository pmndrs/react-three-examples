// `renderer.lighting = new ClusteredLighting()` (Forward+ clustered shading) plus a
// debug overlay tinting each screen tile by how many lights its cluster holds, at a
// chosen depth slice — see the page header for the full DEMONSTRATES.
import { useEffect, useLayoutEffect } from 'react';
import type { ClusteredLighting } from 'three/addons/lighting/ClusteredLighting.js';
import type ClusteredLightsNode from 'three/addons/tsl/lighting/ClusteredLightsNode.js';
import { float, mix, step, uniform, vec3 } from 'three/tsl';

import { useNodes, useRenderPipeline, useThree, useUniforms } from '@react-three/fiber/webgpu';
import { folder, useControls } from 'leva';

export function ClusteredPipeline({ lighting }: { lighting: ClusteredLighting }) {
  const scene = useThree((s) => s.scene);
  const renderer = useThree((s) => s.renderer);
  const size = useThree((s) => s.size);

  const { clusterInfluence, debugZSlice } = useControls('lights-clustered', {
    overlay: folder({
      clusterInfluence: { value: 0, min: 0, max: 0.7, label: 'lights per tile' },
      debugZSlice: { value: 10, min: 0, max: lighting.zSlices - 1, step: 1, label: 'z-slice' },
    }),
  });
  const { clusterInfluence: clusterInfluenceNode } = useUniforms({ clusterInfluence });

  // `debugZSlice` must be an INT uniform (`getClusterLightCount` indexes a slice
  // texture) — `useUniforms` only infers 'float' from a raw number, so this is built
  // once via useNodes and mutated in the effect below (same uniform()-backed-field
  // idiom as sky.tsx).
  const { debugZSliceNode } = useNodes(() => ({ debugZSliceNode: uniform(10, 'int') }));
  useEffect(() => {
    debugZSliceNode.value = debugZSlice;
  }, [debugZSliceNode, debugZSlice]);

  // The overlay samples the cluster grid at the current render resolution, so its
  // internal textures are resized whenever the canvas is — orthogonal to the shader
  // graph below, which is built once (AGENTS.md: pipeline callbacks don't re-run).
  // Layout effect, not passive: `setSize()` is also what allocates the cluster-index
  // uniform the overlay graph reads (`getClusterLightCount`) — it must run before the
  // first RAF render builds that graph, or the read observes a not-yet-created buffer.
  useLayoutEffect(() => {
    const lightingNode = lighting.getNode(scene) as ClusteredLightsNode;
    const dpr = renderer.getPixelRatio();
    lightingNode.setSize(size.width * dpr, size.height * dpr);
  }, [lighting, scene, renderer, size]);

  useRenderPipeline(({ renderPipeline, passes, scene: pipelineScene }) => {
    if (!renderPipeline) return;

    const lightingNode = lighting.getNode(pipelineScene) as ClusteredLightsNode;
    const lightCount = lightingNode.getClusterLightCount(debugZSliceNode);
    const heatmap = float(lightCount).div(float(lighting.maxLightsPerCluster));

    // Blue -> green -> red gradient by cluster occupancy.
    let heatColor = mix(vec3(0, 0, 1), vec3(0, 1, 0), heatmap.mul(2).saturate());
    heatColor = mix(heatColor, vec3(1, 0, 0), heatmap.sub(0.5).mul(2).saturate());

    // step() keeps empty clusters fully transparent regardless of the slider.
    const finalInfluence = clusterInfluenceNode.mul(step(0.0001, heatmap));
    const sceneColor = passes.scenePass.getTextureNode();
    renderPipeline.outputNode = mix(sceneColor, heatColor, finalInfluence);
  });

  return null;
}

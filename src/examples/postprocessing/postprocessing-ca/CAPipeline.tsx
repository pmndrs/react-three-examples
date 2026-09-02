// chromaticAberration() over the tone-mapped scene, same outputColorTransform=false +
// manual renderOutput() shape as postprocessing-fxaa. Unlike fxaa()/smaa()/sobel(),
// the addon wraps plain numbers in CONST nodes (nodeObject()) rather than exposing its
// own uniform()-backed fields — pattern (c): the caller creates three/tsl uniform()
// nodes and passes THEM in, exactly what the original does with its `staticStrength` /
// `staticCenter` / `staticScale` uniforms.
import { useEffect } from 'react';
import { renderOutput, uniform } from 'three/tsl';
import { chromaticAberration } from 'three/addons/tsl/display/ChromaticAberrationNode.js';
import { Vector2 } from 'three/webgpu';
import type { UniformNode } from 'three/webgpu';
import { useRenderPipeline } from '@react-three/fiber/webgpu';
import { useControls } from 'leva';

export function CAPipeline() {
  const { enabled, strength, centerX, centerY, scale } = useControls('Chromatic Aberration', {
    enabled: true,
    strength: { value: 1.5, min: 0, max: 3, step: 0.01 },
    centerX: { value: 0.5, min: -1, max: 1, step: 0.01 },
    centerY: { value: 0.5, min: -1, max: 1, step: 0.01 },
    scale: { value: 1.2, min: 0.5, max: 2, step: 0.01 },
  });

  const { renderPipeline, passes } = useRenderPipeline(({ renderPipeline, passes }) => {
    renderPipeline.outputColorTransform = false;

    const scenePassColor = passes.scenePass.getTextureNode();
    const outputPass = renderOutput(scenePassColor);

    // Initial values come from the closure ONCE (pipeline callbacks never re-run on
    // re-render); every later change flows through the registered uniforms below.
    const uStrength = uniform(strength);
    const uCenter = uniform(new Vector2(centerX, centerY));
    const uScale = uniform(scale);

    const caPass = chromaticAberration(outputPass, uStrength, uCenter, uScale);

    return { outputPass, caPass, uStrength, uCenter, uScale };
  });

  useEffect(() => {
    const outputPass = passes.outputPass as ReturnType<typeof renderOutput> | undefined;
    const caPass = passes.caPass as ReturnType<typeof chromaticAberration> | undefined;
    if (!renderPipeline || !outputPass || !caPass) return;
    renderPipeline.outputNode = enabled ? caPass : outputPass;
    renderPipeline.needsUpdate = true;
  }, [renderPipeline, passes, enabled]);

  useEffect(() => {
    // Only `.value` is touched, so the node-type params can stay unknown.
    const uStrength = passes.uStrength as UniformNode<unknown, number> | undefined;
    const uCenter = passes.uCenter as UniformNode<unknown, Vector2> | undefined;
    const uScale = passes.uScale as UniformNode<unknown, number> | undefined;
    if (!uStrength || !uCenter || !uScale) return;
    uStrength.value = strength;
    uCenter.value.set(centerX, centerY);
    uScale.value = scale;
  }, [passes, strength, centerX, centerY, scale]);

  return null;
}

// Screen-space shadows pipeline: a velocity-only pre-pass supplies depth + motion
// vectors, `sss()` ray-marches that depth against the sun direction to recover the
// contact shadows the 1024px shadow map drops, and the result is folded into the
// scene pass's BUILT-IN shadow term (`builtinShadowContext`) rather than multiplied
// over the beauty. TRAA then resolves the pass's per-frame sampling jitter.
import { useEffect } from 'react';
import { sss } from 'three/addons/tsl/display/SSSNode.js';
import { traa } from 'three/addons/tsl/display/TRAANode.js';
import { builtinShadowContext, mrt, pass, screenUV, vec3, vec4, velocity } from 'three/tsl';
import type { DirectionalLight } from 'three/webgpu';
import { useRenderPipeline, useUniforms } from '@react-three/fiber/webgpu';
import { useControls } from 'leva';

type Output = 'shadow maps + SSS' | 'shadow maps only' | 'SSS only';
const OUTPUTS: Output[] = ['shadow maps + SSS', 'shadow maps only', 'SSS only'];

export interface SSSPipelineProps {
  /** The sun the rays are marched toward; `sss()` needs the light itself, not a node. */
  light: DirectionalLight;
}

export function SSSPipeline({ light }: SSSPipelineProps) {
  const { output, temporalFiltering, ...sssValues } = useControls('SSS', {
    output: { value: 'shadow maps + SSS' as Output, options: OUTPUTS },
    shadowIntensity: { value: 1, min: 0, max: 1, step: 0.01 },
    maxDistance: { value: 0.2, min: 0.01, max: 1, step: 0.01 },
    quality: { value: 0.5, min: 0, max: 1, step: 0.01 },
    thickness: { value: 0.01, min: 0.01, max: 0.1, step: 0.001 },
    temporalFiltering: true,
  });
  const uniforms = useUniforms(sssValues);

  const { renderPipeline, passes } = useRenderPipeline(({ renderPipeline, passes, scene, camera }) => {
    // TRAA copies the depth history texture and SSS ray-marches depth — neither
    // survives a multisampled target, and fiber's Canvas defaults to MSAA 4x.
    passes.scenePass.options.samples = 0;

    // Pre-pass: depth + velocity only, opaque objects. Built in the mainCB because
    // it is an EXTRA pass, not MRT config on the existing one.
    const prePass = pass(scene, camera, { samples: 0 });
    prePass.name = 'Pre-Pass';
    prePass.transparent = false;
    prePass.setMRT(mrt({ output: velocity }));

    const prePassDepth = prePass.getTextureNode('depth');
    const prePassVelocity = prePass.getTextureNode('output');

    // Pattern (b): every knob is a float `uniform()` field SSSNode reads in setup(),
    // so swapping in our live nodes before the shader compiles is all it takes.
    const sssPass = sss(prePassDepth, camera, light);
    sssPass.shadowIntensity = uniforms.shadowIntensity;
    sssPass.maxDistance = uniforms.maxDistance;
    sssPass.quality = uniforms.quality;
    sssPass.thickness = uniforms.thickness;

    // The payoff line: instead of darkening the final image, the SSS term is handed
    // to the scene pass as its shadow context, so it attenuates the DIRECT light
    // contribution the same way a shadow map does.
    const sssSample = sssPass.getTextureNode().sample(screenUV).r;
    const sssContext = builtinShadowContext(sssSample, light);
    passes.scenePass.contextNode = sssContext;

    const traaPass = traa(passes.scenePass, prePassDepth, prePassVelocity, camera);
    renderPipeline.outputNode = traaPass;

    // Debug view: the raw screen-space shadow term as grayscale.
    const sssOnlyNode = vec4(vec3(sssSample), 1);

    return { sssPass, traaPass, sssContext, sssOnlyNode };
  });

  // Pattern (d): the output selector and the temporal-filtering toggle both swap
  // whole graphs — the context node on the scene pass and the pipeline output —
  // so they need `needsUpdate`, not a uniform. The original couples them the same
  // way: with TRAA off, the pipeline outputs the scene pass directly.
  useEffect(() => {
    const sssPass = passes.sssPass as ReturnType<typeof sss> | undefined;
    const traaPass = passes.traaPass as ReturnType<typeof traa> | undefined;
    const sssContext = passes.sssContext as ReturnType<typeof builtinShadowContext> | undefined;
    const sssOnlyNode = passes.sssOnlyNode as ReturnType<typeof vec4> | undefined;
    if (!renderPipeline || !sssPass || !traaPass || !sssContext || !sssOnlyNode) return;

    sssPass.useTemporalFiltering = temporalFiltering;
    passes.scenePass.contextNode = output === 'shadow maps only' ? null : sssContext;

    if (output === 'SSS only') renderPipeline.outputNode = sssOnlyNode;
    else renderPipeline.outputNode = temporalFiltering ? traaPass : passes.scenePass;

    renderPipeline.needsUpdate = true;
  }, [renderPipeline, passes, output, temporalFiltering]);

  return null;
}

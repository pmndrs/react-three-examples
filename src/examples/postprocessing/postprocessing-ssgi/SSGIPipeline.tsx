// SSGI pipeline: one MRT scene pass supplies beauty, albedo, packed normals and
// motion vectors; `ssgi()` horizon-traces that G-buffer into TWO outputs (an
// occlusion term and a bounced-light term), which are composited back as
// `beauty * AO + albedo * GI` and resolved by TRAA.
import { useEffect } from 'react';
import { ssgi } from 'three/addons/tsl/display/SSGINode.js';
import { traa } from 'three/addons/tsl/display/TRAANode.js';
import {
  add,
  diffuseColor,
  mrt,
  normalView,
  output,
  packNormalToRGB,
  sample,
  unpackRGBToNormal,
  vec3,
  vec4,
  velocity,
} from 'three/tsl';
import { PerspectiveCamera, UnsignedByteType } from 'three/webgpu';
import { useRenderPipeline, useUniforms } from '@react-three/fiber/webgpu';
import { useControls } from 'leva';

type Output = 'combined' | 'direct' | 'AO' | 'GI';
const OUTPUTS: Output[] = ['combined', 'direct', 'AO', 'GI'];

export function SSGIPipeline() {
  const {
    output: outputMode,
    temporalFiltering,
    sliceCount,
    stepCount,
    useLinearThickness,
    useScreenSpaceSampling,
    ...traceValues
  } = useControls('SSGI', {
    output: { value: 'combined' as Output, options: OUTPUTS },
    sliceCount: { value: 2, min: 1, max: 4, step: 1 },
    stepCount: { value: 8, min: 1, max: 32, step: 1 },
    radius: { value: 12, min: 1, max: 25, step: 0.1 },
    expFactor: { value: 2, min: 1, max: 3, step: 0.01 },
    thickness: { value: 1, min: 0.01, max: 10, step: 0.01 },
    backfaceLighting: { value: 0, min: 0, max: 1, step: 0.01 },
    aoIntensity: { value: 1, min: 0, max: 4, step: 0.01 },
    giIntensity: { value: 10, min: 0, max: 100, step: 0.1 },
    useLinearThickness: false,
    useScreenSpaceSampling: true,
    temporalFiltering: true,
  });
  const uniforms = useUniforms(traceValues);

  const { renderPipeline, passes } = useRenderPipeline(
    ({ renderPipeline, passes, camera }) => {
      // SSGINode sizes its trace radius from the vertical FOV, so it genuinely needs a
      // PerspectiveCamera — narrow fiber's `state.camera` union rather than cast it.
      if (!(camera instanceof PerspectiveCamera)) return;

      // SSGI traces depth and TRAA copies the depth history — neither survives a
      // multisampled target, and fiber's Canvas defaults to MSAA 4x.
      passes.scenePass.options.samples = 0;

      const scenePassColor = passes.scenePass.getTextureNode('output');
      const scenePassDiffuse = passes.scenePass.getTextureNode('diffuseColor');
      const scenePassDepth = passes.scenePass.getTextureNode('depth');
      const scenePassNormal = passes.scenePass.getTextureNode('normal');
      const scenePassVelocity = passes.scenePass.getTextureNode('velocity');

      // Bandwidth: albedo and packed normals both fit in 8 bits per channel.
      passes.scenePass.getTexture('diffuseColor').type = UnsignedByteType;
      passes.scenePass.getTexture('normal').type = UnsignedByteType;

      const sceneNormal = sample((uv) => unpackRGBToNormal(scenePassNormal.sample(uv)));

      // Pattern (b) for the float knobs: SSGINode reads these `uniform()` fields when
      // it builds its trace, so live nodes swapped in here need no further plumbing.
      const giPass = ssgi(scenePassColor, scenePassDepth, sceneNormal, camera);
      giPass.radius = uniforms.radius;
      giPass.expFactor = uniforms.expFactor;
      giPass.thickness = uniforms.thickness;
      giPass.backfaceLighting = uniforms.backfaceLighting;
      giPass.aoIntensity = uniforms.aoIntensity;
      giPass.giIntensity = uniforms.giIntensity;

      // Two separate results out of one trace.
      const ao = giPass.getAONode();
      const gi = giPass.getGINode();

      // Occlusion modulates the lit image; bounced light is tinted by ALBEDO, not by
      // the already-lit beauty — that is what makes the red and green walls bleed.
      const compositePass = vec4(add(scenePassColor.rgb.mul(ao.r), scenePassDiffuse.rgb.mul(gi.rgb)), scenePassColor.a);
      compositePass.name = 'Composite';

      const traaPass = traa(compositePass, scenePassDepth, scenePassVelocity, camera);
      renderPipeline.outputNode = traaPass;

      return {
        giPass,
        traaPass,
        compositePass,
        directNode: scenePassColor,
        aoOnlyNode: vec4(vec3(ao), 1),
        giOnlyNode: vec4(gi, 1),
      };
    },
    ({ passes }) => {
      passes.scenePass.setMRT(
        mrt({
          output,
          // Albedo before lighting — the GI term needs the surface color, not the
          // shaded result, or the bounce would be double-lit.
          diffuseColor,
          normal: packNormalToRGB(normalView),
          velocity,
        }),
      );
    },
  );

  // The remaining knobs are uint (slice/step count) and bool (the sampling switches)
  // uniforms, which `useUniforms` cannot produce from a JS number — so these four
  // stay on `.value` mutation, the same call postprocessing-godrays makes.
  useEffect(() => {
    const giPass = passes.giPass as ReturnType<typeof ssgi> | undefined;
    if (!giPass) return;
    giPass.sliceCount.value = sliceCount;
    giPass.stepCount.value = stepCount;
    giPass.useLinearThickness.value = useLinearThickness;
    giPass.useScreenSpaceSampling.value = useScreenSpaceSampling;
  }, [passes, sliceCount, stepCount, useLinearThickness, useScreenSpaceSampling]);

  // Pattern (d): the output selector picks between four different graphs, and the
  // temporal-filtering toggle decides whether "combined" goes through TRAA — both
  // are structural swaps that need `needsUpdate`, not uniforms.
  useEffect(() => {
    const giPass = passes.giPass as ReturnType<typeof ssgi> | undefined;
    if (!renderPipeline || !giPass) return;
    giPass.useTemporalFiltering = temporalFiltering;

    const combined = temporalFiltering ? passes.traaPass : passes.compositePass;
    const selected =
      outputMode === 'direct'
        ? passes.directNode
        : outputMode === 'AO'
          ? passes.aoOnlyNode
          : outputMode === 'GI'
            ? passes.giOnlyNode
            : combined;

    renderPipeline.outputNode = selected as ReturnType<typeof vec4>;
    renderPipeline.needsUpdate = true;
  }, [renderPipeline, passes, outputMode, temporalFiltering]);

  return null;
}

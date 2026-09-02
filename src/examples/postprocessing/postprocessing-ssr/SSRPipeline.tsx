// SSR render pipeline: the scene pass writes beauty + packed view normals +
// (metalness, roughness) through MRT, `ssr()` ray-marches that G-buffer in screen
// space, and the premultiplied reflection is added over the beauty before SMAA.
import { useEffect } from 'react';
import { ssr } from 'three/addons/tsl/display/SSRNode.js';
import { smaa } from 'three/addons/tsl/display/SMAANode.js';
import {
  metalness,
  mrt,
  normalView,
  output,
  packNormalToRGB,
  roughness,
  sample,
  unpackRGBToNormal,
  vec2,
} from 'three/tsl';
import { UnsignedByteType } from 'three/webgpu';
import { useRenderPipeline, useUniforms } from '@react-three/fiber/webgpu';
import { useControls } from 'leva';

export function SSRPipeline() {
  const { enabled, blurQuality, binaryRefine, ...ssrValues } = useControls('SSR', {
    quality: { value: 0.5, min: 0, max: 1, step: 0.01 },
    blurQuality: { value: 1, min: 1, max: 3, step: 1 },
    maxDistance: { value: 1, min: 0, max: 1, step: 0.01 },
    intensity: { value: 1, min: 0, max: 1, step: 0.01 },
    thickness: { value: 0.03, min: 0, max: 0.05, step: 0.001 },
    binaryRefine: false,
    enabled: true,
  });
  const uniforms = useUniforms(ssrValues);

  const { renderPipeline, passes } = useRenderPipeline(
    ({ renderPipeline, passes }) => {
      // SSR ray-marches the scene pass's DEPTH texture at arbitrary UVs, which WebGPU
      // rejects on a multisampled target (fiber's Canvas defaults to MSAA 4x). smaa()
      // is the antialiasing here anyway, exactly as in the original.
      passes.scenePass.options.samples = 0;

      const scenePassColor = passes.scenePass.getTextureNode('output');
      const scenePassNormal = passes.scenePass.getTextureNode('normal');
      const scenePassDepth = passes.scenePass.getTextureNode('depth');
      const scenePassMetalRough = passes.scenePass.getTextureNode('metalrough');

      // Bandwidth: packed normals and the metal/rough pair both fit in 8 bits/channel.
      passes.scenePass.getTexture('normal').type = UnsignedByteType;
      passes.scenePass.getTexture('metalrough').type = UnsignedByteType;

      const sceneNormal = sample((uv) => unpackRGBToNormal(scenePassNormal.sample(uv)));

      // Dynamism pattern (b): every knob below is a public `uniform()`-backed float
      // field that SSRNode reads in `setup()`, so swapping our live nodes in before
      // the shader compiles is enough — no per-frame plumbing.
      const ssrPass = ssr(scenePassColor, scenePassDepth, sceneNormal, {
        metalnessNode: scenePassMetalRough.r,
        roughnessNode: scenePassMetalRough.g,
      });
      ssrPass.quality = uniforms.quality;
      ssrPass.maxDistance = uniforms.maxDistance;
      ssrPass.intensity = uniforms.intensity;
      ssrPass.thickness = uniforms.thickness;

      // SSR outputs premultiplied color, so it blends ADDITIVELY over the beauty.
      const outputPass = smaa(scenePassColor.add(ssrPass.rgb));
      renderPipeline.outputNode = outputPass;

      return { ssrPass, outputPass };
    },
    ({ passes }) => {
      // MRT config belongs in the setupCB. `metalrough` packs two scalars into one
      // attachment rather than spending a whole target on each.
      passes.scenePass.setMRT(
        mrt({
          output,
          normal: packNormalToRGB(normalView),
          metalrough: vec2(metalness, roughness),
        }),
      );
    },
  );

  // blurQuality and binaryRefine are BUILD-time constants — their setters rebake the
  // blur / SSR materials, so they can't ride a uniform. Assigning the plain value is
  // what the original's GUI does (each setter no-ops when unchanged).
  useEffect(() => {
    const ssrPass = passes.ssrPass as ReturnType<typeof ssr> | undefined;
    if (!ssrPass) return;
    ssrPass.blurQuality = blurQuality;
    ssrPass.binaryRefine = binaryRefine;
  }, [passes, blurQuality, binaryRefine]);

  // Dynamism pattern (d): `enabled` swaps two different graphs (SSR composite vs. the
  // raw scene pass), so it needs an output swap plus a pipeline update, not a uniform.
  useEffect(() => {
    const outputPass = passes.outputPass as ReturnType<typeof smaa> | undefined;
    if (!renderPipeline || !outputPass) return;
    renderPipeline.outputNode = enabled ? outputPass : passes.scenePass;
    renderPipeline.needsUpdate = true;
  }, [renderPipeline, passes, enabled]);

  return null;
}

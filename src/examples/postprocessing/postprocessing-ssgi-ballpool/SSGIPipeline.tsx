// One MRT scene pass supplies beauty, albedo, packed normals and motion vectors;
// `ssgi()` horizon-traces that G-buffer into TWO results (occlusion and bounced
// light), recomposited as `beauty * AO + albedo * GI` and resolved by TRAA.
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
  vec4,
  velocity,
} from 'three/tsl';
import { PerspectiveCamera, UnsignedByteType } from 'three/webgpu';
import { useRenderPipeline } from '@react-three/fiber/webgpu';

export function SSGIPipeline() {
  useRenderPipeline(
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

      const giPass = ssgi(scenePassColor, scenePassDepth, sceneNormal, camera);
      // SSGINode's own "medium quality" preset. Both are `uniform(_, 'uint')`, which
      // `useUniforms` cannot produce from a JS number — hence the plain `.value` write.
      giPass.sliceCount.value = 2;
      giPass.stepCount.value = 8;

      // Two separate results out of one trace: occlusion modulates the lit image, while
      // bounced light is tinted by ALBEDO — multiplying it into the already-lit beauty
      // would double-light every bounce.
      const ao = giPass.getAONode();
      const gi = giPass.getGINode();
      const compositePass = vec4(add(scenePassColor.rgb.mul(ao.r), scenePassDiffuse.rgb.mul(gi.rgb)), scenePassColor.a);

      renderPipeline.outputNode = traa(compositePass, scenePassDepth, scenePassVelocity, camera);
    },
    ({ passes }) => {
      passes.scenePass.setMRT(
        mrt({
          output,
          // Albedo before lighting — the GI term needs the surface color, not the
          // shaded result.
          diffuseColor,
          normal: packNormalToRGB(normalView),
          velocity,
        }),
      );
    },
  );

  return null;
}

// Velocity-based motion blur pipeline: the scene pass renders color + per-pixel
// motion vectors via MRT (setupCB — MRT must be configured before mainCB runs),
// `motionBlur()` smears the beauty texture along the velocity texture, and a TSL
// screen-space vignette wraps the result.
import { motionBlur } from 'three/addons/tsl/display/MotionBlur.js';
import { mrt, output, screenUV, vec4, velocity } from 'three/tsl';
import { useRenderPipeline, useUniforms } from '@react-three/fiber/webgpu';
import { useControls } from 'leva';

export function MotionBlurPipeline() {
  const { blurAmount } = useControls('Motion Blur', {
    blurAmount: { value: 1, min: 0, max: 3, step: 0.01 },
  });
  const uniforms = useUniforms({ blurAmount });

  useRenderPipeline(
    ({ renderPipeline, passes }) => {
      const beauty = passes.scenePass.getTextureNode();
      // Scale the velocity texture by our live uniform node directly — no need to
      // register/mutate anything, `uniforms.blurAmount` is already reactive.
      const vel = passes.scenePass.getTextureNode('velocity').mul(uniforms.blurAmount);
      const blurred = motionBlur(beauty, vel);

      // Screen-space vignette over the blurred beauty, as in the original.
      const vignette = screenUV.distance(0.5).remap(0.6, 1).mul(2).clamp().oneMinus();
      renderPipeline.outputNode = vec4(vignette.mul(blurred.rgb), blurred.a);
    },
    ({ passes }) => {
      // MRT config goes in setupCB: beauty (`output`) + motion vectors (`velocity`).
      passes.scenePass.setMRT(mrt({ output, velocity }));
    },
  );

  return null;
}

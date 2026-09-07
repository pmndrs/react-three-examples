// InsetView — the original's picture-in-picture comparison pane: after the main
// full-viewport render, a scissored square inset (height/4, 20px from the top-left)
// re-renders the SAME scene through a second camera that copies the orbit camera's
// pose every frame, against a grey `scene.backgroundNode` so the pane reads as a
// framed view. Owns the manual scissor+viewport render takeover
// (`{ phase: 'render' }`) — this example IS about the two-pass loop, so per Layer 1's
// render-takeover rule this is the intended case (same pane as the `lines-fat`
// sibling, whose original shares this inset).
import { useMemo } from 'react';
import { color } from 'three/tsl';
import { PerspectiveCamera } from 'three/webgpu';
import { useFrame, useThree } from '@react-three/fiber/webgpu';

const INSET_MARGIN = 20; // px from the top-left corner, as in the original

export function InsetView() {
  const { scene, renderer } = useThree();
  const size = useThree((state) => state.size);

  // Square inset camera (aspect 1, fixed) — pose is copied from the live orbit camera
  // every frame in the render callback below.
  const insetCamera = useMemo(() => new PerspectiveCamera(40, 1, 1, 1000), []);
  const insetBackground = useMemo(() => color(0x222222), []);

  useFrame(
    (state) => {
      // @types/three declares `backgroundNode` on Scene directly (0.185.1), so no
      // cast is needed.
      const withBackgroundNode = scene;

      // Main pass: full viewport, black clear, no background node.
      renderer.setClearColor(0x000000);
      renderer.setViewport(0, 0, size.width, size.height);
      renderer.autoClear = true;
      withBackgroundNode.backgroundNode = null;
      renderer.render(scene, state.camera);

      // Inset pass: scissored square re-render through the pose-copying camera.
      // NOTE on y: WebGPURenderer's setViewport/setScissor y is TOP-origin (no
      // WebGL-style bottom-origin flip in the backend). The original keeps the webgl
      // bottom-origin math and so its inset silently lands BOTTOM-left on WebGPU; we
      // pin the pane top-left deliberately (divergence — clears this shell's
      // bottom-left titleblock overlay; same fix as lines-fat/InsetView.tsx).
      const insetSize = Math.round(size.height / 4);
      const insetY = INSET_MARGIN;

      renderer.clearDepth(); // important! the inset draws over the main pass

      renderer.setScissorTest(true);
      renderer.setScissor(INSET_MARGIN, insetY, insetSize, insetSize);
      renderer.setViewport(INSET_MARGIN, insetY, insetSize, insetSize);

      insetCamera.position.copy(state.camera.position);
      insetCamera.quaternion.copy(state.camera.quaternion);

      renderer.autoClear = false;
      withBackgroundNode.backgroundNode = insetBackground;
      renderer.render(scene, insetCamera);

      renderer.setScissorTest(false);
    },
    { phase: 'render' },
  );

  return null;
}

/**
 * multiple-views
 * One shared scene, three viewports: a wide left pane and two stacked panes on the
 * right, each with its own camera, field of view and background tint. Move the mouse
 * to nudge all three cameras — every pane parallaxes differently.
 * Original: https://threejs.org/examples/#webgl_multiple_views
 *
 * DEMONSTRATES
 * - A `{ phase: 'render' }` takeover cycling `renderer.setViewport`/`setScissor`/
 *   `setClearColor` across three regions of ONE canvas, then rendering the SAME scene
 *   through three different cameras — this example IS the multi-viewport mechanism, so
 *   per House style rule 3 this is the intended imperative escape hatch (cousin:
 *   `geometry/lines-fat/InsetView.tsx`)
 * - Per-view state (camera pose, viewport fraction, clear tint, parallax function) as
 *   plain DATA, not a leva folder per view or three duplicated components
 * - fiber's reactive `size` (via `useThree`) replacing the original's manual
 *   `window.addEventListener('resize', ...)` + `updateSize()`
 *
 * DIVERGENCE from original
 * - Viewport y is recomputed from the original's `bottom` fraction: WebGPU's
 *   `setViewport`/`setScissor` is TOP-origin, unlike WebGL's bottom-origin (verified in
 *   `WebGPUBackend.js`, same gotcha as `InsetView.tsx`) — a literal port of the
 *   `bottom`-based math would stack the two right-hand panes in the wrong order.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Color, PerspectiveCamera, SRGBColorSpace } from 'three/webgpu';
import type { Vector3Tuple } from 'three/webgpu';
import { Canvas, useFrame, useThree } from '@react-three/fiber/webgpu';

import { DemoHelpers } from '../../../utils/DemoHelpers';
import { SceneContent } from './MultipleViewsScene';

interface ViewConfig {
  left: number;
  bottom: number;
  width: number;
  height: number;
  background: [number, number, number];
  eye: Vector3Tuple;
  up: Vector3Tuple;
  fov: number;
  update: (camera: PerspectiveCamera, mouseX: number) => void;
}

const VIEWS: ViewConfig[] = [
  {
    left: 0,
    bottom: 0,
    width: 0.5,
    height: 1.0,
    background: [0.5, 0.5, 0.7],
    eye: [0, 300, 1800],
    up: [0, 1, 0],
    fov: 30,
    update: (camera, mouseX) => {
      camera.position.x = Math.max(Math.min(camera.position.x + mouseX * 0.05, 2000), -2000);
      camera.lookAt(0, 0, 0);
    },
  },
  {
    left: 0.5,
    bottom: 0,
    width: 0.5,
    height: 0.5,
    background: [0.7, 0.5, 0.5],
    eye: [0, 1800, 0],
    up: [0, 0, 1],
    fov: 45,
    update: (camera, mouseX) => {
      camera.position.x = Math.max(Math.min(camera.position.x - mouseX * 0.05, 2000), -2000);
      camera.lookAt(camera.position.x, 0, camera.position.z);
    },
  },
  {
    left: 0.5,
    bottom: 0.5,
    width: 0.5,
    height: 0.5,
    background: [0.5, 0.7, 0.7],
    eye: [1400, 800, 1400],
    up: [0, 1, 0],
    fov: 60,
    update: (camera, mouseX) => {
      camera.position.y = Math.max(Math.min(camera.position.y - mouseX * 0.05, 1600), -1600);
      camera.lookAt(0, 0, 0);
    },
  },
];

// The multi-viewport rig: builds the three persistent cameras once, tracks the mouse
// globally (the original listens on `document`, not the canvas), and every frame
// re-cycles viewport/scissor/clear-color across the three regions before rendering the
// shared scene through each camera in turn.
function MultiViewRig() {
  const { scene, renderer } = useThree();
  const size = useThree((state) => state.size);
  const mouseXRef = useRef(0);

  const cameras = useMemo(
    () =>
      VIEWS.map((view) => {
        const camera = new PerspectiveCamera(view.fov, 1, 1, 10000);
        camera.position.fromArray(view.eye);
        camera.up.fromArray(view.up);
        return camera;
      }),
    [],
  );
  const backgrounds = useMemo(() => VIEWS.map((view) => new Color().setRGB(...view.background, SRGBColorSpace)), []);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      mouseXRef.current = event.clientX - window.innerWidth / 2;
    };
    window.addEventListener('pointermove', onPointerMove);
    return () => window.removeEventListener('pointermove', onPointerMove);
  }, []);

  useFrame(
    () => {
      for (let i = 0; i < VIEWS.length; i++) {
        const view = VIEWS[i];
        const camera = cameras[i];
        view.update(camera, mouseXRef.current);

        const left = Math.floor(size.width * view.left);
        const width = Math.floor(size.width * view.width);
        const height = Math.floor(size.height * view.height);
        // WebGPU is top-origin; the original's bottom-anchored fraction needs flipping.
        const top = Math.floor(size.height * (1 - view.bottom - view.height));

        camera.aspect = width / height;
        camera.updateProjectionMatrix();

        renderer.setViewport(left, top, width, height);
        renderer.setScissor(left, top, width, height);
        renderer.setScissorTest(true);
        renderer.setClearColor(backgrounds[i]);

        renderer.render(scene, camera);
      }
      renderer.setScissorTest(false);
    },
    { phase: 'render' },
  );

  return null;
}

export default function MultipleViews() {
  return (
    <Canvas renderer camera={{ manual: true }}>
      <SceneContent />
      <MultiViewRig />
      <DemoHelpers grid={false} controls={false} />
    </Canvas>
  );
}

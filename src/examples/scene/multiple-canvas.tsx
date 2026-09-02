/**
 * multiple-canvas
 * Forty small scenes, each its own `<canvas>`, all sharing ONE WebGPU device — a
 * gallery of spinning-free primitives you can each orbit independently.
 * Original: https://threejs.org/examples/#webgpu_multiple_canvas (~100 lines of JS)
 *
 * DEMONSTRATES
 * - fiber's multi-canvas mode: one primary `<Canvas id="main" renderer>` owns the
 *   WebGPU device, and 39 secondary `<Canvas renderer={{ primaryCanvas: 'main' }}>`
 *   share it — the exact feature this original hand-rolls with `THREE.CanvasTarget` +
 *   a manual `renderer.setCanvasTarget()` loop (reference:
 *   `reference/react-three-fiber/example/src/demos/webgpu/WebGPUMultiCanvas.tsx`)
 * - Per-canvas rotate-only camera controls bound to each canvas's own DOM wrapper —
 *   `state.renderer.domElement` is the SAME shared element on every secondary canvas
 *   (it belongs to the renderer, not the canvas being drawn to), so orbiting a
 *   thumbnail needs its own explicit DOM target, not the usual escape hatch
 *   (`ThumbnailOrbit`)
 * - `DemoHelpers`' readiness signal wired to only the FIRST canvas — verified by hand
 *   in the browser: the automated smoke test and `contact-sheet` screenshot both
 *   capture `canvas().first()`, so only canvas #1 of 40 is checked by the automated
 *   tiers (AGENTS.md § Verification)
 *
 * DIVERGENCE from original
 * - `THREE.CanvasTarget`/manual `setCanvasTarget()` per scene dropped entirely — R3F's
 *   multi-canvas mode owns that switch (AGENTS.md WebGPU idioms)
 * - `OrbitControls` (rotate only, `enablePan`/`enableZoom` false) ported via the
 *   `camera-controls` library directly rather than this repo's shared
 *   `<CameraControls>` wrapper, because that wrapper always binds to
 *   `state.renderer.domElement` — wrong here for exactly the reason above
 */
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import type { PerspectiveCamera } from 'three/webgpu';
import { Canvas, useFrame, useThree } from '@react-three/fiber/webgpu';
import CameraControlsImpl from 'camera-controls';

import { DemoHelpers } from '../../utils/DemoHelpers';

CameraControlsImpl.install({ THREE });

const SCENE_COUNT = 40;
const GEOMETRY_TYPES = ['box', 'sphere', 'dodecahedron', 'cylinder'] as const;
type GeometryType = (typeof GEOMETRY_TYPES)[number];

interface SceneData {
  geometry: GeometryType;
  color: string;
}

//* Per-canvas rotate-only orbit ==================================

// Binds camera-controls directly to the WRAPPER div this canvas sits in, not
// `state.renderer.domElement` — see header DEMONSTRATES.
function ThumbnailOrbit({ domTarget }: { domTarget: HTMLDivElement }) {
  const camera = useThree((state) => state.camera);
  const controls = useMemo(() => new CameraControlsImpl(camera as PerspectiveCamera), [camera]);

  useEffect(() => {
    controls.connect(domTarget);

    // Rotate only — no pan, no dolly (original: enablePan = enableZoom = false).
    const { ACTION } = CameraControlsImpl;
    controls.mouseButtons.left = ACTION.ROTATE;
    controls.mouseButtons.right = ACTION.NONE;
    controls.mouseButtons.wheel = ACTION.NONE;
    controls.mouseButtons.middle = ACTION.NONE;
    controls.touches.one = ACTION.TOUCH_ROTATE;
    controls.touches.two = ACTION.NONE;
    controls.touches.three = ACTION.NONE;

    return () => controls.disconnect();
  }, [controls, domTarget]);

  useFrame(({ delta }) => controls.update(delta));

  return null;
}

//* One scene ======================================================

interface SceneItemProps extends SceneData {
  index: number;
}

function SceneItem({ index, geometry, color }: SceneItemProps) {
  const [wrapper, setWrapper] = useState<HTMLDivElement | null>(null);

  return (
    <div style={{ display: 'inline-block', margin: '1em', boxShadow: '1px 2px 4px 0px rgba(0,0,0,0.25)' }}>
      <div ref={setWrapper} style={{ width: 200, height: 200, overflow: 'hidden' }}>
        <Canvas
          id={index === 0 ? 'main' : undefined}
          renderer={index === 0 ? true : { primaryCanvas: 'main' }}
          background="#eeeeee"
          camera={{ position: [0, 0, 2], fov: 50, near: 1, far: 10 }}>
          <hemisphereLight args={['#aaaaaa', '#444444', 3]} />
          <directionalLight color="#ffffff" intensity={1.5} position={[1, 1, 1]} />
          <mesh>
            {geometry === 'box' && <boxGeometry args={[1, 1, 1]} />}
            {geometry === 'sphere' && <sphereGeometry args={[0.5, 12, 8]} />}
            {geometry === 'dodecahedron' && <dodecahedronGeometry args={[0.5]} />}
            {geometry === 'cylinder' && <cylinderGeometry args={[0.5, 0.5, 1, 12]} />}
            <meshStandardMaterial color={color} roughness={0.5} metalness={0} flatShading />
          </mesh>
          {wrapper && <ThumbnailOrbit domTarget={wrapper} />}
          {/* Readiness signal lives on canvas #1 only — see header DEMONSTRATES. */}
          {index === 0 && <DemoHelpers grid={false} controls={false} />}
        </Canvas>
      </div>
      <div style={{ marginTop: '0.5em', width: 200, font: 'large sans-serif', color: '#888' }}>Scene {index + 1}</div>
    </div>
  );
}

export default function MultipleCanvas() {
  const [scenes] = useState<SceneData[]>(() =>
    Array.from({ length: SCENE_COUNT }, () => ({
      geometry: GEOMETRY_TYPES[Math.floor(Math.random() * GEOMETRY_TYPES.length)],
      color: `hsl(${Math.floor(Math.random() * 360)}, 100%, 75%)`,
    })),
  );

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: '#fff', padding: '3em 1em 1em' }}>
      {scenes.map((scene, index) => (
        <SceneItem key={index} index={index} {...scene} />
      ))}
    </div>
  );
}

/**
 * multiple-scenes-comparison
 * A wipe-style comparison: a solid icosahedron on the left, its wireframe twin on the
 * right, split by a draggable pink handle. Both share one camera and one orbit.
 * Original: https://threejs.org/examples/#webgl_multiple_scenes_comparison
 *
 * DEMONSTRATES
 * - `{ phase: 'render' }` takeover: two `renderer.setScissor` + `render()` calls per
 *   frame, one per scene, split at a draggable x — this example IS the scissor-compare
 *   mechanism (cousin: `camera/multiple-views.tsx`)
 * - Two `THREE.Scene`s sharing ONE camera, built with `createPortal` into plain
 *   `Scene` instances held in lazy `useState` (a `phase:'render'` callback closes over
 *   them once, so they must be identity-stable — same pattern as
 *   `postprocessing-transition.tsx`)
 * - The DOM drag handle pauses `CameraControls` for the drag's duration via
 *   `DemoHelpers`' `controlsRef` escape hatch (`controls.enabled = false`), mirroring
 *   the original's OrbitControls toggle exactly (pattern: `controls-transform.tsx`)
 * - One `IcosahedronGeometry` shared by both meshes — only the material (solid vs
 *   wireframe) differs, matching the original's one shared `geometry`
 *
 * DIVERGENCE from original
 * - The handle's rest position and drag clamp are relative to the CANVAS's own
 *   bounding rect, not `window.innerWidth` — this repo's shell has a sidebar, so the
 *   canvas is narrower than the window.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Color, IcosahedronGeometry, Scene } from 'three/webgpu';
import type { BufferGeometry } from 'three/webgpu';
import { Canvas, createPortal, useFrame, useThree } from '@react-three/fiber/webgpu';
import type CameraControlsImpl from 'camera-controls';

import { DemoHelpers } from '../../utils/DemoHelpers';

//* Scene content ====================================================

interface SceneMeshProps {
  geometry: BufferGeometry;
  wireframe?: boolean;
}

// Rendered twice via createPortal — once per scene. Each portal gets its OWN
// hemisphere light (matching the original's `light.clone()`; lights can't be shared
// across two scene graphs the way geometry/materials can).
function SceneMesh({ geometry, wireframe }: SceneMeshProps) {
  return (
    <>
      <hemisphereLight color="#ffffff" groundColor="#444444" intensity={3} position={[-2, 2, 2]} />
      <mesh geometry={geometry}>
        <meshStandardNodeMaterial wireframe={wireframe} />
      </mesh>
    </>
  );
}

//* Render rig ========================================================

interface ScenesRigProps {
  scenes: readonly [Scene, Scene];
  sliderXRef: React.RefObject<number>;
}

// Owns the takeover: scissors the canvas at the slider's x every frame and renders
// each scene into its half, replacing fiber's default `renderer.render(scene, camera)`.
function ScenesRig({ scenes, sliderXRef }: ScenesRigProps) {
  const { renderer, camera } = useThree();
  const size = useThree((state) => state.size);

  useEffect(() => () => renderer.setScissorTest(false), [renderer]);

  useFrame(
    () => {
      const x = Math.min(Math.max(sliderXRef.current, 0), size.width);

      renderer.setScissorTest(true);
      renderer.setScissor(0, 0, x, size.height);
      renderer.render(scenes[0], camera);

      renderer.setScissor(x, 0, size.width - x, size.height);
      renderer.render(scenes[1], camera);

      renderer.setScissorTest(false);
    },
    { phase: 'render' },
  );

  return null;
}

//* Drag handle (DOM) ================================================

interface SliderHandleProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  sliderXRef: React.RefObject<number>;
  controlsRef: React.RefObject<CameraControlsImpl | null>;
}

// A plain DOM drag handle — window-level pointermove/up so dragging past the handle's
// own edges still tracks, exactly like the original. Writes `sliderXRef` and its own
// `style.left` directly (no React state) so a drag never triggers a re-render.
function SliderHandle({ containerRef, sliderXRef, controlsRef }: SliderHandleProps) {
  const handleRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const handle = handleRef.current!;
    handle.style.touchAction = 'none';

    const setPosition = (x: number) => {
      sliderXRef.current = x;
      handle.style.left = `${x - handle.offsetWidth / 2}px`;
    };
    const initialWidth = containerRef.current?.getBoundingClientRect().width || window.innerWidth;
    setPosition(initialWidth / 2);

    const onPointerMove = (event: PointerEvent) => {
      if (event.isPrimary === false) return;
      const rect = containerRef.current!.getBoundingClientRect();
      setPosition(Math.max(0, Math.min(rect.width, event.clientX - rect.left)));
    };
    const onPointerUp = () => {
      if (controlsRef.current) controlsRef.current.enabled = true;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.isPrimary === false) return;
      if (controlsRef.current) controlsRef.current.enabled = false;
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    };

    handle.addEventListener('pointerdown', onPointerDown);
    return () => {
      handle.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [containerRef, sliderXRef, controlsRef]);

  return (
    <div
      ref={handleRef}
      style={{
        position: 'absolute',
        top: 'calc(50% - 20px)',
        width: 40,
        height: 40,
        borderRadius: '50%',
        backgroundColor: '#f32196',
        opacity: 0.7,
        cursor: 'ew-resize',
      }}
    />
  );
}

function makeScene(background: string): Scene {
  const scene = new Scene();
  scene.background = new Color(background);
  return scene;
}

//* Page ==============================================================

export default function MultipleScenesComparison() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sliderXRef = useRef(0);
  const controlsRef = useRef<CameraControlsImpl>(null);

  const [scenes] = useState(() => [makeScene('#bcd48f'), makeScene('#8fbcd4')] as const);
  const geometry = useMemo(() => new IcosahedronGeometry(1, 3), []);

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Canvas renderer camera={{ position: [0, 0, 6], fov: 35, near: 0.1, far: 100 }}>
        {createPortal(<SceneMesh geometry={geometry} />, scenes[0])}
        {createPortal(<SceneMesh geometry={geometry} wireframe />, scenes[1])}
        <ScenesRig scenes={scenes} sliderXRef={sliderXRef} />
        <DemoHelpers grid={false} controlsRef={controlsRef} />
      </Canvas>
      <SliderHandle containerRef={containerRef} sliderXRef={sliderXRef} controlsRef={controlsRef} />
    </div>
  );
}

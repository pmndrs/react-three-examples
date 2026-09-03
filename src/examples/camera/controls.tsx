/**
 * controls
 * One field of 500 cones, six ways to move a camera through it. Pick a control scheme in
 * the panel: Orbit, Trackball, Arcball, Fly, Map or PointerLock (click the canvas to
 * capture the mouse, WASD to walk, Esc to release).
 * Original: https://threejs.org/examples/#misc_controls_orbit
 * Also folds in misc_controls_trackball, misc_controls_arcball, misc_controls_fly,
 * misc_controls_map and misc_controls_pointerlock — six pages that are each ~60 lines
 * of the same scene around one controls constructor.
 *
 * DEMONSTRATES
 * - drei ships every three.js controls addon as a component on `@react-three/drei/webgpu`;
 *   swapping schemes is a conditional render, not a `dispose()` + reconstruct cycle
 * - Each drei controls component owns its own `useFrame` update, so the originals'
 *   `controls.update(delta)` calls in `animate()` are gone — including the delta-timed
 *   ones (`FlyControls`, `TrackballControls`)
 * - `<instancedMesh>` with JSX geometry/material children and the matrices laid out once
 *   in a layout effect — three's own instancing pattern, unchanged inside R3F
 * - drei `<KeyboardControls>` + `useKeyboardControls` feeding `moveForward`/`moveRight`
 *   for the pointer-lock walk, in place of the original's two `switch` statements
 * - `React.ComponentRef<typeof PointerLockControls>` types the controls ref from the
 *   element (House style rule 5), no class import
 *
 * DIVERGENCE from original
 * - One shared scene (the orbit/map cone field) instead of six: the earth, the Cerberus
 *   gun and the FPS box maze were scene dressing around the same constructor call
 * - PointerLock walk keeps the original's WASD/arrow movement but drops its gravity,
 *   jumping and box-collision raycast — that was a mini game loop, not the controls demo
 * - Arcball: drei builds the controls without the `scene` constructor argument, so its
 *   trackball gizmos cannot be shown; the pan grid still works because `scene` is a
 *   plain writable field. The original's 17-slider GUI is trimmed to four
 * - Trackball's perspective/orthographic toggle and Orbit's arrow-key panning are dropped
 */
import { useLayoutEffect, useRef } from 'react';
import { NoToneMapping, Object3D } from 'three/webgpu';
import type { InstancedMesh } from 'three/webgpu';
import { Canvas, useFrame, useThree } from '@react-three/fiber/webgpu';
import {
  ArcballControls,
  FlyControls,
  KeyboardControls,
  MapControls,
  OrbitControls,
  PointerLockControls,
  TrackballControls,
  useKeyboardControls,
} from '@react-three/drei/webgpu';
import { useControls } from 'leva';
import { DemoHelpers } from '../../utils/DemoHelpers';

const CONE_COUNT = 500;
const WALK_SPEED = 200; // units per second, for the pointer-lock walk

//* Scene =========================================================

function ConeField() {
  const meshRef = useRef<InstancedMesh>(null);

  // Scatter the cones once. Layout effect so the first render already sees the matrices.
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new Object3D();
    for (let i = 0; i < CONE_COUNT; i++) {
      dummy.position.set(Math.random() * 1600 - 800, 0, Math.random() * 1600 - 800);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, CONE_COUNT]}>
      <coneGeometry args={[10, 30, 4, 1]} />
      <meshPhongNodeMaterial color="#ffffff" flatShading />
    </instancedMesh>
  );
}

//* Controls ======================================================

type Scheme = 'Orbit' | 'Trackball' | 'Arcball' | 'Fly' | 'Map' | 'PointerLock';
const SCHEMES: Scheme[] = ['Orbit', 'Trackball', 'Arcball', 'Fly', 'Map', 'PointerLock'];

// The two schemes whose originals had a GUI get their own folder, mounted only while
// selected — leva drops the folder with the component.
function MapScheme() {
  const { zoomToCursor, screenSpacePanning } = useControls('Map controls', {
    zoomToCursor: false,
    screenSpacePanning: false,
  });
  return (
    <MapControls
      enableDamping
      dampingFactor={0.05}
      screenSpacePanning={screenSpacePanning}
      zoomToCursor={zoomToCursor}
      minDistance={100}
      maxDistance={500}
      maxPolarAngle={Math.PI / 2}
    />
  );
}

function ArcballScheme() {
  const scene = useThree((state) => state.scene);
  const { enableGrid, cursorZoom, enableAnimations, dampingFactor } = useControls('Arcball controls', {
    enableGrid: false,
    cursorZoom: false,
    enableAnimations: true,
    dampingFactor: { value: 25, min: 0, max: 100, step: 1 },
  });
  return (
    <ArcballControls
      scene={scene}
      enableGrid={enableGrid}
      cursorZoom={cursorZoom}
      enableAnimations={enableAnimations}
      dampingFactor={dampingFactor}
    />
  );
}

// Pointer lock only turns the head; walking is ours. `moveForward`/`moveRight` are the
// controls' own camera-relative steps, fed from drei's keyboard store each frame.
function PointerLockScheme() {
  const controlsRef = useRef<React.ComponentRef<typeof PointerLockControls>>(null);
  const [, getKeys] = useKeyboardControls();

  useFrame(({ delta }) => {
    const controls = controlsRef.current;
    if (!controls?.isLocked) return;
    const { forward, back, left, right } = getKeys();
    controls.moveForward((Number(forward) - Number(back)) * WALK_SPEED * delta);
    controls.moveRight((Number(right) - Number(left)) * WALK_SPEED * delta);
  });

  return <PointerLockControls ref={controlsRef} selector="canvas" />;
}

function Controls() {
  const { scheme } = useControls('controls', { scheme: { value: 'Orbit' as Scheme, options: SCHEMES } });

  switch (scheme) {
    case 'Orbit':
      return (
        <OrbitControls
          enableDamping
          dampingFactor={0.05}
          screenSpacePanning={false}
          minDistance={100}
          maxDistance={500}
          maxPolarAngle={Math.PI / 2}
        />
      );
    case 'Trackball':
      return <TrackballControls rotateSpeed={1} zoomSpeed={1.2} panSpeed={0.8} keys={['KeyA', 'KeyS', 'KeyD']} />;
    case 'Arcball':
      return <ArcballScheme />;
    case 'Fly':
      return <FlyControls movementSpeed={100} rollSpeed={Math.PI / 24} dragToLook={false} autoForward={false} />;
    case 'Map':
      return <MapScheme />;
    case 'PointerLock':
      return <PointerLockScheme />;
  }
}

export default function ControlsExample() {
  return (
    <Canvas
      // The originals never set a tone mapping — the renderer default is none.
      renderer={{ toneMapping: NoToneMapping }}
      background="#cccccc"
      camera={{ position: [400, 200, 0], fov: 60, near: 1, far: 1000 }}>
      <fogExp2 attach="fog" args={['#cccccc', 0.002]} />
      <directionalLight color="#ffffff" intensity={3} position={[1, 1, 1]} />
      <directionalLight color="#002288" intensity={3} position={[-1, -1, -1]} />
      <ambientLight color="#555555" />
      <ConeField />
      <KeyboardControls
        map={[
          { name: 'forward', keys: ['KeyW', 'ArrowUp'] },
          { name: 'back', keys: ['KeyS', 'ArrowDown'] },
          { name: 'left', keys: ['KeyA', 'ArrowLeft'] },
          { name: 'right', keys: ['KeyD', 'ArrowRight'] },
        ]}>
        <Controls />
      </KeyboardControls>
      {/* The example mounts its own controls; the baseline camera-controls would fight them. */}
      <DemoHelpers grid={false} controls={false} />
    </Canvas>
  );
}

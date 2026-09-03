/**
 * controls-transform
 * A crate with a transform gizmo on it. Drag the handles to move, rotate or scale it;
 * the panel and the keyboard both switch modes: W/E/R translate/rotate/scale, Q world/local,
 * hold Shift to snap, X/Y/Z hide an axis, +/- gizmo size, Space enable, Esc reset,
 * C perspective/orthographic, V random zoom.
 * Original: https://threejs.org/examples/#misc_controls_transform
 *
 * DEMONSTRATES
 * - drei `<TransformControls object={…}>`: every gizmo setting is a prop (`mode`,
 *   `space`, `translationSnap`, `showX`, `size`, `enabled`), so the original's fourteen
 *   `control.setMode()`/`setSpace()`/`setSize()` calls become one leva panel
 * - Keyboard shortcuts WRITING INTO the panel with leva's function form
 *   (`const [values, set] = useControls(…)`) — the keys stay as the original had them,
 *   and the panel shows what they did
 * - Pausing the baseline camera-controls for the drag through `DemoHelpers`' `controlsRef`
 *   (`onMouseDown`/`onMouseUp`), the original's `dragging-changed` listener
 * - drei `<OrthographicCamera makeDefault>` conditionally mounted for the C toggle
 *
 * DIVERGENCE from original
 * - The gizmo is mounted by hand (`<primitive object={controls.getHelper()}>`): drei's
 *   `<TransformControls>` predates r169's split of the controls from their helper and
 *   only renders the invisible controls object
 * - V (random zoom) mutates the live camera imperatively, as the original does; it is
 *   the one shortcut with nothing declarative to write into
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MathUtils, NoToneMapping, SRGBColorSpace } from 'three/webgpu';
import type { Mesh } from 'three/webgpu';
import { Canvas, useThree } from '@react-three/fiber/webgpu';
import { OrthographicCamera, TransformControls, useTexture } from '@react-three/drei/webgpu';
import type CameraControlsImpl from 'camera-controls';
import { useControls } from 'leva';
import { DemoHelpers } from '../../utils/DemoHelpers';

const CRATE_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/crate.gif';
const FRUSTUM_SIZE = 5;

type Mode = 'translate' | 'rotate' | 'scale';
type Space = 'world' | 'local';

//* Scene =========================================================

interface CrateProps {
  controlsRef: React.RefObject<CameraControlsImpl | null>;
}

function Crate({ controlsRef }: CrateProps) {
  const camera = useThree((state) => state.camera);
  const [crate, setCrate] = useState<Mesh | null>(null);
  const [gizmo, setGizmo] = useState<React.ComponentRef<typeof TransformControls> | null>(null);

  const texture = useTexture(CRATE_URL);
  useLayoutEffect(() => {
    texture.colorSpace = SRGBColorSpace;
  }, [texture]);

  const [{ mode, space, snap, size, showX, showY, showZ, enabled, orthographic }, set] = useControls(
    'controls-transform',
    () => ({
      mode: { value: 'translate' as Mode, options: ['translate', 'rotate', 'scale'] as Mode[] },
      space: { value: 'world' as Space, options: ['world', 'local'] as Space[] },
      snap: false,
      size: { value: 1, min: 0.1, max: 3, step: 0.1 },
      showX: true,
      showY: true,
      showZ: true,
      enabled: true,
      orthographic: false,
    }),
  );

  // Latest panel values for the key handlers, without re-binding the listeners per keystroke.
  const values = useRef({ size, showX, showY, showZ, enabled, orthographic, space });
  values.current = { size, showX, showY, showZ, enabled, orthographic, space };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const v = values.current;
      switch (event.key) {
        case 'w':
          return set({ mode: 'translate' });
        case 'e':
          return set({ mode: 'rotate' });
        case 'r':
          return set({ mode: 'scale' });
        case 'q':
          return set({ space: v.space === 'local' ? 'world' : 'local' });
        case 'Shift':
          return set({ snap: true });
        case '+':
        case '=':
          return set({ size: v.size + 0.1 });
        case '-':
        case '_':
          return set({ size: Math.max(v.size - 0.1, 0.1) });
        case 'x':
          return set({ showX: !v.showX });
        case 'y':
          return set({ showY: !v.showY });
        case 'z':
          return set({ showZ: !v.showZ });
        case ' ':
          return set({ enabled: !v.enabled });
        case 'c':
          return set({ orthographic: !v.orthographic });
        case 'Escape':
          return gizmo?.reset();
        case 'v': {
          // Random field of view and zoom on whichever camera is live.
          const randomFoV = Math.random() + 0.1;
          const randomZoom = Math.random() + 0.1;
          if ('isPerspectiveCamera' in camera) camera.fov = randomFoV * 160;
          if ('isOrthographicCamera' in camera) {
            camera.bottom = -randomFoV * 500;
            camera.top = randomFoV * 500;
          }
          camera.zoom = randomZoom * 5;
          camera.updateProjectionMatrix();
        }
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Shift') set({ snap: false });
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [set, camera, gizmo]);

  const pauseOrbit = (paused: boolean) => {
    if (controlsRef.current) controlsRef.current.enabled = !paused;
  };

  return (
    <>
      {/* The mesh is handed to the gizmo through state, so it exists before the gizmo attaches. */}
      <mesh ref={setCrate}>
        <boxGeometry />
        <meshLambertNodeMaterial map={texture} />
      </mesh>

      {crate && (
        <TransformControls
          ref={setGizmo}
          object={crate}
          mode={mode}
          space={space}
          size={size}
          showX={showX}
          showY={showY}
          showZ={showZ}
          enabled={enabled}
          translationSnap={snap ? 1 : null}
          rotationSnap={snap ? MathUtils.degToRad(15) : null}
          scaleSnap={snap ? 0.25 : null}
          onMouseDown={() => pauseOrbit(true)}
          onMouseUp={() => pauseOrbit(false)}
        />
      )}
      {/* Since r169 TransformControls is not an Object3D: its visible gizmo is a separate
          helper that has to be added to the scene, and drei alpha.6 doesn't mount it. */}
      {gizmo && <primitive object={gizmo.getHelper()} />}

      {orthographic && <OrthographicCameraAtSameSpot />}
    </>
  );
}

// The C toggle: an orthographic camera parked where the perspective one is. Unmounting
// it hands the default camera back to fiber's perspective one.
function OrthographicCameraAtSameSpot() {
  const camera = useThree((state) => state.camera);
  const aspect = useThree((state) => state.viewport.aspect);
  const [position] = useState(() => camera.position.clone());
  return (
    <OrthographicCamera
      makeDefault
      position={position}
      left={-FRUSTUM_SIZE * aspect}
      right={FRUSTUM_SIZE * aspect}
      top={FRUSTUM_SIZE}
      bottom={-FRUSTUM_SIZE}
      near={0.1}
      far={100}
    />
  );
}

export default function ControlsTransform() {
  const controlsRef = useRef<CameraControlsImpl>(null);

  return (
    <Canvas
      // The original never sets a tone mapping — the renderer default is none.
      renderer={{ toneMapping: NoToneMapping }}
      camera={{ position: [5, 2.5, 5], fov: 50, near: 0.1, far: 100 }}>
      <gridHelper args={[5, 10, '#888888', '#444444']} />
      <ambientLight color="#ffffff" />
      <directionalLight color="#ffffff" intensity={4} position={[1, 1, 1]} />
      <Crate controlsRef={controlsRef} />
      {/* The original's own 5x10 GridHelper stands in for the baseline grid. */}
      <DemoHelpers grid={false} controlsRef={controlsRef} />
    </Canvas>
  );
}

/**
 * controls-drag
 * Two hundred coloured boxes you can pick up and drag across the view. Shift+click
 * boxes to build a selection; a selection drags as one unit.
 * Original: https://threejs.org/examples/#misc_controls_drag
 *
 * DEMONSTRATES
 * - drei `<DragControls>` wrapped around each box: the drag plane, pointer capture and
 *   the ray-plane maths are the component's, so the original's `DragControls([...objects])`
 *   plus its `mouse`/`raycaster`/`intersectObjects` selection block are gone
 * - `autoTransform={false}` + `onDrag`: the component reports the drag displacement and
 *   the scene applies it — to one box, or to every selected box. That is the whole union
 *   feature, without the original's `group.attach()` / `scene.attach()` reparenting dance
 * - `onClick` with `event.shiftKey` as the selection toggle; `emissive` follows selection
 *   as a prop instead of `material.emissive.set()` calls
 * - `<spotLight castShadow>` with `shadow-*` dashed props for the shadow camera setup
 *
 * DIVERGENCE from original
 * - The "M" key (touch-only rotate/pan toggle) is dropped
 */
import { useRef, useState } from 'react';
import { BoxGeometry, NoToneMapping, Vector3 } from 'three/webgpu';
import type { Matrix4, Mesh } from 'three/webgpu';
import { Canvas } from '@react-three/fiber/webgpu';
import { DragControls } from '@react-three/drei/webgpu';
import type CameraControlsImpl from 'camera-controls';
import { DemoHelpers } from '../../utils/DemoHelpers';

const COUNT = 200;

const randomHex = () =>
  `#${Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, '0')}`;

//* Scene =========================================================

interface BoxFieldProps {
  controlsRef: React.RefObject<CameraControlsImpl | null>;
}

function BoxField({ controlsRef }: BoxFieldProps) {
  // REVIEW(shared-instance): one BoxGeometry across 200 meshes, as in the original; each
  // box keeps its own material because colour and the selection glow are per box.
  const [box] = useState(() => new BoxGeometry());
  const [boxes] = useState(() =>
    Array.from({ length: COUNT }, () => ({
      color: randomHex(),
      position: [Math.random() * 30 - 15, Math.random() * 15 - 7.5, Math.random() * 20 - 10] as const,
      rotation: [Math.random() * 2 * Math.PI, Math.random() * 2 * Math.PI, Math.random() * 2 * Math.PI] as const,
      scale: [Math.random() * 2 + 1, Math.random() * 2 + 1, Math.random() * 2 + 1] as const,
    })),
  );

  const meshRefs = useRef<(Mesh | null)[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  // The boxes moving in the current drag, and where each one started.
  const drag = useRef<{ indices: number[]; starts: Vector3[] }>({ indices: [], starts: [] });

  const toggle = (i: number) =>
    setSelected((current) => (current.includes(i) ? current.filter((j) => j !== i) : [...current, i]));

  const beginDrag = (i: number) => {
    // With a selection, only the selection moves — as one unit, whichever member you grab.
    const indices = selected.length === 0 ? [i] : selected.includes(i) ? selected : [];
    drag.current = { indices, starts: indices.map((j) => meshRefs.current[j]!.position.clone()) };
    if (controlsRef.current) controlsRef.current.enabled = false;
  };

  // `matrix` carries the displacement since the pointer went down (the wrapper group
  // itself stays put), so every box in the drag set is its start plus that offset.
  const moveDrag = (matrix: Matrix4) => {
    const offset = new Vector3().setFromMatrixPosition(matrix);
    drag.current.indices.forEach((j, k) => meshRefs.current[j]!.position.copy(drag.current.starts[k]).add(offset));
  };

  const endDrag = () => {
    if (controlsRef.current) controlsRef.current.enabled = true;
  };

  return boxes.map(({ color, ...transform }, i) => (
    <DragControls key={i} autoTransform={false} onDragStart={() => beginDrag(i)} onDrag={moveDrag} onDragEnd={endDrag}>
      <mesh
        ref={(mesh) => {
          meshRefs.current[i] = mesh;
        }}
        geometry={box}
        castShadow
        receiveShadow
        onClick={(event) => {
          if (!event.shiftKey) return;
          event.stopPropagation();
          toggle(i);
        }}
        {...transform}>
        <meshLambertNodeMaterial color={color} emissive={selected.includes(i) ? '#aaaaaa' : '#000000'} />
      </mesh>
    </DragControls>
  ));
}

export default function ControlsDrag() {
  const controlsRef = useRef<CameraControlsImpl>(null);

  return (
    <Canvas
      // The original never sets a tone mapping — the renderer default is none.
      renderer={{ toneMapping: NoToneMapping }}
      shadows="percentage"
      background="#f0f0f0"
      camera={{ position: [0, 0, 25], fov: 70, near: 0.1, far: 500 }}>
      <ambientLight color="#aaaaaa" />
      <spotLight
        color="#ffffff"
        intensity={10000}
        position={[0, 25, 50]}
        angle={Math.PI / 9}
        castShadow
        shadow-camera-near={10}
        shadow-camera-far={100}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <BoxField controlsRef={controlsRef} />
      {/* Grid off: the boxes float around the origin and a ground plane would slice them. */}
      <DemoHelpers grid={false} controlsRef={controlsRef} />
    </Canvas>
  );
}

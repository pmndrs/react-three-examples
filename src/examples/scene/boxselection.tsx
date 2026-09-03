/**
 * boxselection
 * Two hundred boxes in a cloud. Hold Shift and drag a rectangle across the view: every
 * box inside the rectangle's frustum lights up white.
 * Original: https://threejs.org/examples/#misc_boxselection
 *
 * DEMONSTRATES
 * - drei `<Select box multiple>`: one wrapper owns the screen-space rectangle (the DOM
 *   div the original's `SelectionHelper` drew), the `SelectionBox` frustum test on
 *   pointer move, and the selection state — the original's three `document` listeners
 *   and their NDC maths are the component's business
 * - `useSelect()` inside each box: selection reaches the box through context, and its
 *   `emissive` is a prop of the current render instead of imperative `.set()` calls
 * - Pausing the baseline camera-controls while Shift is down, so the selection drag
 *   doesn't orbit
 *
 * DIVERGENCE from original
 * - The box selection needs Shift held. The original selected on any drag because it had
 *   no camera controls; here plain drag orbits and Shift+drag selects (drei's `<Select>`
 *   makes the same split)
 */
import { useEffect, useRef, useState } from 'react';
import { BoxGeometry, NoToneMapping } from 'three/webgpu';
import type { Mesh } from 'three/webgpu';
import { Canvas, type ThreeElements } from '@react-three/fiber/webgpu';
import { Select, useSelect } from '@react-three/drei/webgpu';
import type CameraControlsImpl from 'camera-controls';
import { DemoHelpers } from '../../utils/DemoHelpers';

const COUNT = 200;

const randomHex = () =>
  `#${Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, '0')}`;

//* Scene =========================================================

type BoxProps = ThreeElements['mesh'] & { color: string };

function Box({ color, ...props }: BoxProps) {
  const meshRef = useRef<Mesh>(null);
  const selection = useSelect();
  const selected = meshRef.current !== null && selection.includes(meshRef.current);

  return (
    <mesh ref={meshRef} castShadow receiveShadow {...props}>
      <meshLambertNodeMaterial color={color} emissive={selected ? '#ffffff' : '#000000'} />
    </mesh>
  );
}

interface BoxCloudProps {
  controlsRef: React.RefObject<CameraControlsImpl | null>;
}

function BoxCloud({ controlsRef }: BoxCloudProps) {
  // REVIEW(shared-instance): one BoxGeometry across 200 meshes, as in the original; each
  // box keeps its own material because colour and the selection glow are per box.
  const [box] = useState(() => new BoxGeometry());
  const [boxes] = useState(() =>
    Array.from({ length: COUNT }, () => ({
      color: randomHex(),
      position: [Math.random() * 80 - 40, Math.random() * 45 - 25, Math.random() * 45 - 25] as const,
      rotation: [Math.random() * 2 * Math.PI, Math.random() * 2 * Math.PI, Math.random() * 2 * Math.PI] as const,
      scale: [Math.random() * 2 + 1, Math.random() * 2 + 1, Math.random() * 2 + 1] as const,
    })),
  );

  // Shift is the selection modifier; the orbit must not see the same drag.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Shift' && controlsRef.current) controlsRef.current.enabled = event.type === 'keyup';
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  }, [controlsRef]);

  return (
    <Select box multiple border="1px solid #55aaff" backgroundColor="rgba(75, 160, 255, 0.3)">
      {boxes.map((props, i) => (
        <Box key={i} geometry={box} {...props} />
      ))}
    </Select>
  );
}

export default function BoxSelection() {
  const controlsRef = useRef<CameraControlsImpl>(null);

  return (
    <Canvas
      // The original never sets a tone mapping — the renderer default is none.
      renderer={{ toneMapping: NoToneMapping }}
      shadows="percentage"
      background="#f0f0f0"
      camera={{ position: [0, 0, 50], fov: 70, near: 0.1, far: 500 }}>
      <ambientLight color="#aaaaaa" />
      <spotLight
        color="#ffffff"
        intensity={10000}
        position={[0, 25, 50]}
        angle={Math.PI / 5}
        castShadow
        shadow-camera-near={10}
        shadow-camera-far={100}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <BoxCloud controlsRef={controlsRef} />
      {/* Grid off: the boxes float around the origin and a ground plane would slice them. */}
      <DemoHelpers grid={false} controlsRef={controlsRef} />
    </Canvas>
  );
}

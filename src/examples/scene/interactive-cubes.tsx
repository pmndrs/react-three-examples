/**
 * interactive-cubes
 * Two thousand random boxes drift past a slowly orbiting camera; whichever one is under
 * the pointer glows red. The canonical hover-highlight demo.
 * Original: https://threejs.org/examples/#webgl_interactive_cubes
 *
 * DEMONSTRATES
 * - `onPointerOver` / `onPointerOut` on a mesh ARE the hit test. The original's
 *   `Raycaster` + NDC pointer math + `mousemove` listener + `INTERSECTED`/`currentHex`
 *   bookkeeping collapse into two handlers and one boolean of state per cube
 * - `event.stopPropagation()` in the hover handler keeps the highlight on the NEAREST
 *   box only, which is what the original's `intersects[0]` picked
 * - `events={{ updateOnFrame: true }}`: fiber re-raycasts the last pointer position
 *   every frame, so boxes drifting under a still cursor still light up — the original
 *   got this for free by raycasting inside `render()`
 * - Driving the default camera from `useFrame` with the demo's own orbit, so the
 *   baseline camera-controls are switched off
 */
import { useMemo, useState } from 'react';
import { BoxGeometry, MathUtils, NoToneMapping } from 'three/webgpu';
import { Canvas, createPointerEvents, useFrame, type ThreeElements } from '@react-three/fiber/webgpu';
import { DemoHelpers } from '../../utils/DemoHelpers';

const COUNT = 2000;
const RADIUS = 5;

//* Cube ==========================================================

type CubeProps = ThreeElements['mesh'] & { color: string };

function Cube({ color, ...props }: CubeProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <mesh
      {...props}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}>
      <meshLambertNodeMaterial color={color} emissive={hovered ? '#ff0000' : '#000000'} />
    </mesh>
  );
}

//* Scene =========================================================

function OrbitingCamera() {
  // Original: `theta += 0.1` degrees per frame at ~60 fps.
  useFrame(({ camera, elapsed }) => {
    const theta = MathUtils.degToRad(elapsed * 6);
    camera.position.set(RADIUS * Math.sin(theta), RADIUS * Math.sin(theta), RADIUS * Math.cos(theta));
    camera.lookAt(0, 0, 0);
  });
  return null;
}

function CubeField() {
  // REVIEW(shared-instance): one BoxGeometry across 2000 meshes, as in the original; a
  // JSX child would allocate 2000. Every cube has its own material (it must — the
  // highlight is per-cube), so <Instances> would not buy anything here.
  const box = useMemo(() => new BoxGeometry(), []);

  const [cubes] = useState(() =>
    Array.from({ length: COUNT }, () => ({
      color: `#${Math.floor(Math.random() * 0xffffff)
        .toString(16)
        .padStart(6, '0')}`,
      position: [Math.random() * 40 - 20, Math.random() * 40 - 20, Math.random() * 40 - 20] as const,
      rotation: [Math.random() * 2 * Math.PI, Math.random() * 2 * Math.PI, Math.random() * 2 * Math.PI] as const,
      scale: [Math.random() + 0.5, Math.random() + 0.5, Math.random() + 0.5] as const,
    })),
  );

  return cubes.map((cube, i) => <Cube key={i} geometry={box} {...cube} />);
}

export default function InteractiveCubes() {
  return (
    <Canvas
      renderer={{ toneMapping: NoToneMapping }}
      background="#f0f0f0"
      camera={{ fov: 70, near: 0.1, far: 100 }}
      events={(store) => ({ ...createPointerEvents(store), updateOnFrame: true })}>
      <directionalLight position={[1, 1, 1]} intensity={3} />
      <OrbitingCamera />
      <CubeField />
      <DemoHelpers grid={false} controls={false} />
    </Canvas>
  );
}

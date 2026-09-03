/**
 * interactive-voxelpainter
 * Click to stack textured 50-unit cubes on a grid; shift-click removes one. A red
 * ghost cube follows the pointer to show where the next voxel lands.
 * Original: https://threejs.org/examples/#webgl_interactive_voxelpainter
 *
 * DEMONSTRATES
 * - `event.point` + `event.face.normal` from fiber's pointer events: the voxel goes on
 *   the face you clicked, whether that face belongs to the ground plane or a cube
 * - `event.nativeEvent.shiftKey` replaces the original's keydown/keyup listeners
 * - `onClick` only fires when the pointer barely moved, so orbiting the camera never
 *   drops a voxel — the original had no camera controls to conflict with
 * - Voxels are React state: a set of grid keys mapped to meshes, so "remove" is a
 *   filter, not `scene.remove` + `objects.splice`
 * - `rotateX={once(…)}` bakes the plane's rotation into the GEOMETRY, so the hit's
 *   face normal is already in world space (the original's `geometry.rotateX`)
 */
import { useRef, useState } from 'react';
import type { Mesh } from 'three/webgpu';
import { NoToneMapping } from 'three/webgpu';
import { Canvas, once, useTexture, type ThreeEvent } from '@react-three/fiber/webgpu';
import { DemoHelpers } from '../../utils/DemoHelpers';

const VOXEL_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/square-outline-textured.png';
const SIZE = 50;

// Cell centre on the SIZE-unit grid, one voxel out along the face that was hit.
function snapToGrid(event: ThreeEvent<MouseEvent>) {
  return event.point
    .clone()
    .add(event.face!.normal)
    .divideScalar(SIZE)
    .floor()
    .multiplyScalar(SIZE)
    .addScalar(SIZE / 2)
    .toArray();
}

function VoxelPainter() {
  const map = useTexture(VOXEL_URL);
  const rollOverRef = useRef<Mesh>(null);
  const [voxels, setVoxels] = useState<string[]>([]);

  const showRollOver = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    rollOverRef.current?.position.fromArray(snapToGrid(event));
  };

  // Shift-click on a cube removes it; a plain click adds one next to whatever was hit.
  const paint = (event: ThreeEvent<MouseEvent>, key?: string) => {
    event.stopPropagation();
    if (event.nativeEvent.shiftKey) {
      if (key) setVoxels((current) => current.filter((k) => k !== key));
    } else {
      const next = snapToGrid(event).join(',');
      setVoxels((current) => (current.includes(next) ? current : [...current, next]));
    }
  };

  return (
    <>
      <mesh ref={rollOverRef}>
        <boxGeometry args={[SIZE, SIZE, SIZE]} />
        <meshBasicNodeMaterial color="#ff0000" opacity={0.5} transparent />
      </mesh>

      {voxels.map((key) => (
        <mesh
          key={key}
          position={key.split(',').map(Number) as [number, number, number]}
          onPointerMove={showRollOver}
          onClick={(event) => paint(event, key)}>
          <boxGeometry args={[SIZE, SIZE, SIZE]} />
          <meshLambertNodeMaterial color="#feb74c" map={map} />
        </mesh>
      ))}

      <gridHelper args={[1000, 20]} />
      <mesh onPointerMove={showRollOver} onClick={paint}>
        <planeGeometry args={[1000, 1000]} rotateX={once(-Math.PI / 2)} />
        <meshBasicNodeMaterial visible={false} />
      </mesh>
    </>
  );
}

export default function InteractiveVoxelPainter() {
  return (
    <Canvas
      renderer={{ toneMapping: NoToneMapping }}
      background="#f0f0f0"
      camera={{ position: [500, 800, 1300], fov: 45, near: 1, far: 10000 }}>
      <ambientLight color="#606060" intensity={3} />
      <directionalLight color="#ffffff" intensity={3} position={[1, 0.75, 0.5]} />
      <VoxelPainter />
      <DemoHelpers grid={false} />
    </Canvas>
  );
}

/**
 * instancing-raycast
 * A 10x10x10 lattice of white spheres in ONE InstancedMesh. Sweep the pointer across
 * it and every instance you touch takes a random colour.
 * Original: https://threejs.org/examples/#webgl_instancing_raycast
 *
 * DEMONSTRATES
 * - Per-instance picking with fiber events: `event.instanceId` on an `<instancedMesh>`
 *   handler is the index the original dug out of `raycaster.intersectObject(mesh)`
 * - `setColorAt` / `instanceColor.needsUpdate` — three's own per-instance colour API,
 *   still the right imperative escape hatch inside the handler
 * - `count` as a plain prop: fiber writes it straight onto the mesh, so the leva slider
 *   shrinks the drawn range without touching the buffers `args` allocated
 * - `events={{ updateOnFrame: true }}` so instances drifting under a still cursor during
 *   the orbit's damping still get painted, as the original's per-frame raycast did
 */
import { useLayoutEffect, useRef } from 'react';
import { Color, Matrix4, NoToneMapping } from 'three/webgpu';
import type { InstancedMesh } from 'three/webgpu';
import { Canvas, createPointerEvents } from '@react-three/fiber/webgpu';
import { useControls } from 'leva';
import { DemoHelpers } from '../../utils/DemoHelpers';

const AMOUNT = 10;
const COUNT = AMOUNT ** 3;
// Original: OrbitControls with zoom and pan disabled — pin the dolly at the start distance.
const CAMERA_DISTANCE = Math.hypot(AMOUNT, AMOUNT, AMOUNT);

const color = new Color();
const white = new Color('#ffffff');

function InstancedSpheres() {
  const meshRef = useRef<InstancedMesh>(null);
  const { count } = useControls('instancing-raycast', { count: { value: COUNT, min: 0, max: COUNT, step: 1 } });

  // Lay out the lattice once. Layout effect so the first render already sees the
  // matrices and the instanceColor buffer `setColorAt` lazily creates.
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const matrix = new Matrix4();
    const offset = (AMOUNT - 1) / 2;
    let i = 0;
    for (let x = 0; x < AMOUNT; x++) {
      for (let y = 0; y < AMOUNT; y++) {
        for (let z = 0; z < AMOUNT; z++) {
          mesh.setMatrixAt(i, matrix.setPosition(offset - x, offset - y, offset - z));
          mesh.setColorAt(i++, white);
        }
      }
    }
  }, []);

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, COUNT]}
      count={count}
      onPointerMove={({ instanceId }) => {
        const mesh = meshRef.current;
        if (!mesh || instanceId === undefined) return;
        mesh.getColorAt(instanceId, color);
        if (color.equals(white)) {
          mesh.setColorAt(instanceId, color.setHex(Math.random() * 0xffffff));
          mesh.instanceColor!.needsUpdate = true;
        }
      }}>
      <icosahedronGeometry args={[0.5, 3]} />
      <meshPhongNodeMaterial color="#ffffff" />
    </instancedMesh>
  );
}

export default function InstancingRaycast() {
  return (
    <Canvas
      renderer={{ toneMapping: NoToneMapping }}
      camera={{ position: [AMOUNT, AMOUNT, AMOUNT], fov: 60, near: 0.1, far: 100 }}
      events={(store) => ({ ...createPointerEvents(store), updateOnFrame: true })}>
      <hemisphereLight args={['#ffffff', '#888888', 3]} position={[0, 1, 0]} />
      <InstancedSpheres />
      <DemoHelpers grid={false} pan={false} minDistance={CAMERA_DISTANCE} maxDistance={CAMERA_DISTANCE} />
    </Canvas>
  );
}

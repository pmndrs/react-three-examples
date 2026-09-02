// The grid of colored orbs: one InstancedMesh of UNLIT spheres (color read back from a
// per-instance `InstancedBufferAttribute` via TSL) plus one REAL `PointLight` per orb —
// ~800 lights is exactly the case ClusteredLighting.tsx exists for (see
// ClusteredPipeline.tsx). The two are kept in sync purely by sharing the same x/z/phase
// data, matching the original's separate `spheresMesh.setMatrixAt` / `light.position.y`
// writes in one loop.
import { useRef, useState } from 'react';
import { instancedBufferAttribute } from 'three/tsl';
import {
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshBasicNodeMaterial,
  Object3D,
  SphereGeometry,
} from 'three/webgpu';
import type { PointLight } from 'three/webgpu';

import { useFrame } from '@react-three/fiber/webgpu';
import { useControls } from 'leva';

const GRID = 30; // GRID x GRID candidate positions
const SPACING = 5;
const RADIUS = 0.5;
const WAVE_HEIGHT = 4;
const BIG_RADIUS = 6;
const BASE_POWER = 45;

// Clearings where the four big spheres (Environment.tsx) sit — orbs this close to one
// are skipped, same as the original's `bigPositions.some(...)` filter.
const BIG_POSITIONS: [number, number][] = [
  [-9, -9],
  [9, -9],
  [-9, 9],
  [9, 9],
];

interface Ball {
  x: number;
  z: number;
  phase: number;
  color: Color;
}

// Scratch transform, reused every frame/setup pass — not React state (same rationale
// as instance-mesh's scratch `dummy` Object3D, AGENTS.md module-scope-constant rule).
const dummy = new Object3D();

function buildBallField() {
  const maxCount = GRID * GRID;
  const colorAttribute = new InstancedBufferAttribute(new Float32Array(maxCount * 3), 3);

  const material = new MeshBasicNodeMaterial();
  material.colorNode = instancedBufferAttribute<'vec3'>(colorAttribute, 'vec3');

  const mesh = new InstancedMesh(new SphereGeometry(RADIUS, 32, 16), material, maxCount);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);

  const balls: Ball[] = [];
  const color = new Color();
  const span = (GRID - 1) * SPACING;

  let i = 0;
  for (let ix = 0; ix < GRID; ix++) {
    for (let iz = 0; iz < GRID; iz++) {
      const x = ix * SPACING - span / 2;
      const z = iz * SPACING - span / 2;

      if (BIG_POSITIONS.some(([bx, bz]) => Math.hypot(x - bx, z - bz) < BIG_RADIUS + 1)) continue;

      const phase = (ix + iz) * 0.5;
      dummy.position.set(x, RADIUS, z);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      color.setHSL((ix * GRID + iz) / (GRID * GRID), 1, 0.5);
      colorAttribute.setXYZ(i, color.r, color.g, color.b);
      balls.push({ x, z, phase, color: color.clone() });

      i++;
    }
  }
  mesh.count = i;

  return { balls, mesh };
}

export function BallField() {
  const { intensity, animate } = useControls('lights-clustered', {
    intensity: { value: 1, min: 0, max: 3, label: 'light intensity' },
    animate: true,
  });

  // Lazy useState (not useMemo): the mesh + its instance buffers must stay
  // identity-stable across StrictMode's double render (AGENTS.md create-once rule).
  const [{ balls, mesh }] = useState(() => buildBallField());
  const lightRefs = useRef<(PointLight | null)[]>([]);

  useFrame(({ elapsed }) => {
    if (!animate) return;
    for (let i = 0; i < balls.length; i++) {
      const ball = balls[i];
      const y = RADIUS + (0.5 + 0.5 * Math.sin(elapsed * 1.5 + ball.phase)) * WAVE_HEIGHT;
      dummy.position.set(ball.x, y, ball.z);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      const light = lightRefs.current[i];
      if (light) light.position.y = y;
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <primitive object={mesh} />
      {balls.map((ball, i) => (
        <pointLight
          key={i}
          ref={(el) => {
            lightRefs.current[i] = el;
          }}
          color={ball.color}
          position={[ball.x, RADIUS, ball.z]}
          power={BASE_POWER * intensity}
          distance={9}
        />
      ))}
    </>
  );
}

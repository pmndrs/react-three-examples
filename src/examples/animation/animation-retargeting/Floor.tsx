// A faint reflective floor: a `reflector()` TSL node feeds a transparent NodeMaterial's
// `colorNode` directly (unlike reflection/ReflectiveFloor.tsx, there's no diffuse
// checkerboard or normal-map perturbation to blend with here — just the mirrored render
// at low opacity, matching the original's minimal floor).
import { useMemo } from 'react';
import { reflector } from 'three/tsl';

export function Floor() {
  const reflection = useMemo(() => reflector(), []);

  return (
    <>
      <mesh receiveShadow>
        <boxGeometry args={[50, 0.001, 50]} />
        <nodeMaterial colorNode={reflection} opacity={0.2} transparent />
      </mesh>
      <primitive object={reflection.target} rotation-x={-Math.PI / 2} />
    </>
  );
}

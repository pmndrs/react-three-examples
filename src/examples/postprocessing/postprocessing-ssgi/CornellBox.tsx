// The Cornell-box scene: five walls off one shared unit plane, two boxes, and a disc
// standing in for the ceiling lamp. The saturated side walls are the point — they are
// what the GI pass bounces onto the white surfaces.
import { useMemo } from 'react';
import { MeshPhysicalMaterial, PlaneGeometry } from 'three/webgpu';

// scale + rotation off ONE unit plane, exactly as the original builds it.
const SURFACES: {
  scale: [number, number, number];
  position?: [number, number, number];
  rotation?: [number, number, number];
}[] = [
  { scale: [20, 20, 1], rotation: [-Math.PI / 2, 0, 0] }, // floor
  { scale: [15, 20, 1], position: [0, 7.5, -10], rotation: [0, 0, -Math.PI / 2] }, // back wall
  { scale: [20, 20, 1], position: [0, 15, 0], rotation: [Math.PI / 2, 0, 0] }, // ceiling
];

export function CornellBox() {
  // REVIEW(shared-instance): one plane geometry across 5 walls and one white material
  // across 5 surfaces + both boxes. JSX children would build a copy per mesh, so the
  // shared instances are the right call here — but a Cornell box is also a fair
  // candidate for <Instances> if this scene ever grows.
  const { wallGeometry, whiteMaterial } = useMemo(
    () => ({
      wallGeometry: new PlaneGeometry(1, 1),
      whiteMaterial: new MeshPhysicalMaterial({ color: '#ffffff' }),
    }),
    [],
  );

  return (
    <>
      {SURFACES.map((surface) => (
        <mesh
          key={surface.scale.join() + (surface.position?.join() ?? '')}
          geometry={wallGeometry}
          material={whiteMaterial}
          receiveShadow
          {...surface}
        />
      ))}

      {/* The two colored walls: the GI bounce sources. */}
      <mesh
        geometry={wallGeometry}
        scale={[20, 15, 1]}
        position={[-10, 7.5, 0]}
        rotation-y={Math.PI * 0.5}
        receiveShadow>
        <meshPhysicalMaterial color="#ff0000" />
      </mesh>
      <mesh
        geometry={wallGeometry}
        scale={[20, 15, 1]}
        position={[10, 7.5, 0]}
        rotation-y={Math.PI * -0.5}
        receiveShadow>
        <meshPhysicalMaterial color="#00ff00" />
      </mesh>

      <mesh material={whiteMaterial} position={[-3, 3.5, -2]} rotation-y={Math.PI * 0.25} castShadow receiveShadow>
        <boxGeometry args={[5, 7, 5]} />
      </mesh>
      <mesh material={whiteMaterial} position={[4, 2, 4]} rotation-y={Math.PI * -0.1} castShadow receiveShadow>
        <boxGeometry args={[4, 4, 4]} />
      </mesh>

      {/* Visible stand-in for the lamp — unlit basic material, no shadow role. */}
      <mesh position-y={15}>
        <cylinderGeometry args={[2.5, 2.5, 1, 64]} />
        <meshBasicMaterial />
      </mesh>
    </>
  );
}

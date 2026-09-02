// The floor, the 100 orbiting shapes and the center sphere — never change, only the
// point-light count in DynamicLights.tsx does. Built once via useMemo (procedural
// layout, not a value React can express any more declaratively without losing the
// "50 unique materials, 100 meshes" count the demo advertises).
import { useMemo } from 'react';
import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
} from 'three/webgpu';
import type { Material } from 'three/webgpu';

const MESH_COUNT = 100;
const UNIQUE_MATERIAL_COUNT = 50;
const MESHES_PER_RING = 10;

// One shared geometry per shape, matching the original's 5-geometry cycle. Constant
// assets, not mutable state — module scope is the idiomatic call (lights-phong,
// lights-pointlights precedent).
const GEOMETRIES = [
  new SphereGeometry(0.8, 128, 128),
  new BoxGeometry(1.2, 1.2, 1.2, 64, 64, 64),
  new TorusGeometry(0.6, 0.25, 128, 128),
  new CylinderGeometry(0.5, 0.5, 1.4, 128, 64),
  new ConeGeometry(0.6, 1.4, 128, 64),
];

interface ShapeLayout {
  geometry: (typeof GEOMETRIES)[number];
  material: Material;
  position: [number, number, number];
  rotation: [number, number, number];
}

export function Shapes() {
  // REVIEW(shared-instance): 50 materials genuinely shared across 100 meshes (each
  // instance lights exactly two) — the demo's own stated point, not incidental reuse.
  const layout = useMemo<ShapeLayout[]>(() => {
    const materials = Array.from(
      { length: UNIQUE_MATERIAL_COUNT },
      (_, i) =>
        new MeshStandardMaterial({
          color: new Color().setHSL(i / UNIQUE_MATERIAL_COUNT, 0.6 + Math.random() * 0.4, 0.35 + Math.random() * 0.3),
          roughness: Math.random(),
          metalness: Math.random(),
        }),
    );

    return Array.from({ length: MESH_COUNT }, (_, i) => {
      const ring = Math.floor(i / MESHES_PER_RING);
      const indexInRing = i % MESHES_PER_RING;
      const angle = (indexInRing / MESHES_PER_RING) * Math.PI * 2 + ring * 0.3;
      const radius = 6 + ring * 4;
      return {
        geometry: GEOMETRIES[i % GEOMETRIES.length],
        material: materials[i % UNIQUE_MATERIAL_COUNT],
        position: [Math.cos(angle) * radius, 0.7 + Math.random() * 2, Math.sin(angle) * radius],
        rotation: [Math.random() * Math.PI, Math.random() * Math.PI, 0],
      };
    });
  }, []);

  return (
    <>
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[120, 120]} />
        <meshStandardMaterial color="#444444" roughness={0.8} />
      </mesh>
      {layout.map((shape, i) => (
        <mesh
          key={i}
          geometry={shape.geometry}
          material={shape.material}
          position={shape.position}
          rotation={shape.rotation}
        />
      ))}
      <mesh position={[0, 2, 0]}>
        <sphereGeometry args={[2, 128, 128]} />
        <meshStandardMaterial color="#ffffff" roughness={0.1} metalness={0.9} />
      </mesh>
    </>
  );
}

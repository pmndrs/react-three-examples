/**
 * geometry-csg
 * Boolean geometry, live: a cylinder is subtracted from (or intersected with, or added to) a
 * sphere every frame while both tumble, using three-bvh-csg.
 * Original: https://threejs.org/examples/#webgl_geometry_csg
 *
 * DEMONSTRATES
 * - three-bvh-csg's `Brush` as a JSX element: the two operands are ordinary `<brush>`
 *   meshes with geometry/material children, kept `visible={false}` because only the
 *   evaluated result is drawn (the original never adds them to the scene either)
 * - `Evaluator.evaluate(a, b, op, result)` in `useFrame`, rebuilding into one persistent
 *   result brush — the evaluator owns that brush's geometry AND material, so it gets no
 *   JSX children; with `useGroups` the operands' materials survive as geometry groups
 * - A wireframe overlay that borrows the result geometry object, toggled via `visible`
 * - `<shadowNodeMaterial>` on a plane catching the result's shadow
 */
import { useRef, useState } from 'react';
import { DoubleSide, NoToneMapping } from 'three/webgpu';
import type { Mesh } from 'three/webgpu';
import { Canvas, useFrame } from '@react-three/fiber/webgpu';
import { useControls } from 'leva';
import { ADDITION, Evaluator, INTERSECTION, SUBTRACTION } from 'three-bvh-csg';
import type { Brush } from 'three-bvh-csg';
import '../../assets/Brush';
import { DemoHelpers } from '../../utils/DemoHelpers';

// Every solid gets the same polygon offset so the wireframe overlay wins the depth test.
const OFFSET = { polygonOffset: true, polygonOffsetUnits: 1, polygonOffsetFactor: 1 };

function CsgResult() {
  const { operation, wireframe, useGroups } = useControls('geometry-csg', {
    operation: { value: SUBTRACTION, options: { SUBTRACTION, INTERSECTION, ADDITION } },
    wireframe: false,
    useGroups: true,
  });
  const [evaluator] = useState(() => new Evaluator());
  const baseRef = useRef<Brush>(null);
  const brushRef = useRef<Brush>(null);
  const resultRef = useRef<Brush>(null);
  const wireframeRef = useRef<Mesh>(null);

  useFrame(({ time }) => {
    const base = baseRef.current;
    const brush = brushRef.current;
    const result = resultRef.current;
    if (!base || !brush || !result) return;

    // Operand transforms, with updateMatrixWorld() by hand (as the original does) so the
    // evaluator sees this frame's matrices, not last frame's.
    const t = time + 9000;
    base.rotation.set(t * 0.0001, t * 0.00025, t * 0.0005);
    base.updateMatrixWorld();

    const s = 0.5 + 0.5 * (1 + Math.sin(t * 0.001));
    brush.rotation.set(t * -0.0002, t * -0.0005, t * -0.001);
    brush.scale.set(s, 1, s);
    brush.updateMatrixWorld();

    evaluator.useGroups = useGroups;
    evaluator.evaluate(base, brush, operation, result);

    if (wireframeRef.current) wireframeRef.current.geometry = result.geometry;
  });

  return (
    <>
      <brush ref={baseRef} visible={false}>
        <icosahedronGeometry args={[2, 3]} />
        <meshStandardNodeMaterial flatShading {...OFFSET} />
      </brush>
      <brush ref={brushRef} visible={false}>
        <cylinderGeometry args={[1, 1, 5, 45]} />
        <meshStandardNodeMaterial color="#80cbc4" {...OFFSET} />
      </brush>
      {/* Filled by the evaluator every frame — no geometry or material of its own. */}
      <brush ref={resultRef} castShadow receiveShadow />
      <mesh ref={wireframeRef} visible={wireframe}>
        <meshBasicNodeMaterial color="#009688" wireframe />
      </mesh>
    </>
  );
}

export default function GeometryCsg() {
  return (
    <Canvas
      // The original never sets a tone mapping — WebGPURenderer's default is none.
      renderer={{ toneMapping: NoToneMapping }}
      shadows
      background="#fce4ec"
      // (-1, 1, 1) normalised, ten units out
      camera={{ position: [-5.77, 5.77, 5.77], fov: 50, near: 1, far: 100 }}>
      <hemisphereLight color="#ffffff" groundColor="#bfd4d2" intensity={3} />
      <directionalLight
        color="#ffffff"
        intensity={0.3}
        position={[3, 12, 9]}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-1e-4}
        shadow-normalBias={1e-4}
      />
      <CsgResult />
      {/* The glowing core sits inside the sphere and shows through the subtraction. */}
      <mesh castShadow>
        <icosahedronGeometry args={[0.15, 1]} />
        <meshStandardNodeMaterial flatShading color="#ff9800" emissive="#ff9800" emissiveIntensity={0.35} {...OFFSET} />
      </mesh>
      <mesh position-y={-3} rotation-x={-Math.PI / 2} scale={10} receiveShadow>
        <planeGeometry />
        <shadowNodeMaterial color="#d81b60" transparent opacity={0.075} side={DoubleSide} />
      </mesh>
      {/* Grid off: the tinted shadow plane is the floor. */}
      <DemoHelpers grid={false} minDistance={5} maxDistance={75} />
    </Canvas>
  );
}

/**
 * loader-pdb
 * A molecule loaded from a Protein Data Bank file: every atom a CPK-coloured sphere with a
 * floating element label, every bond a thin bar oriented between the two atoms it joins. The
 * whole assembly tumbles slowly while a leva dropdown switches which molecule loaded.
 * Original: https://threejs.org/examples/#webgl_loader_pdb
 *
 * DEMONSTRATES
 * - `useLoader(PDBLoader, …)` returning real geometry (`geometryAtoms`/`geometryBonds`) plus
 *   a parallel `json.atoms` array carrying each atom's CPK colour and element symbol
 * - Reading a Suspense-cached geometry without mutating it: the original centres the molecule
 *   by `translate()`-ing the loaded `BufferGeometry` in place; here the centre is subtracted
 *   while copying each position into a local `Vector3`, because the loader result is shared
 *   and outlives this component (same technique as `scene/molecules.tsx`)
 * - A bond's orientation from `Quaternion.setFromUnitVectors`, in place of the original's
 *   `Object3D.lookAt` — the box is square in cross-section, so the unconstrained roll the two
 *   approaches disagree on is invisible
 * - drei `<Html>` (default, screen-space mode) as the CSS2DObject replacement for the
 *   per-atom label — always billboarded, no distance falloff, matching the original exactly
 *
 * DIVERGENCE from original
 * - `@types/three` types `PDB.json.atoms` as `any[][]`; the CPK colour and element symbol are
 *   read positionally (`atom[3]`, `atom[4]`) exactly as the original does
 */
import { Suspense, useMemo, useRef } from 'react';
import { Color, NoToneMapping, Quaternion, Vector3 } from 'three/webgpu';
import type { Group } from 'three/webgpu';
import { PDBLoader } from 'three/addons/loaders/PDBLoader.js';
import { Canvas, useFrame, useLoader } from '@react-three/fiber/webgpu';
import { Html } from '@react-three/drei/webgpu';
import { useControls } from 'leva';
import { DemoHelpers } from '../../utils/DemoHelpers';

const ASSETS = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/pdb';

const MOLECULES = {
  Ethanol: 'ethanol.pdb',
  Aspirin: 'aspirin.pdb',
  Caffeine: 'caffeine.pdb',
  Nicotine: 'nicotine.pdb',
  LSD: 'lsd.pdb',
  Cocaine: 'cocaine.pdb',
  Cholesterol: 'cholesterol.pdb',
  Lycopene: 'lycopene.pdb',
  Glucose: 'glucose.pdb',
  'Aluminium oxide': 'Al2O3.pdb',
  Cubane: 'cubane.pdb',
  Copper: 'cu.pdb',
  Fluorite: 'caf2.pdb',
  Salt: 'nacl.pdb',
  'YBCO superconductor': 'ybco.pdb',
  Buckyball: 'buckyball.pdb',
  Graphite: 'graphite.pdb',
};

// PDB units to world units, as the original.
const SCALE = 75;
const FORWARD = new Vector3(0, 0, 1);

function Molecule() {
  const { molecule } = useControls('Molecules', { molecule: { value: 'caffeine.pdb', options: MOLECULES } });
  const pdb = useLoader(PDBLoader, `${ASSETS}/${molecule}`);

  const { atoms, bonds } = useMemo(() => {
    const { geometryAtoms, geometryBonds, json } = pdb;
    geometryAtoms.computeBoundingBox();
    const center = geometryAtoms.boundingBox!.getCenter(new Vector3());
    const atomPositions = geometryAtoms.getAttribute('position');
    const atomColors = geometryAtoms.getAttribute('color');
    const bondPositions = geometryBonds.getAttribute('position');

    const color = new Color();
    const atoms = Array.from({ length: atomPositions.count }, (_, i) => {
      const [r, g, b] = json.atoms[i][3] as number[];
      return {
        position: new Vector3().fromBufferAttribute(atomPositions, i).sub(center).multiplyScalar(SCALE),
        color: color.fromBufferAttribute(atomColors, i).clone(),
        labelColor: `rgb(${r}, ${g}, ${b})`,
        element: String(json.atoms[i][4]),
      };
    });

    const start = new Vector3();
    const end = new Vector3();
    const bonds = Array.from({ length: bondPositions.count / 2 }, (_, i) => {
      start
        .fromBufferAttribute(bondPositions, i * 2)
        .sub(center)
        .multiplyScalar(SCALE);
      end
        .fromBufferAttribute(bondPositions, i * 2 + 1)
        .sub(center)
        .multiplyScalar(SCALE);
      const direction = end.clone().sub(start);
      return {
        position: start.clone().lerp(end, 0.5),
        quaternion: new Quaternion().setFromUnitVectors(FORWARD, direction.clone().normalize()),
        length: direction.length(),
      };
    });

    return { atoms, bonds };
  }, [pdb]);

  const rootRef = useRef<Group>(null);
  useFrame(({ elapsed }) => {
    const time = elapsed * 0.4;
    rootRef.current!.rotation.set(time, time * 0.7, 0);
  });

  return (
    <group ref={rootRef}>
      {atoms.map((atom, i) => (
        <group key={i} position={atom.position}>
          <mesh scale={25}>
            <icosahedronGeometry args={[1, 3]} />
            <meshPhongNodeMaterial color={atom.color} />
          </mesh>
          <Html style={{ pointerEvents: 'none' }}>
            <div
              className="label"
              style={{
                marginLeft: 25,
                fontSize: 20,
                color: atom.labelColor,
                textShadow: '-1px 1px 1px rgb(0,0,0)',
              }}>
              {atom.element}
            </div>
          </Html>
        </group>
      ))}
      {bonds.map((bond, i) => (
        <mesh key={i} position={bond.position} quaternion={bond.quaternion} scale={[5, 5, bond.length]}>
          <boxGeometry />
          <meshPhongNodeMaterial color="#ffffff" />
        </mesh>
      ))}
    </group>
  );
}

export default function LoaderPdb() {
  return (
    <Canvas
      renderer={{ toneMapping: NoToneMapping }}
      background="#050505"
      camera={{ position: [0, 0, 1000], fov: 70, near: 1, far: 5000 }}>
      <directionalLight color="#ffffff" intensity={2.5} position={[1, 1, 1]} />
      <directionalLight color="#ffffff" intensity={1.5} position={[-1, -1, 1]} />
      <Suspense fallback={null}>
        <Molecule />
      </Suspense>
      <DemoHelpers grid={false} minDistance={500} maxDistance={2000} />
    </Canvas>
  );
}

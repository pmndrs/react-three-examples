/**
 * molecules
 * A molecule loaded from a PDB file, tumbling in space: every atom is a billboarded HTML
 * sprite tinted by element, every bond a pair of crossed HTML bars. Pick a molecule and
 * whether to see atoms, bonds or both.
 * Original: https://threejs.org/examples/#css3d_molecules
 *
 * DEMONSTRATES
 * - drei's `<Html transform sprite>` (atoms: always face the camera) and `<Html transform>`
 *   (bonds: carry a real rotation) as ONE component. The original runs a `CSS3DRenderer` beside
 *   its scene and builds a `CSS3DSprite`/`CSS3DObject` per atom and bond by hand
 * - `useLoader(PDBLoader)` for the molecule and `useLoader(ImageLoader)` for the ball sprite,
 *   so switching molecules is a Suspense re-suspend, not a remove-everything-and-reload loop
 * - Read-only use of a Suspense-cached geometry: the original centres the molecule by
 *   `translate()`-ing the loaded geometries in place; here the centre is subtracted while
 *   reading, because the loader result is shared and must not be mutated
 * - A bond's orientation from `Quaternion.setFromUnitVectors` on a `<group>`, in place of the
 *   original's cross-product / acos / `makeRotationAxis` matrix
 *
 * DIVERGENCE from original
 * - The body's radial-gradient background is the Canvas' CSS background; the renderer clears
 *   to transparent
 */
import { Suspense, useMemo, useRef } from 'react';
import { Color, ImageLoader, Quaternion, Vector3 } from 'three/webgpu';
import type { Group } from 'three/webgpu';
import { PDBLoader } from 'three/addons/loaders/PDBLoader.js';
import { Canvas, useFrame, useLoader } from '@react-three/fiber/webgpu';
import { Html } from '@react-three/drei/webgpu';
import { useControls } from 'leva';
import { DemoHelpers } from '../../utils/DemoHelpers';

const ASSETS = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples';
const BALL_URL = `${ASSETS}/textures/sprites/ball.png`;

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

const VIZ_TYPES = { Atoms: 'atoms', Bonds: 'bonds', 'Atoms + Bonds': 'both' };

// PDB units to CSS pixels, as the original.
const SCALE = 75;
const UP = new Vector3(0, 1, 0);

//* Sprites =======================================================

// The original's `colorify`: multiply the white ball sprite's pixels by the element colour
// and hand the result back as a data URL for an <img>.
function tintedBall(image: HTMLImageElement, color: Color) {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d')!;
  context.drawImage(image, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] *= color.r;
    data[i + 1] *= color.g;
    data[i + 2] *= color.b;
  }
  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL();
}

//* Scene =========================================================

function Molecule() {
  const { vizType, molecule } = useControls('Molecules', {
    vizType: { value: 'both', options: VIZ_TYPES },
    molecule: { value: 'caffeine.pdb', options: MOLECULES },
  });

  const pdb = useLoader(PDBLoader, `${ASSETS}/models/pdb/${molecule}`);
  const ball = useLoader(ImageLoader, BALL_URL);

  const { atoms, bonds } = useMemo(() => {
    const { geometryAtoms, geometryBonds, json } = pdb;
    geometryAtoms.computeBoundingBox();
    const center = geometryAtoms.boundingBox!.getCenter(new Vector3());
    const atomPositions = geometryAtoms.getAttribute('position');
    const atomColors = geometryAtoms.getAttribute('color');
    const bondPositions = geometryBonds.getAttribute('position');

    // One tinted sprite per element, shared by every atom of that element.
    const sprites = new Map<string, string>();
    const color = new Color();
    const atoms = Array.from({ length: atomPositions.count }, (_, i) => {
      const element = String(json.atoms[i][4]);
      if (!sprites.has(element)) {
        sprites.set(element, tintedBall(ball, color.fromBufferAttribute(atomColors, i)));
      }
      const position = new Vector3().fromBufferAttribute(atomPositions, i).sub(center).multiplyScalar(SCALE);
      return { position, sprite: sprites.get(element)! };
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
        // The bar's Y axis (its height) points along the bond.
        quaternion: new Quaternion().setFromUnitVectors(UP, direction.clone().normalize()),
        length: direction.length() - 50,
      };
    });

    return { atoms, bonds };
  }, [pdb, ball]);

  const rootRef = useRef<Group>(null);
  useFrame(({ elapsed }) => {
    const time = elapsed * 0.4;
    rootRef.current!.rotation.set(time, time * 0.7, 0);
  });

  // With the atoms hidden the bars grow to meet at the atom centres.
  const barLength = (length: number) => (vizType === 'bonds' ? length + 55 : length);

  return (
    <group ref={rootRef}>
      {vizType !== 'bonds' &&
        atoms.map((atom, i) => (
          <Html key={i} transform sprite distanceFactor={400} position={atom.position}>
            <img src={atom.sprite} />
          </Html>
        ))}
      {vizType !== 'atoms' &&
        bonds.map((bond, i) => (
          // Two bars crossed at 90° so the bond reads from every angle.
          <group key={i} position={bond.position} quaternion={bond.quaternion}>
            <Html transform distanceFactor={400}>
              <Bar length={barLength(bond.length)} />
            </Html>
            <Html transform distanceFactor={400} rotation={[0, Math.PI / 2, 0]}>
              <Bar length={barLength(bond.length)} />
            </Html>
          </group>
        ))}
    </group>
  );
}

function Bar({ length }: { length: number }) {
  return <div style={{ width: 5, height: length, background: '#eee', display: 'block' }} />;
}

export default function Molecules() {
  return (
    <Canvas
      renderer
      style={{ background: 'radial-gradient(ellipse at center, rgba(43,45,48,1) 0%, rgba(0,0,0,1) 100%)' }}
      camera={{ position: [0, 0, 1000], fov: 70, near: 1, far: 5000 }}>
      <Suspense fallback={null}>
        <Molecule />
      </Suspense>
      <DemoHelpers grid={false} />
    </Canvas>
  );
}

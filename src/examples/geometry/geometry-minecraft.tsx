/**
 * geometry-minecraft
 * A 128x128 block landscape from Perlin noise, textured from the Painterly Pack atlas,
 * explored with first-person controls: move the mouse to look, left-click to walk
 * forward, right-click to back up.
 * Original: https://threejs.org/examples/#webgl_geometry_minecraft
 *
 * DEMONSTRATES
 * - `mergeGeometries` over ~80k face quads into ONE draw call: each column emits its
 *   top and only the side faces its neighbours don't hide (a classic voxel culler)
 * - One texture atlas with hand-set UVs — the top-face quads sample the grass half,
 *   the sides the dirt half — and `NearestFilter` for the pixel look
 * - drei's `<FirstPersonControls>` replacing the addon setup + per-frame `update()`
 * - `camera={{ rotation: [0, 0, 0] }}`: fiber would otherwise aim the camera at the
 *   origin, straight down from its perch above the terrain
 */
import { useMemo } from 'react';
import { DoubleSide, Matrix4, NearestFilter, NoToneMapping, PlaneGeometry } from 'three/webgpu';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Canvas, useTexture } from '@react-three/fiber/webgpu';
import { FirstPersonControls } from '@react-three/drei/webgpu';
import { DemoHelpers } from '../../utils/DemoHelpers';

const ATLAS_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/minecraft/atlas.png';
const WORLD_WIDTH = 128;
const WORLD_DEPTH = 128;
const BLOCK = 100;

//* World data ====================================================

function generateHeight(width: number, height: number) {
  const size = width * height;
  const data = new Array<number>(size).fill(0);
  const perlin = new ImprovedNoise();
  const z = Math.random() * 100;
  let quality = 2;

  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < size; i++) {
      const x = i % width;
      const y = (i / width) | 0;
      data[i] += perlin.noise(x / quality, y / quality, z) * quality;
    }
    quality *= 4;
  }

  return data;
}

// One 100x100 face of a block. `uvIndices` are the two V components pushed to 0.5 so
// the quad samples only its half of the atlas; `place` rotates/translates it onto the
// right side of the unit block.
function blockFace(uvIndices: [number, number], place: (face: PlaneGeometry) => void) {
  const face = new PlaneGeometry(BLOCK, BLOCK);
  const uv = face.attributes.uv.array;
  uv[uvIndices[0]] = 0.5;
  uv[uvIndices[1]] = 0.5;
  place(face);
  return face;
}

// Emit each column's top plus whichever sides are exposed, then merge the lot.
function buildWorld() {
  const data = generateHeight(WORLD_WIDTH, WORLD_DEPTH);
  const getY = (x: number, z: number) => (data[x + z * WORLD_WIDTH] * 0.15) | 0;

  const px = blockFace([1, 3], (f) => f.rotateY(Math.PI / 2).translate(50, 0, 0));
  const nx = blockFace([1, 3], (f) => f.rotateY(-Math.PI / 2).translate(-50, 0, 0));
  const py = blockFace([5, 7], (f) => f.rotateX(-Math.PI / 2).translate(0, 50, 0));
  const pz = blockFace([1, 3], (f) => f.translate(0, 0, 50));
  const nz = blockFace([1, 3], (f) => f.rotateY(Math.PI).translate(0, 0, -50));

  const matrix = new Matrix4();
  const geometries = [];

  for (let z = 0; z < WORLD_DEPTH; z++) {
    for (let x = 0; x < WORLD_WIDTH; x++) {
      const h = getY(x, z);
      matrix.makeTranslation(x * BLOCK - (WORLD_WIDTH / 2) * BLOCK, h * BLOCK, z * BLOCK - (WORLD_DEPTH / 2) * BLOCK);

      geometries.push(py.clone().applyMatrix4(matrix));
      const exposed = (neighbour: number) => neighbour !== h && neighbour !== h + 1;
      if (exposed(getY(x + 1, z)) || x === 0) geometries.push(px.clone().applyMatrix4(matrix));
      if (exposed(getY(x - 1, z)) || x === WORLD_WIDTH - 1) geometries.push(nx.clone().applyMatrix4(matrix));
      if (exposed(getY(x, z + 1)) || z === WORLD_DEPTH - 1) geometries.push(pz.clone().applyMatrix4(matrix));
      if (exposed(getY(x, z - 1)) || z === 0) geometries.push(nz.clone().applyMatrix4(matrix));
    }
  }

  const geometry = mergeGeometries(geometries);
  geometry.computeBoundingSphere();

  return { geometry, cameraY: getY(WORLD_WIDTH / 2, WORLD_DEPTH / 2) * BLOCK + BLOCK };
}

//* Scene =========================================================

function World({ geometry }: { geometry: ReturnType<typeof buildWorld>['geometry'] }) {
  const atlas = useTexture(ATLAS_URL, (texture) => {
    texture.magFilter = NearestFilter;
  });

  return (
    <mesh geometry={geometry}>
      <meshLambertNodeMaterial map={atlas} side={DoubleSide} />
    </mesh>
  );
}

export default function GeometryMinecraft() {
  const { geometry, cameraY } = useMemo(buildWorld, []);

  return (
    <Canvas
      renderer={{ toneMapping: NoToneMapping }}
      background="#bfd1e5"
      camera={{ position: [0, cameraY, 0], rotation: [0, 0, 0], fov: 60, near: 1, far: 20000 }}>
      <ambientLight color="#eeeeee" intensity={3} />
      <directionalLight color="#ffffff" intensity={12} position={[1, 1, 0.5]} />
      <World geometry={geometry} />
      <FirstPersonControls movementSpeed={1000} lookSpeed={0.125} lookVertical />
      <DemoHelpers grid={false} controls={false} />
    </Canvas>
  );
}

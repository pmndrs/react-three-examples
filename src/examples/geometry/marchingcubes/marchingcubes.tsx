/**
 * marchingcubes
 * Metaballs: a handful of blobs swim through a scalar field and the `MarchingCubes` addon
 * re-polygonises their isosurface every frame. Thirteen materials to dress it in, from
 * chrome to hand-drawn hatching.
 * Original: https://threejs.org/examples/#webgl_marchingcubes
 *
 * DEMONSTRATES
 * - `MarchingCubes` (a `Mesh` subclass) as a JSX element via `extend()` — `args` carries
 *   its construction parameters, so changing the resolution slider REBUILDS the field the
 *   way the original's `effect.init()` does; `isolation`/`enableUvs`/`enableColors` are
 *   plain props
 * - The material is a JSX child picked by a `switch` (`BlobMaterial.tsx`): selecting one
 *   is a re-render, and `enableUvs`/`enableColors` follow the selection declaratively
 * - Four GLSL `ShaderMaterial`s (`ToonShader.js`) rewritten as TSL `fragmentNode` graphs
 *   on `meshBasicNodeMaterial`, sharing one light-weighting term
 * - The per-frame field fill (`reset` → `addBall`/`addPlane` → `update`) is the addon's
 *   own imperative API, kept as a plain function the `useFrame` loop calls
 *
 * DIVERGENCE from original
 * - The 'flat' material really is flat-shaded. The original leaves `flatShading` as a
 *   commented-out TODO because WebGL Lambert could not do it; node Lambert can
 * - The thirteen material buttons are one leva dropdown
 */
import { useRef } from 'react';
import { Color, MeshBasicNodeMaterial, NoToneMapping } from 'three/webgpu';
import { Canvas, useFrame } from '@react-three/fiber/webgpu';
import { useControls } from 'leva';
import { MarchingCubes } from '../../../assets/MarchingCubes';
import { DemoHelpers } from '../../../utils/DemoHelpers';
import { AMBIENT_COLOR, BlobMaterial, DIR_LIGHT_POSITION, MATERIAL_NAMES } from './BlobMaterial';
import type { MaterialName } from './BlobMaterial';

// `MarchingCubes` wants a material at construction; the JSX child replaces it at once.
const PLACEHOLDER_MATERIAL = new MeshBasicNodeMaterial();
const MAX_POLY_COUNT = 100000;

const RAINBOW = ['#ff0000', '#ffbb00', '#ffff00', '#00ff00', '#0000ff', '#9400bd', '#c800eb'].map((c) => new Color(c));

//* Field =========================================================

interface FieldParams {
  numBlobs: number;
  floor: boolean;
  wallx: boolean;
  wallz: boolean;
  /** 'multiColors' hands each ball its own colour; every other material ignores it. */
  rainbow: boolean;
}

// The metaball field, refilled from scratch every frame — this is the demo.
function updateCubes(object: MarchingCubes, time: number, { numBlobs, floor, wallx, wallz, rainbow }: FieldParams) {
  object.reset();

  const subtract = 12;
  const strength = 1.2 / ((Math.sqrt(numBlobs) - 1) / 4 + 1);

  for (let i = 0; i < numBlobs; i++) {
    const ballx = Math.sin(i + 1.26 * time * (1.03 + 0.5 * Math.cos(0.21 * i))) * 0.27 + 0.5;
    const bally = Math.abs(Math.cos(i + 1.12 * time * Math.cos(1.22 + 0.1424 * i))) * 0.77; // dip into the floor
    const ballz = Math.cos(i + 1.32 * time * 0.1 * Math.sin(0.92 + 0.53 * i)) * 0.27 + 0.5;

    object.addBall(ballx, bally, ballz, strength, subtract, rainbow ? RAINBOW[i % 7] : undefined);
  }

  if (floor) object.addPlaneY(2, 12);
  if (wallz) object.addPlaneZ(2, 12);
  if (wallx) object.addPlaneX(2, 12);

  object.update();
}

//* Scene =========================================================

function Metaballs() {
  const { material } = useControls('Materials', {
    material: { value: 'shiny' as MaterialName, options: [...MATERIAL_NAMES] },
  });
  const { speed, resolution, isolation, ...field } = useControls('Simulation', {
    speed: { value: 1, min: 0.1, max: 8, step: 0.05 },
    numBlobs: { value: 10, min: 1, max: 50, step: 1 },
    resolution: { value: 28, min: 14, max: 100, step: 1 },
    isolation: { value: 80, min: 10, max: 300, step: 1 },
    floor: true,
    wallx: false,
    wallz: false,
  });

  const effectRef = useRef<MarchingCubes>(null);
  const time = useRef(0); // the loop's own clock: `speed` scales it, so it isn't `elapsed`

  useFrame(({ delta }) => {
    time.current += delta * speed * 0.5;
    if (effectRef.current) {
      updateCubes(effectRef.current, time.current, { ...field, rainbow: material === 'multiColors' });
    }
  });

  return (
    <marchingCubes
      ref={effectRef}
      args={[resolution, PLACEHOLDER_MATERIAL, true, true, MAX_POLY_COUNT]}
      scale={700}
      isolation={isolation}
      enableUvs={material === 'textured'}
      enableColors={material === 'colors' || material === 'multiColors'}>
      <BlobMaterial name={material} />
    </marchingCubes>
  );
}

export default function Marchingcubes() {
  return (
    <Canvas
      renderer={{ toneMapping: NoToneMapping }}
      background="#050505"
      camera={{ position: [-500, 500, 1500], fov: 45, near: 1, far: 10000 }}>
      <directionalLight position={DIR_LIGHT_POSITION} intensity={3} />
      <pointLight color="#ff7c00" intensity={3} decay={0} position={[0, 0, 100]} />
      <ambientLight color={AMBIENT_COLOR} intensity={3} />
      <Metaballs />
      {/* Grid off: the field is a 700-unit cube on the origin. */}
      <DemoHelpers grid={false} minDistance={500} maxDistance={5000} />
    </Canvas>
  );
}

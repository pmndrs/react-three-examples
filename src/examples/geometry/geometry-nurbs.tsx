/**
 * geometry-nurbs
 * A random NURBS curve with its control polygon, a NURBS surface, and five slices through a
 * NURBS volume — all evaluated on the CPU into ordinary geometry.
 * Original: https://threejs.org/examples/#webgl_geometry_nurbs
 *
 * DEMONSTRATES
 * - `NURBSCurve` sampled with `getPoints()` into a `<threeLine>`, with its control points
 *   drawn the same way as a faint second polyline — one small `<Polyline>` component
 * - `NURBSSurface`/`NURBSVolume` meshed through `<parametricGeometry>`; the volume has three
 *   parameters, so five surfaces each pin one of them (w = 0 / 0.5 / 1, v = 1, u = 0),
 *   mapped from a small array of evaluator functions
 * - One UV-grid texture shared by every surface so the parameterisation stays visible
 *
 * DIVERGENCE from original
 * - The original's drag-to-spin pointer code is replaced by camera-controls: orbit instead
 *   of rotating the group
 */
import { Suspense, useLayoutEffect, useMemo } from 'react';
import { DoubleSide, MathUtils, NoToneMapping, RepeatWrapping, SRGBColorSpace, Vector4 } from 'three/webgpu';
import type { Vector3 } from 'three/webgpu';
import { NURBSCurve } from 'three/addons/curves/NURBSCurve.js';
import { NURBSSurface } from 'three/addons/curves/NURBSSurface.js';
import { NURBSVolume } from 'three/addons/curves/NURBSVolume.js';
import { Canvas, type ThreeElements } from '@react-three/fiber/webgpu';
import { useTexture } from '@react-three/drei/webgpu';
import '../../assets/ParametricGeometry';
import '../../assets/ThreeLine';
import { DemoHelpers } from '../../utils/DemoHelpers';

const UV_GRID_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/uv_grid_opengl.jpg';

//* NURBS data ====================================================

// Weighted control point: the fourth component is the weight (higher = stronger pull).
const p = (x: number, y: number, z: number, w = 1) => new Vector4(x, y, z, w);

// Twenty random cubic control points over a clamped uniform knot vector.
function randomCurve() {
  const degree = 3;
  const knots = Array.from({ length: degree + 1 }, () => 0);
  const controlPoints: Vector4[] = [];
  for (let i = 0, j = 20; i < j; i++) {
    controlPoints.push(p(Math.random() * 400 - 200, Math.random() * 400, Math.random() * 400 - 200));
    knots.push(MathUtils.clamp((i + 1) / (j - degree), 0, 1));
  }
  return { curve: new NURBSCurve(degree, knots, controlPoints), controlPoints };
}

// Degree 2 x 3 surface; the middle column's inner points are weighted 5x.
const SURFACE = new NURBSSurface(
  2,
  3,
  [0, 0, 0, 1, 1, 1],
  [0, 0, 0, 0, 1, 1, 1, 1],
  [
    [p(-200, -200, 100), p(-200, -100, -200), p(-200, 100, 250), p(-200, 200, -100)],
    [p(0, -200, 0), p(0, -100, -100, 5), p(0, 100, 150, 5), p(0, 200, 0)],
    [p(200, -200, -100), p(200, -100, 200), p(200, 100, -250), p(200, 200, 100)],
  ],
);

// Degree 2 x 3 x 1 volume: a 3 x 4 x 2 lattice whose far column narrows in z.
const VOLUME = new NURBSVolume(
  2,
  3,
  1,
  [0, 0, 0, 1, 1, 1],
  [0, 0, 0, 0, 1, 1, 1, 1],
  [0, 0, 1, 1],
  [
    [
      [p(-200, -200, -200), p(-200, -200, 200)],
      [p(-200, -100, -200), p(-200, -100, 200)],
      [p(-200, 100, -200), p(-200, 100, 200)],
      [p(-200, 200, -200), p(-200, 200, 200)],
    ],
    [
      [p(0, -200, -200), p(0, -200, 200)],
      [p(0, -100, -200), p(0, -100, 200)],
      [p(0, 100, -200), p(0, 100, 200)],
      [p(0, 200, -200), p(0, 200, 200)],
    ],
    [
      [p(200, -200, -200), p(200, -200, 200)],
      [p(200, -100, 0), p(200, -100, 100)],
      [p(200, 100, 0), p(200, 100, 100)],
      [p(200, 200, 0), p(200, 200, 100)],
    ],
  ],
);

type SurfaceFn = (u: number, v: number, target: Vector3) => void;

const surfacePoint: SurfaceFn = (u, v, target) => SURFACE.getPoint(u, v, target);

// ParametricGeometry is bivariate, so each slice pins one of the volume's three parameters.
const VOLUME_SLICES: SurfaceFn[] = [
  (u, v, target) => VOLUME.getPoint(u, v, 0, target), // front
  (u, v, target) => VOLUME.getPoint(u, v, 0.5, target), // middle
  (u, v, target) => VOLUME.getPoint(u, v, 1, target), // back
  (u, w, target) => VOLUME.getPoint(u, 1, w, target), // top
  (v, w, target) => VOLUME.getPoint(0, v, w, target), // side
];

//* Scene =========================================================

type PolylineProps = { points: { x: number; y: number; z: number }[] } & Pick<
  ThreeElements['lineBasicNodeMaterial'],
  'color' | 'opacity' | 'transparent'
>;

function Polyline({ points, ...material }: PolylineProps) {
  const positions = useMemo(() => new Float32Array(points.flatMap((v) => [v.x, v.y, v.z])), [points]);
  return (
    <threeLine>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicNodeMaterial {...material} />
    </threeLine>
  );
}

function NurbsCurveLine() {
  // A fresh random curve per mount, like the original's per-page-load one.
  const { samples, controlPoints } = useMemo(() => {
    const { curve, controlPoints } = randomCurve();
    return { samples: curve.getPoints(200), controlPoints };
  }, []);

  return (
    <group position={[0, -100, 0]}>
      <Polyline points={samples} color="#333333" />
      <Polyline points={controlPoints} color="#333333" opacity={0.25} transparent />
    </group>
  );
}

function NurbsSurfaces() {
  const map = useTexture(UV_GRID_URL);

  useLayoutEffect(() => {
    map.wrapS = map.wrapT = RepeatWrapping;
    map.anisotropy = 16;
    map.colorSpace = SRGBColorSpace;
  }, [map]);

  return (
    <>
      <mesh position={[-400, 100, 0]}>
        <parametricGeometry args={[surfacePoint, 20, 20]} />
        <meshLambertNodeMaterial map={map} side={DoubleSide} />
      </mesh>
      <group position={[400, 100, 0]} scale={0.5}>
        {VOLUME_SLICES.map((slice, i) => (
          <mesh key={i}>
            <parametricGeometry args={[slice, 20, 20]} />
            <meshLambertNodeMaterial map={map} side={DoubleSide} />
          </mesh>
        ))}
      </group>
    </>
  );
}

export default function GeometryNurbs() {
  return (
    <Canvas
      // The original never sets a tone mapping — WebGPURenderer's default is none.
      renderer={{ toneMapping: NoToneMapping }}
      background="#f0f0f0"
      camera={{ position: [0, 150, 750], fov: 50, near: 1, far: 2000 }}>
      <ambientLight color="#ffffff" />
      <directionalLight color="#ffffff" intensity={3} position={[1, 1, 1]} />
      <group position-y={50}>
        <NurbsCurveLine />
        <Suspense fallback={null}>
          <NurbsSurfaces />
        </Suspense>
      </group>
      {/* The original looks level from y = 150; the target keeps that rather than tilting at the origin. */}
      <DemoHelpers grid={false} target={[0, 150, 0]} />
    </Canvas>
  );
}

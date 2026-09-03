/**
 * modifier-subdivision
 * A deliberately coarse primitive on the left and its Loop-subdivided twin on the right.
 * Pick a shape, dial the iterations, and watch the polygon soup round off.
 * Original: https://threejs.org/examples/#webgl_modifier_subdivision
 *
 * DEMONSTRATES
 * - `LoopSubdivision.modify()` (`three-subdivide`) as a CPU pass: two `useMemo`s — the
 *   source primitive keyed on its name, the smoothed copy keyed on every subdivision
 *   knob — replace the original's dispose/reassign `updateMeshes()` bookkeeping
 * - leva's function form (`[values, set]`) writing BACK into the panel: choosing a
 *   primitive re-seeds `split`/`uvSmooth`, exactly the original's `onFinishChange`
 * - A wireframe overlay is just a second `<mesh>` sharing the SAME geometry — no
 *   `geometry.clone()` and no disposal, because nothing owns a copy
 * - `<Exhibit>` rendered twice takes DATA (a geometry and an x offset); the material
 *   knobs stay at the parent both meshes share
 */
import { useEffect, useMemo } from 'react';
import {
  BoxGeometry,
  CapsuleGeometry,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  DoubleSide,
  FrontSide,
  IcosahedronGeometry,
  LatheGeometry,
  NoToneMapping,
  OctahedronGeometry,
  PlaneGeometry,
  RepeatWrapping,
  RingGeometry,
  SphereGeometry,
  SRGBColorSpace,
  TetrahedronGeometry,
  TorusGeometry,
  TorusKnotGeometry,
  Vector2,
} from 'three/webgpu';
import { Canvas } from '@react-three/fiber/webgpu';
import type { ThreeElements } from '@react-three/fiber/webgpu';
import { useTexture } from '@react-three/drei/webgpu';
import { LoopSubdivision } from 'three-subdivide';
import { useControls } from 'leva';
import { DemoHelpers } from '../../utils/DemoHelpers';

const UV_GRID_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/uv_grid_opengl.jpg';

//* Geometry catalogue ============================================

// Low segment counts on purpose — subdivision has nothing to show on a smooth mesh.
const GEOMETRIES = {
  Box: () => new BoxGeometry(),
  Capsule: () => new CapsuleGeometry(0.5, 0.5, 3, 5),
  Circle: () => new CircleGeometry(0.6, 10),
  Cone: () => new ConeGeometry(0.6, 1.5, 5, 3),
  Cylinder: () => new CylinderGeometry(0.5, 0.5, 1, 5, 4),
  Dodecahedron: () => new DodecahedronGeometry(0.6),
  Icosahedron: () => new IcosahedronGeometry(0.6),
  Lathe: () => {
    // A sine-wave profile, revolved in 4 segments.
    const points: Vector2[] = [];
    for (let i = 0; i < 65; i += 5) {
      const x = (Math.sin(i * 0.2) * Math.sin(i * 0.1) * 15 + 50) * 1.2;
      const y = (i - 5) * 3;
      points.push(new Vector2(x * 0.0075, y * 0.005));
    }
    return new LatheGeometry(points, 4).center();
  },
  Octahedron: () => new OctahedronGeometry(0.7),
  Plane: () => new PlaneGeometry(),
  Ring: () => new RingGeometry(0.3, 0.6, 10),
  Sphere: () => new SphereGeometry(0.6, 8, 4),
  Tetrahedron: () => new TetrahedronGeometry(0.8),
  Torus: () => new TorusGeometry(0.48, 0.24, 4, 6),
  TorusKnot: () => new TorusKnotGeometry(0.38, 0.18, 20, 4),
};
type GeometryName = keyof typeof GEOMETRIES;

// Open surfaces need both faces drawn.
const OPEN_SURFACES: GeometryName[] = ['Circle', 'Lathe', 'Plane', 'Ring'];

//* Scene =========================================================

type ExhibitProps = Pick<ThreeElements['mesh'], 'geometry'> & {
  x: number;
  wireframe: boolean;
  material: Pick<
    ThreeElements['meshStandardNodeMaterial'],
    'color' | 'map' | 'flatShading' | 'side' | 'polygonOffset' | 'polygonOffsetFactor' | 'polygonOffsetUnits'
  >;
};

function Exhibit({ geometry, x, wireframe, material }: ExhibitProps) {
  return (
    <group position-x={x}>
      <mesh geometry={geometry}>
        <meshStandardNodeMaterial {...material} />
      </mesh>
      <mesh geometry={geometry} visible={wireframe}>
        <meshBasicNodeMaterial color="#ffffff" wireframe />
      </mesh>
    </group>
  );
}

function SubdividedPair() {
  const [{ geometry: name, iterations, ...subdivision }, set] = useControls('Subdivide Params', () => ({
    geometry: { value: 'Box' as GeometryName, options: Object.keys(GEOMETRIES) as GeometryName[] },
    iterations: { value: 3, min: 0, max: 5, step: 1 },
    split: true,
    uvSmooth: false,
    preserveEdges: false,
    flatOnly: false,
    maxTriangles: 25000,
  }));
  const { flatShading, textured, wireframe } = useControls('Material', {
    flatShading: false,
    textured: true,
    wireframe: false,
  });

  // Each primitive has a sensible split/uvSmooth pairing; picking one writes it back
  // into the panel (event-shaped, so leva's function form is the right tool).
  useEffect(() => {
    set({
      split: name === 'Box' || name === 'Ring' || name === 'Plane',
      uvSmooth: name === 'Circle' || name === 'Plane' || name === 'Ring',
    });
  }, [name, set]);

  const map = useTexture(UV_GRID_URL);
  useEffect(() => {
    map.wrapS = map.wrapT = RepeatWrapping;
    map.colorSpace = SRGBColorSpace;
  }, [map]);

  const geometry = useMemo(() => GEOMETRIES[name](), [name]);
  // A new BufferGeometry per knob change — `useMemo` on the inputs is exactly right for
  // a runtime instance that has to be rebuilt rather than updated.
  const smoothGeometry = useMemo(
    () => LoopSubdivision.modify(geometry, iterations, subdivision),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `subdivision` is a fresh object each render; its five fields are the real inputs
    [geometry, iterations, ...Object.values(subdivision)],
  );

  const material: ExhibitProps['material'] = {
    color: textured ? '#ffffff' : '#808080',
    map: textured ? map : null,
    flatShading,
    side: OPEN_SURFACES.includes(name) ? DoubleSide : FrontSide,
    // Pushes the surface back so the wireframe overlay wins the depth test.
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  };

  return (
    <>
      <Exhibit geometry={geometry} x={-0.7} wireframe={wireframe} material={material} />
      <Exhibit geometry={smoothGeometry} x={0.7} wireframe={wireframe} material={material} />
    </>
  );
}

export default function ModifierSubdivision() {
  return (
    <Canvas renderer={{ toneMapping: NoToneMapping }} camera={{ position: [0, 0.7, 2.1], fov: 75 }}>
      <hemisphereLight color="#ffffff" groundColor="#737373" intensity={3} />
      <directionalLight position={[0, 1, 1]} intensity={1.5} />
      <directionalLight position={[0, 1, -1]} intensity={1.5} />
      <SubdividedPair />
      {/* Grid off: both shapes are centred on the origin. */}
      <DemoHelpers grid={false} minDistance={1} />
    </Canvas>
  );
}

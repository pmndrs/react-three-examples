/**
 * geometry-convex
 * The convex hull of a dodecahedron's twenty corners — the points drawn as sprites, the
 * hull as a translucent shell — turning slowly over an axes helper.
 * Original: https://threejs.org/examples/#webgl_geometry_convex
 *
 * DEMONSTRATES
 * - `<convexGeometry args={[points]}>` — three's QuickHull addon, registered once via
 *   `extend()` and used as a plain element
 * - Sized, textured points on WebGPU: `<sprite count>` + `<pointsNodeMaterial map alphaTest>`,
 *   with a `uniformArray` of the vertices as its `positionNode` — a `Points` object would
 *   draw fixed 1px dots, because WebGPU point primitives have no size
 * - Deriving the point set from a stock geometry: delete `normal`/`uv`, then
 *   `mergeVertices` folds the 36 face corners back into 20 unique vertices
 * - A point light mounted as a child of the camera — the declarative `camera.add(light)`
 *
 * DIVERGENCE from original
 * - The original's `Points` + `PointsMaterial` is an instanced `Sprite` here (see above);
 *   same size, map and alpha cut-out
 */
import { Suspense, useLayoutEffect, useRef } from 'react';
import { instanceIndex, uniformArray } from 'three/tsl';
import { DodecahedronGeometry, DoubleSide, NoToneMapping, SRGBColorSpace, Vector3 } from 'three/webgpu';
import type { BufferGeometry, Group } from 'three/webgpu';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Canvas, useFrame, useNodes } from '@react-three/fiber/webgpu';
import { PerspectiveCamera, useTexture } from '@react-three/drei/webgpu';
import '../../assets/ConvexGeometry';
import { DemoHelpers } from '../../utils/DemoHelpers';

const DISC_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/sprites/disc.png';

// Without stripping normal/uv first, mergeVertices() cannot fold corners that carry
// different per-face data — this is what turns 36 face corners into 20 vertices.
function dodecahedronVertices() {
  let geometry: BufferGeometry = new DodecahedronGeometry(10);
  geometry.deleteAttribute('normal');
  geometry.deleteAttribute('uv');
  geometry = mergeVertices(geometry);
  const position = geometry.getAttribute('position');
  return Array.from({ length: position.count }, (_, i) => new Vector3().fromBufferAttribute(position, i));
}

const VERTICES = dodecahedronVertices();

function ConvexHull() {
  const groupRef = useRef<Group>(null);
  const disc = useTexture(DISC_URL);

  useLayoutEffect(() => {
    disc.colorSpace = SRGBColorSpace;
  }, [disc]);

  // One sprite quad per vertex, each instance centred on its entry in the array.
  const { pointPosition } = useNodes(() => ({
    pointPosition: uniformArray<'vec3'>(VERTICES).element(instanceIndex),
  }));

  // Original: += 0.005 per frame; scaled by delta so it is frame-rate independent.
  useFrame(({ delta }) => {
    if (groupRef.current) groupRef.current.rotation.y += 0.3 * delta;
  });

  return (
    <group ref={groupRef}>
      <sprite count={VERTICES.length} frustumCulled={false}>
        <pointsNodeMaterial positionNode={pointPosition} color="#0080ff" map={disc} size={1} alphaTest={0.5} />
      </sprite>
      <mesh>
        <convexGeometry args={[VERTICES]} />
        <meshLambertNodeMaterial color="#ffffff" opacity={0.5} side={DoubleSide} transparent />
      </mesh>
    </group>
  );
}

export default function GeometryConvex() {
  return (
    // The original never sets a tone mapping — WebGPURenderer's default is none.
    <Canvas renderer={{ toneMapping: NoToneMapping }}>
      {/* The child light is the declarative form of the original's camera.add(light). */}
      <PerspectiveCamera makeDefault position={[15, 20, 30]} fov={40} near={1} far={1000}>
        <pointLight color="#ffffff" intensity={3} decay={0} />
      </PerspectiveCamera>
      <ambientLight color="#666666" />
      <axesHelper args={[20]} />
      <Suspense fallback={null}>
        <ConvexHull />
      </Suspense>
      {/* Grid off: the hull is centred on the origin and would be sliced by it. */}
      <DemoHelpers grid={false} minDistance={20} maxDistance={50} maxPolarAngle={Math.PI / 2} />
    </Canvas>
  );
}

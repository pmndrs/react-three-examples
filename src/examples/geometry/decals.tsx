/**
 * decals
 * Click the head to splat a decal on it: each one is a `DecalGeometry` projected onto the
 * surface at the hit point, aimed along the surface normal.
 * Original: https://threejs.org/examples/#webgl_decals
 *
 * DEMONSTRATES
 * - `onPointerMove`/`onClick` on the mesh ARE the hit test: fiber hands over the world
 *   point and face normal, so the original's `Raycaster`, NDC mouse math and `moved` flag
 *   all go — fiber already drops a click that dragged the camera
 * - drei `<Decal>` as a child of the mesh: give it a position/rotation/scale in the head's
 *   local space and it builds the `DecalGeometry`. Decals are React state, so `clear` is
 *   `setDecals([])` rather than a remove loop
 * - A material per decal with a random `color`, `polygonOffset`, `depthWrite={false}` and
 *   an increasing `renderOrder` so overlapping splats layer predictably
 * - `useGLTF` for the head geometry, its Phong material declared in JSX from `useTexture` maps
 */
import { Suspense, useLayoutEffect, useRef, useState } from 'react';
import { Color, Matrix3, NoToneMapping, Object3D, SRGBColorSpace } from 'three/webgpu';
import type { Euler, Line, Mesh, Vector3 } from 'three/webgpu';
import { Canvas, type ThreeEvent } from '@react-three/fiber/webgpu';
import { Decal, useGLTF, useTexture } from '@react-three/drei/webgpu';
import { button, useControls } from 'leva';
import '../../assets/ThreeLine';
import { DemoHelpers } from '../../utils/DemoHelpers';

const ASSETS = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/';
const HEAD_URL = `${ASSETS}models/gltf/LeePerrySmith/`;
const HEAD_SCALE = 10;

type DecalData = { position: Vector3; rotation: Euler; scale: number; color: Color };

// Decals must not catch the pointer, or a click on one would project from its surface
// instead of the head's (the original raycasts the head only).
const noRaycast = () => null;

function Head() {
  const [decals, setDecals] = useState<DecalData[]>([]);
  const { minScale, maxScale, rotate } = useControls('decals', {
    minScale: { value: 10, min: 1, max: 30 },
    maxScale: { value: 20, min: 1, max: 30 },
    rotate: true,
    clear: button(() => setDecals([])),
  });
  const { meshes } = useGLTF(`${HEAD_URL}LeePerrySmith.glb`);
  const { map, specularMap, normalMap, decalDiffuse, decalNormal } = useTexture({
    map: `${HEAD_URL}Map-COL.jpg`,
    specularMap: `${HEAD_URL}Map-SPEC.jpg`,
    normalMap: `${HEAD_URL}Infinite-Level_02_Tangent_SmoothUV.jpg`,
    decalDiffuse: `${ASSETS}textures/decal/decal-diffuse.png`,
    decalNormal: `${ASSETS}textures/decal/decal-normal.jpg`,
  });
  const meshRef = useRef<Mesh>(null);
  const lineRef = useRef<Line>(null);
  // Orientation scratch: the original's invisible `mouseHelper` box, minus the box.
  const [helper] = useState(() => new Object3D());
  const [linePositions] = useState(() => new Float32Array(6));

  useLayoutEffect(() => {
    map.colorSpace = SRGBColorSpace;
    decalDiffuse.colorSpace = SRGBColorSpace;
  }, [map, decalDiffuse]);

  // Sit the helper on the hit point looking along the world-space normal — its rotation is
  // the decal orientation — and stretch the marker line out along that normal.
  const aim = ({ point, face, object }: ThreeEvent<MouseEvent>) => {
    if (!face || !lineRef.current) return;
    const normalMatrix = new Matrix3().getNormalMatrix(object.matrixWorld);
    const tip = face.normal.clone().applyNormalMatrix(normalMatrix).multiplyScalar(10).add(point);
    helper.position.copy(point);
    helper.lookAt(tip);

    const positions = lineRef.current.geometry.attributes.position;
    positions.setXYZ(0, point.x, point.y, point.z);
    positions.setXYZ(1, tip.x, tip.y, tip.z);
    positions.needsUpdate = true;
  };

  const shoot = (event: ThreeEvent<MouseEvent>) => {
    const mesh = meshRef.current;
    if (!event.face || !mesh) return;
    aim(event);

    const rotation = helper.rotation.clone();
    if (rotate) rotation.z = Math.random() * 2 * Math.PI;
    const size = minScale + Math.random() * (maxScale - minScale);

    // <Decal> projects in the head's local frame: world point and size over the head's scale.
    setDecals((list) => [
      ...list,
      {
        position: mesh.worldToLocal(event.point.clone()),
        rotation,
        scale: size / HEAD_SCALE,
        color: new Color(Math.random() * 0xffffff),
      },
    ]);
  };

  return (
    <>
      <mesh
        ref={meshRef}
        geometry={meshes.LeePerrySmith.geometry}
        scale={HEAD_SCALE}
        onPointerMove={aim}
        onClick={shoot}>
        <meshPhongNodeMaterial
          specular="#111111"
          map={map}
          specularMap={specularMap}
          normalMap={normalMap}
          shininess={25}
        />
        {decals.map(({ position, rotation, scale, color }, i) => (
          <Decal
            key={i}
            position={position}
            rotation={rotation}
            scale={scale}
            renderOrder={i}
            depthTest
            polygonOffsetFactor={-4}
            raycast={noRaycast}>
            <meshPhongNodeMaterial
              color={color}
              specular="#444444"
              map={decalDiffuse}
              normalMap={decalNormal}
              normalScale={[1, 1]}
              shininess={30}
              transparent
              depthWrite={false}
            />
          </Decal>
        ))}
      </mesh>
      {/* The surface normal under the pointer, in world space — so a sibling, not a child. */}
      <threeLine ref={lineRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[linePositions, 3]} />
        </bufferGeometry>
        <lineBasicNodeMaterial />
      </threeLine>
    </>
  );
}

export default function Decals() {
  return (
    <Canvas
      // The original never sets a tone mapping — WebGPURenderer's default is none.
      renderer={{ toneMapping: NoToneMapping }}
      background="#000000"
      camera={{ position: [0, 0, 120], fov: 45, near: 1, far: 1000 }}>
      <ambientLight color="#666666" />
      <directionalLight color="#ffddcc" intensity={3} position={[1, 0.75, 0.5]} />
      <directionalLight color="#ccccff" intensity={3} position={[-1, 0.75, -0.5]} />
      <Suspense fallback={null}>
        <Head />
      </Suspense>
      {/* Grid off: the head is centred on the origin and would be sliced by it. */}
      <DemoHelpers grid={false} minDistance={50} maxDistance={200} />
    </Canvas>
  );
}

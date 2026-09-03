/**
 * raycaster-bvh
 * Up to 3000 rays fire at a slowly turning Stanford bunny every frame, each drawn as a
 * line from its origin to the hit point. three-mesh-bvh's bounds tree is what keeps
 * that many CPU raycasts against ~70k triangles running at frame rate — toggle it off
 * and watch the frame time.
 * Original: https://threejs.org/examples/#webgl_raycaster_bvh
 *
 * DEMONSTRATES
 * - `raycast={acceleratedRaycast}` on the mesh: three-mesh-bvh installed per INSTANCE
 *   through fiber's `raycast` prop (drei's `meshBounds` idiom) instead of the
 *   original's `Mesh.prototype.raycast = …` patch, which would leak into every other
 *   example in this SPA. `useBVH` off swaps three's brute-force triangle walk back in
 * - `new MeshBVH(geometry)` stored on `geometry.boundsTree`, computed once on a CLONE
 *   of the Suspense-cached FBX geometry (the `translate` must not compound on remount)
 * - `<bVHHelper>` as a registered JSX element (`src/assets/BVHHelper.ts`); its `args`
 *   take the mesh instance, which is why the bunny mesh is mirrored into state
 * - Per-frame ray + line bookkeeping kept imperative in `useFrame` — 3000 `setMatrixAt`
 *   / `setXYZ` calls a frame ARE the demo, not something to make declarative
 */
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { DynamicDrawUsage, Matrix4, Mesh, NoToneMapping, Quaternion, Raycaster, Vector3 } from 'three/webgpu';
import type { InstancedMesh, LineSegments } from 'three/webgpu';
import { Canvas, useFrame } from '@react-three/fiber/webgpu';
import { useFBX } from '@react-three/drei/webgpu';
import { acceleratedRaycast, MeshBVH, type BVHHelper } from 'three-mesh-bvh';
import { folder, useControls } from 'leva';
import '../../assets/BVHHelper';
import { DemoHelpers } from '../../utils/DemoHelpers';

const BUNNY_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/fbx/stanford-bunny.fbx';
const BUNNY_SCALE = 0.0075;
const MAX_RAYS = 3000;
const RAY_COLOR = '#444444';

// Scratch objects for the per-frame loop — no allocation inside it.
const _position = new Vector3();
const _quaternion = new Quaternion();
const _scale = new Vector3(1, 1, 1);
const _matrix = new Matrix4();
const _axis = new Vector3();
const _origin = new Vector3();

//* Rays ==========================================================

interface RayFieldProps {
  /** What the rays are cast against; null until the bunny has loaded. */
  target: Mesh | null;
}

function RayField({ target }: RayFieldProps) {
  const { count, firstHitOnly } = useControls('Raycasting', {
    count: { value: 150, min: 1, max: MAX_RAYS, step: 1 },
    firstHitOnly: true,
  });
  const spheresRef = useRef<InstancedMesh>(null);
  const linesRef = useRef<LineSegments>(null);
  const [raycaster] = useState(() => new Raycaster());
  const [linePositions] = useState(() => new Float32Array(MAX_RAYS * 2 * 3));

  // Ray origins scattered on a sphere of radius 3.75, laid out once. Every ray owns
  // two instances: its origin marker (2i) and its hit marker (2i + 1).
  useLayoutEffect(() => {
    const spheres = spheresRef.current;
    if (!spheres) return;
    spheres.instanceMatrix.setUsage(DynamicDrawUsage);
    for (let i = 0; i < MAX_RAYS * 2; i++) {
      _position.randomDirection().multiplyScalar(3.75);
      spheres.setMatrixAt(i, _matrix.compose(_position, _quaternion, _scale.setScalar(1)));
    }
  }, []);

  useFrame(({ elapsed }) => {
    const spheres = spheresRef.current;
    const lines = linesRef.current;
    if (!target || !spheres || !lines) return;

    raycaster.firstHitOnly = firstHitOnly;
    const position = lines.geometry.attributes.position;
    const offset = elapsed * 0.1;
    let lineNum = 0;

    for (let i = 0; i < count; i++) {
      // Nudge this ray's origin around the bunny on its own axis.
      spheres.getMatrixAt(i * 2, _matrix);
      _matrix.decompose(_position, _quaternion, _scale);
      _axis.set(Math.sin(i * 100 + offset), Math.cos(-i * 10 + offset), Math.sin(i + offset)).normalize();
      _position.applyAxisAngle(_axis, 0.001);
      spheres.setMatrixAt(i * 2, _matrix.compose(_position, _quaternion, _scale.setScalar(0.02)));

      // Cast it at the origin.
      raycaster.ray.origin.copy(_position);
      raycaster.ray.direction.copy(_position).negate().normalize();
      const hit = raycaster.intersectObject(target)[0];

      // Hit marker + line: on a miss the marker hides inside the origin sphere and the
      // line runs to the centre, as in the original.
      const point = hit ? hit.point : _origin;
      if (hit) spheres.setMatrixAt(i * 2 + 1, _matrix.compose(point, _quaternion, _scale.setScalar(0.01)));
      else spheres.setMatrixAt(i * 2 + 1, _matrix);
      position.setXYZ(lineNum++, _position.x, _position.y, _position.z);
      position.setXYZ(lineNum++, point.x, point.y, point.z);
    }

    spheres.count = count * 2;
    spheres.instanceMatrix.needsUpdate = true;
    lines.geometry.setDrawRange(0, lineNum);
    position.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh ref={spheresRef} args={[undefined, undefined, MAX_RAYS * 2]} count={0}>
        <sphereGeometry />
        <meshBasicNodeMaterial color={RAY_COLOR} />
      </instancedMesh>
      <lineSegments ref={linesRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[linePositions, 3]} />
        </bufferGeometry>
        <lineBasicNodeMaterial color={RAY_COLOR} transparent opacity={0.25} depthWrite={false} />
      </lineSegments>
    </>
  );
}

//* Bunny =========================================================

function Bunny() {
  const fbx = useFBX(BUNNY_URL);
  const source = fbx.children[0] as Mesh;
  const [bunny, setBunny] = useState<Mesh | null>(null);
  const helperRef = useRef<BVHHelper>(null);

  const { useBVH, displayHelper, helperDepth } = useControls({
    Raycasting: folder({ useBVH: true }),
    'BVH Helper': folder({ displayHelper: false, helperDepth: { value: 10, min: 1, max: 20, step: 1 } }),
  });

  // Clone before the translate — the loader caches this geometry across remounts.
  const { geometry, bvh } = useMemo(() => {
    const geometry = source.geometry.clone();
    geometry.translate(0, 0.5 / BUNNY_SCALE, 0);
    const bvh = new MeshBVH(geometry);
    geometry.boundsTree = bvh;
    return { geometry, bvh };
  }, [source]);

  // `args` remount the helper when the depth changes; either way it needs one build.
  useLayoutEffect(() => helperRef.current?.update(), [bunny, helperDepth]);

  useFrame(() => {
    if (!bunny) return;
    bunny.rotation.y += 0.002;
    bunny.updateMatrixWorld();
  });

  return (
    <>
      <mesh
        ref={setBunny}
        geometry={geometry}
        material={source.material}
        scale={BUNNY_SCALE}
        raycast={useBVH ? acceleratedRaycast : Mesh.prototype.raycast}
      />
      {bunny && <bVHHelper ref={helperRef} args={[bunny, bvh, helperDepth]} color="#e91e63" visible={displayHelper} />}
      <RayField target={bunny} />
    </>
  );
}

export default function RaycasterBvh() {
  return (
    <Canvas
      renderer={{ toneMapping: NoToneMapping }}
      background="#eeeeee"
      camera={{ position: [0, 0, 10], fov: 50, near: 1, far: 100 }}>
      <hemisphereLight args={['#ffffff', '#999999', 3]} />
      <Bunny />
      <DemoHelpers grid={false} minDistance={5} maxDistance={75} />
    </Canvas>
  );
}

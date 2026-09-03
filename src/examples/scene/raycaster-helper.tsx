/**
 * raycaster-helper
 * Three capsules bob through a fixed ray. The helper draws the ray — origin dot, near and
 * far markers, the segment between them — and a white dot at every hit; the origin turns
 * green while anything is hit.
 * Original: https://threejs.org/examples/#misc_raycaster_helper
 *
 * DEMONSTRATES
 * - A helper as a component: the original imports gsimone's `RaycasterHelper` class from
 *   a CDN; here the same drawing is `<RaycasterHelper raycaster targets>` — plain JSX for
 *   the static parts, one `useFrame` for the hits
 * - `quaternion={…}` from `setFromUnitVectors` to face the marker squares down the ray
 * - `<instancedMesh>` for the hit dots: up to twenty, laid out per frame with
 *   `setMatrixAt`, unused ones scaled to zero — the original helper's own technique
 * - `<threeLine>` (fiber's name for `THREE.Line`) with a `bufferGeometry` built from points
 *
 * DIVERGENCE from original
 * - The helper is re-drawn here rather than imported: `@gsimone/three-raycaster-helper`
 *   is an ordinary library the original hotlinks, and this repo does not load code from
 *   CDNs (AGENTS.md § Repo format)
 */
import { useRef, useState } from 'react';
import { DoubleSide, NoToneMapping, Object3D, Quaternion, Raycaster, Vector3 } from 'three/webgpu';
import type { InstancedMesh, Mesh, MeshBasicNodeMaterial } from 'three/webgpu';
import { Canvas, useFrame } from '@react-three/fiber/webgpu';
import '../../assets/ThreeLine';
import { DemoHelpers } from '../../utils/DemoHelpers';

const MAX_HITS = 20;
const MARKER = 0.1; // half-size of the near/far squares
// A closed square in the XY plane, oriented down the ray per marker.
const SQUARE = [
  [-1, 1],
  [1, 1],
  [1, -1],
  [-1, -1],
  [-1, 1],
];
const square = new Float32Array(SQUARE.flatMap(([x, y]) => [x * MARKER, y * MARKER, 0]));

const dummy = new Object3D();

//* Helper ========================================================

interface RaycasterHelperProps {
  raycaster: Raycaster;
  /** What the ray is tested against each frame. */
  targets: React.RefObject<(Mesh | null)[]>;
}

function RaycasterHelper({ raycaster, targets }: RaycasterHelperProps) {
  const { origin, direction } = raycaster.ray;
  const near = origin.clone().addScaledVector(direction, raycaster.near);
  const far = origin.clone().addScaledVector(direction, raycaster.far);
  const facing = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), direction);

  const originRef = useRef<MeshBasicNodeMaterial>(null);
  const hitsRef = useRef<InstancedMesh>(null);

  useFrame(() => {
    const hits = raycaster.intersectObjects(targets.current.filter((mesh) => mesh !== null));
    const dots = hitsRef.current;
    if (!dots) return;
    for (let i = 0; i < MAX_HITS; i++) {
      const hit = hits[i];
      if (hit) dummy.position.copy(hit.point);
      dummy.scale.setScalar(hit ? 1 : 0);
      dummy.updateMatrix();
      dots.setMatrixAt(i, dummy.matrix);
    }
    dots.instanceMatrix.needsUpdate = true;
    originRef.current?.color.set(hits.length > 0 ? '#0eec82' : '#ff005b');
  });

  const segment = (from: Vector3, to: Vector3) => new Float32Array([...from.toArray(), ...to.toArray()]);

  return (
    <group>
      <threeLine>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[segment(origin, near), 3]} />
        </bufferGeometry>
        <lineBasicNodeMaterial color="#333333" />
      </threeLine>
      <threeLine>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[segment(near, far), 3]} />
        </bufferGeometry>
        <lineBasicNodeMaterial color="#ffffff" />
      </threeLine>
      {[near, far].map((point, i) => (
        <threeLine key={i} position={point} quaternion={facing}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[square, 3]} />
          </bufferGeometry>
          <lineBasicNodeMaterial color="#ffffff" />
        </threeLine>
      ))}
      <mesh position={origin}>
        <sphereGeometry args={[0.04, 32]} />
        <meshBasicNodeMaterial ref={originRef} />
      </mesh>
      <instancedMesh ref={hitsRef} args={[undefined, undefined, MAX_HITS]} frustumCulled={false}>
        <sphereGeometry args={[0.04]} />
        <meshBasicNodeMaterial />
      </instancedMesh>
    </group>
  );
}

//* Scene =========================================================

const CAPSULE_X = [-2, 0, 2];

function Capsules() {
  const capsuleRefs = useRef<(Mesh | null)[]>([]);
  const [raycaster] = useState(() => new Raycaster(new Vector3(-4, 0, 0), new Vector3(1, 0, 0), 1, 8));

  useFrame(({ elapsed }) => {
    capsuleRefs.current.forEach((capsule) => {
      if (!capsule) return;
      capsule.position.y = Math.sin(elapsed * 0.5 + capsule.position.x);
      capsule.rotation.z = Math.sin(elapsed * 0.5) * Math.PI;
    });
  });

  return (
    <>
      {CAPSULE_X.map((x, i) => (
        <mesh
          key={x}
          ref={(mesh) => {
            capsuleRefs.current[i] = mesh;
          }}
          position-x={x}>
          <capsuleGeometry args={[0.5, 0.5, 4, 32]} />
          <meshNormalNodeMaterial side={DoubleSide} />
        </mesh>
      ))}
      <RaycasterHelper raycaster={raycaster} targets={capsuleRefs} />
    </>
  );
}

export default function RaycasterHelperExample() {
  return (
    <Canvas
      // The original never sets a tone mapping — the renderer default is none.
      renderer={{ toneMapping: NoToneMapping }}
      background="#000000"
      camera={{ position: [0, 0, 10], fov: 70, near: 1, far: 1000 }}>
      <Capsules />
      {/* Grid off: the capsules swing through y = 0 and the helper's lines sit on it. */}
      <DemoHelpers grid={false} />
    </Canvas>
  );
}

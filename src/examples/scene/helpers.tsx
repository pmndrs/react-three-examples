/**
 * helpers
 * A head model dressed in every debug helper three.js ships: vertex normals and tangents,
 * bounding boxes at three levels of the hierarchy, a wireframe and an edges copy, a
 * point-light gizmo, and two ground grids — with the camera and the light both orbiting.
 * Original: https://threejs.org/examples/#webgl_helpers
 *
 * DEMONSTRATES
 * - drei `<Helper type={…} args={[…]}>` as a CHILD of the object it describes: it finds
 *   its parent, builds the helper, adds it at the scene root and calls `update()` every
 *   frame — the original's `vnh`/`vth` module variables and their `animate()` updates
 *   are gone
 * - `useHelper(ref, BoxHelper)` for the one helper whose subject is the scene itself
 * - `<gridHelper>` / `<polarGridHelper>` as intrinsics, `<wireframeGeometry>` /
 *   `<edgesGeometry>` taking the model's geometry as `args`
 * - A `<pointLight>` moved from `useFrame` with its `<Helper>` following for free
 */
import { Suspense, useMemo, useRef } from 'react';
import { BoxHelper, NoToneMapping, PointLightHelper } from 'three/webgpu';
import type { Mesh, PointLight } from 'three/webgpu';
import { VertexNormalsHelper } from 'three/addons/helpers/VertexNormalsHelper.js';
import { VertexTangentsHelper } from 'three/addons/helpers/VertexTangentsHelper.js';
import { Canvas, useFrame, useThree } from '@react-three/fiber/webgpu';
import { Helper, useGLTF, useHelper } from '@react-three/drei/webgpu';
import { DemoHelpers } from '../../utils/DemoHelpers';

const HEAD_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/LeePerrySmith/LeePerrySmith.glb';

//* Model =========================================================

function Head() {
  const { nodes } = useGLTF(HEAD_URL);
  const head = nodes.LeePerrySmith as Mesh;

  // Tangents for the tangents helper (the original notes the model's degenerate UVs make
  // them noisy). Recomputing on a cached geometry is idempotent, so a memo is safe here.
  const geometry = useMemo(() => {
    head.geometry.computeTangents();
    return head.geometry;
  }, [head]);

  return (
    <group scale={50}>
      <mesh geometry={geometry} material={head.material}>
        <Helper type={VertexNormalsHelper} args={[5]} />
        <Helper type={VertexTangentsHelper} args={[5]} />
        <Helper type={BoxHelper} />
      </mesh>

      <lineSegments position-x={4}>
        <wireframeGeometry args={[geometry]} />
        <lineBasicNodeMaterial depthTest={false} opacity={0.25} transparent />
        <Helper type={BoxHelper} />
      </lineSegments>

      <lineSegments position-x={-4}>
        <edgesGeometry args={[geometry]} />
        <lineBasicNodeMaterial depthTest={false} opacity={0.25} transparent />
        <Helper type={BoxHelper} />
      </lineSegments>

      <Helper type={BoxHelper} />
    </group>
  );
}

//* Scene =========================================================

function OrbitingLight() {
  const lightRef = useRef<PointLight>(null);

  useFrame(({ elapsed }) => {
    const time = -elapsed * 0.3;
    lightRef.current?.position.set(Math.sin(time * 1.7) * 300, Math.cos(time * 1.5) * 400, Math.cos(time * 1.3) * 300);
  });

  return (
    <pointLight ref={lightRef} position={[200, 100, 150]}>
      <Helper type={PointLightHelper} args={[15]} />
    </pointLight>
  );
}

function OrbitingCamera() {
  useFrame(({ camera, elapsed }) => {
    const time = -elapsed * 0.3;
    camera.position.set(400 * Math.cos(time), camera.position.y, 400 * Math.sin(time));
    camera.lookAt(0, 0, 0);
  });
  return null;
}

// The outermost box: the whole scene, helpers included — as the original's last line.
function SceneBoxHelper() {
  const sceneRef = useRef(useThree((state) => state.scene));
  useHelper(sceneRef, BoxHelper);
  return null;
}

export default function Helpers() {
  return (
    <Canvas
      // The original never sets a tone mapping — the renderer default is none.
      renderer={{ toneMapping: NoToneMapping }}
      background="#000000"
      camera={{ position: [0, 0, 400], fov: 70, near: 1, far: 1000 }}>
      <OrbitingLight />
      <gridHelper args={[400, 40, '#0000ff', '#808080']} position={[-150, -150, 0]} />
      <polarGridHelper args={[200, 16, 8, 64, '#0000ff', '#808080']} position={[200, -150, 0]} />
      <Suspense fallback={null}>
        <Head />
        <SceneBoxHelper />
      </Suspense>
      <OrbitingCamera />
      {/* The camera is driven from useFrame, so the baseline orbit is off; the original's
          own two grids replace the baseline grid. */}
      <DemoHelpers grid={false} controls={false} />
    </Canvas>
  );
}

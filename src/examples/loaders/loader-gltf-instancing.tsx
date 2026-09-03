/**
 * loader-gltf-instancing
 * A field of Damaged Helmets from ONE mesh: the glTF carries `EXT_mesh_gpu_instancing`, so
 * `GLTFLoader` hands back an `InstancedMesh` with the per-instance transforms already
 * uploaded — one draw call, no scene-graph duplicates.
 * Original: https://threejs.org/examples/#webgl_loader_gltf_instancing
 *
 * DEMONSTRATES
 * - An extension the loader resolves on its own: nothing to register — the file's
 *   translation / rotation / scale accessors become `instanceMatrix`, so the same
 *   `useGLTF(url).scene` that every other loader example renders is already the
 *   instanced draw, one mesh standing in for the whole field of helmets
 * - An UltraHDR (`.hdr.jpg`) environment through `useLoader(UltraHDRLoader, …)`, set as
 *   both `scene.environment` and `scene.background` in a layout effect — drei's
 *   `<Environment>` can't select that loader (UPSTREAM B13; same pattern as
 *   `postprocessing-dof-basic`)
 */
import { Suspense, useLayoutEffect } from 'react';
import { ACESFilmicToneMapping, EquirectangularReflectionMapping } from 'three/webgpu';
import { UltraHDRLoader } from 'three/addons/loaders/UltraHDRLoader.js';
import { Canvas, useLoader, useThree } from '@react-three/fiber/webgpu';
import { useGLTF } from '@react-three/drei/webgpu';
import { DemoHelpers } from '../../utils/DemoHelpers';

const MODEL_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/DamagedHelmet/glTF-instancing/DamagedHelmetGpuInstancing.gltf';
const HDR_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/equirectangular/royal_esplanade_2k.hdr.jpg';

function EsplanadeEnvironment() {
  const scene = useThree((s) => s.scene);
  const envMap = useLoader(UltraHDRLoader, HDR_URL);

  // `.mapping` is read when the shader graph builds on the first render, so it has to
  // land before that — layout effect, not passive.
  useLayoutEffect(() => {
    envMap.mapping = EquirectangularReflectionMapping;
    scene.background = envMap;
    scene.environment = envMap;
    return () => {
      scene.background = null;
      scene.environment = null;
    };
  }, [scene, envMap]);

  return null;
}

function InstancedHelmets() {
  const { scene } = useGLTF(MODEL_URL);
  return <primitive object={scene} />;
}

export default function LoaderGltfInstancing() {
  return (
    <Canvas
      renderer={{ toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1 }}
      camera={{ position: [-0.9, 0.41, -0.89], fov: 45, near: 0.25, far: 20 }}>
      <Suspense fallback={null}>
        <EsplanadeEnvironment />
        <InstancedHelmets />
      </Suspense>
      {/* Grid off: the HDR backdrop fills the frame. */}
      <DemoHelpers grid={false} target={[0, 0.25, 0]} minDistance={0.2} maxDistance={10} />
    </Canvas>
  );
}

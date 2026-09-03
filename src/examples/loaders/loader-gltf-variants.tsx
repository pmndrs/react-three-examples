/**
 * loader-gltf-variants
 * One shoe, three looks. The glTF declares `KHR_materials_variants` (midnight / beach /
 * street) and a leva dropdown swaps every mesh's material by asking the loader's parser
 * for the variant's material.
 * Original: https://threejs.org/examples/#webgl_loader_gltf_variants
 *
 * DEMONSTRATES
 * - Reading an extension straight off `useGLTF`'s result: `gltf.userData.gltfExtensions`
 *   lists the variant names, so the leva `options` come from the FILE, not a hard-coded list
 * - `parser.getDependency('material', index)` + `parser.assignFinalMaterial(mesh)` — the
 *   loader's own material cache does the swap; nothing is constructed by hand
 * - The switch is one `useEffect` keyed on the leva value, remembering each mesh's
 *   untouched material in `userData` exactly as the original does
 * - drei `<Environment files background>` for the quarry HDR (IBL and backdrop in one line)
 */
import { Suspense, useEffect } from 'react';
import { ACESFilmicToneMapping, Mesh } from 'three/webgpu';
import { Canvas } from '@react-three/fiber/webgpu';
import { Environment, useGLTF } from '@react-three/drei/webgpu';
import { useControls } from 'leva';
import { DemoHelpers } from '../../utils/DemoHelpers';

const MODEL_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/MaterialsVariantsShoe/glTF/MaterialsVariantsShoe.gltf';
const HDR_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/equirectangular/quarry_01_1k.hdr';

// What GLTFLoader leaves in `userData.gltfExtensions` for this extension — the root lists
// the variants, each mesh maps variant indices to material indices.
// https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_materials_variants
interface VariantsExtension {
  variants: { name: string }[];
}
interface MeshVariantsExtension {
  mappings: { material: number; variants: number[] }[];
}

function Shoe() {
  const { scene, parser, userData } = useGLTF(MODEL_URL);
  const extension = userData.gltfExtensions.KHR_materials_variants as VariantsExtension;
  const variants = extension.variants.map((v) => v.name);
  const { variant } = useControls('Variants', { variant: { value: variants[0], options: variants } });

  useEffect(() => {
    const variantIndex = extension.variants.findIndex((v) => v.name === variant);
    scene.traverse(async (object) => {
      if (!(object instanceof Mesh) || !object.userData.gltfExtensions) return;
      const meshVariants = object.userData.gltfExtensions.KHR_materials_variants as MeshVariantsExtension | undefined;
      if (!meshVariants) return;

      object.userData.originalMaterial ??= object.material;
      const mapping = meshVariants.mappings.find((m) => m.variants.includes(variantIndex));
      if (mapping) {
        object.material = await parser.getDependency('material', mapping.material);
        parser.assignFinalMaterial(object);
      } else {
        object.material = object.userData.originalMaterial;
      }
    });
  }, [scene, parser, extension, variant]);

  return <primitive object={scene} scale={10} />;
}

export default function LoaderGltfVariants() {
  return (
    <Canvas
      renderer={{ toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1 }}
      camera={{ position: [2.5, 1.5, 3], fov: 45, near: 0.25, far: 20 }}>
      <Suspense fallback={null}>
        <Environment files={HDR_URL} background />
        <Shoe />
      </Suspense>
      {/* Grid off: the HDR backdrop fills the frame and the shoe floats at the origin. */}
      <DemoHelpers grid={false} target={[0, 0.5, -0.2]} minDistance={2} maxDistance={10} />
    </Canvas>
  );
}

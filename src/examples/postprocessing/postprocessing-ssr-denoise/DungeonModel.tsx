// The dungeon level. Owns the `SSR / roughness` slider the original's GUI has:
// roughness is a material property, so it belongs with the model, not with the pass
// that reads it back out of the G-buffer.
import { useEffect, useLayoutEffect } from 'react';
import type { Mesh, MeshStandardMaterial } from 'three/webgpu';
import { useGLTF } from '@react-three/drei/webgpu';
import { useControls } from 'leva';

const MODEL_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/dungeon_warkarma.glb';

export function DungeonModel() {
  const { roughness } = useControls('Model', {
    roughness: { value: 0.3, min: 0, max: 1, step: 0.01 },
  });
  const { scene: model } = useGLTF(MODEL_URL);

  // Shadow flags and the normal-map removal must precede the first render, which is
  // when the shader graph is built. Idempotent over drei's cached GLTF.
  useLayoutEffect(() => {
    model.traverse((object) => {
      const material = (object as Mesh).material as MeshStandardMaterial | undefined;
      if (!material) return;
      object.castShadow = true;
      object.receiveShadow = true;
      // Normal maps would add high-frequency detail the SSR denoiser reads as noise.
      material.normalMap = null;
    });
  }, [model]);

  useEffect(() => {
    model.traverse((object) => {
      const material = (object as Mesh).material as MeshStandardMaterial | undefined;
      if (material) material.roughness = roughness;
    });
  }, [model, roughness]);

  return <primitive object={model} scale={0.1} />;
}

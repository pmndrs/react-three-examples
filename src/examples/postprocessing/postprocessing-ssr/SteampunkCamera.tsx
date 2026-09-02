// The Draco-compressed steampunk camera. Owns the `Model / roughness` control the
// original's GUI has: roughness is a MATERIAL property here, not a pipeline uniform,
// so it lives with the model rather than with the SSR pass that reads it back
// through the MRT metal/rough attachment.
import { useEffect, useLayoutEffect } from 'react';
import { FrontSide } from 'three/webgpu';
import type { Mesh, MeshStandardMaterial } from 'three/webgpu';
import { useGLTF } from '@react-three/drei/webgpu';
import { useControls } from 'leva';

const MODEL_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/steampunk_camera.glb';

export function SteampunkCamera() {
  const { roughness } = useControls('Model', {
    roughness: { value: 1, min: 0, max: 1, step: 0.01 },
  });
  const { scene: model } = useGLTF(MODEL_URL, { draco: true });

  // Material flags must land before the first render builds the shaders. Both writes
  // are idempotent, so StrictMode's double mount over drei's cached GLTF is harmless.
  useLayoutEffect(() => {
    model.traverse((object) => {
      const material = (object as Mesh).material as MeshStandardMaterial | undefined;
      if (!material) return;
      // The lens casing is glass in the source asset.
      if (material.name === 'Lense_Casing') material.transparent = true;
      // Single-sided: backfaces would overdraw the G-buffer SSR marches through.
      material.side = FrontSide;
    });
  }, [model]);

  useEffect(() => {
    model.traverse((object) => {
      const material = (object as Mesh).material as MeshStandardMaterial | undefined;
      if (material) material.roughness = roughness;
    });
  }, [model, roughness]);

  return <primitive object={model} position-y={0.1} />;
}

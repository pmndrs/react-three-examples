// One shader ball: a clone of the shared ShaderBall.glb prefab, wearing ONE MaterialX
// sample's parsed material on both its `Calibration_Mesh` (a simple test shape) and
// `Preview_Mesh` (the full shader-ball). Each instance owns its own clone and its own
// `MaterialXLoader` fetch, so — like the original's `for`-loop-of-`await` — balls pop
// in one at a time as their `.mtlx` (and any textures it references) finish loading.
import { useEffect, useMemo } from 'react';
import { MaterialXLoader } from 'three/addons/loaders/MaterialXLoader.js';
import type { Mesh } from 'three/webgpu';
import { useLoader } from '@react-three/fiber/webgpu';
import { useGLTF } from '@react-three/drei/webgpu';
import type { MaterialXSample } from './samples';

const SHADERBALL_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/ShaderBall.glb';

interface ShaderBallSampleProps {
  sample: MaterialXSample;
  position: [number, number, number];
  showCalibrationMesh: boolean;
  showPreviewMesh: boolean;
}

export function ShaderBallSample({ sample, position, showCalibrationMesh, showPreviewMesh }: ShaderBallSampleProps) {
  const { scene: prefab } = useGLTF(SHADERBALL_URL);
  // Fresh clone per instance (never mutate the Suspense-cached prefab) — matches
  // scene/portal/PortalModels.tsx's established pattern.
  const model = useMemo(() => prefab.clone(true), [prefab]);

  const { materials } = useLoader(MaterialXLoader, sample.file, (loader) => {
    loader.setPath(sample.path);
  });
  const material = useMemo(() => Object.values(materials).pop(), [materials]);

  useEffect(() => {
    const calibrationMesh = model.getObjectByName('Calibration_Mesh') as Mesh | undefined;
    const previewMesh = model.getObjectByName('Preview_Mesh') as Mesh | undefined;
    if (!material || !calibrationMesh || !previewMesh) return;

    calibrationMesh.material = material;
    previewMesh.material = material;

    if (material.transparent) {
      calibrationMesh.renderOrder = 1;
      previewMesh.renderOrder = 2;
    }
  }, [model, material]);

  useEffect(() => {
    const calibrationMesh = model.getObjectByName('Calibration_Mesh') as Mesh | undefined;
    if (calibrationMesh) calibrationMesh.visible = showCalibrationMesh;
  }, [model, showCalibrationMesh]);

  useEffect(() => {
    const previewMesh = model.getObjectByName('Preview_Mesh') as Mesh | undefined;
    if (previewMesh) previewMesh.visible = showPreviewMesh;
  }, [model, showPreviewMesh]);

  return <primitive object={model} position={position} />;
}

/**
 * loader-materialx
 * R3F port of three.js `webgpu_loader_materialx`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_loader_materialx (~333 lines of JS)
 *
 * 28 MaterialX Standard Surface samples (9 from the MaterialX project's own reference
 * set, 19 three.js feature-test files), each compiled to a TSL node-material graph by
 * `MaterialXLoader` and worn by its own clone of a shared shader-ball model.
 *
 * DEMONSTRATES
 * - `MaterialXLoader` (three/addons): parses a `.mtlx` XML document into a real TSL
 *   node graph — no shader authored by this repo, the whole point is that the LOADER
 *   builds one
 * - `MATERIALX_SAMPLES.map()` (`samples.ts`) replacing the original's two back-to-back
 *   `for`-loops-of-`await` — near-identical loads become one data array and one
 *   component (`ShaderBallSample.tsx`), each with its OWN `<Suspense>` boundary so
 *   shader balls pop in as their sample finishes loading, matching the original's
 *   progressive reveal (a deliberate exception to "don't reflexively split
 *   boundaries" — see AGENTS.md; here the per-sample boundary IS the point)
 * - A hand-rolled TSL grid+fade shader (`GridFloor.tsx`) as the ground, unrelated to
 *   MaterialX itself but part of the original scene
 *
 * DIVERGENCE from original
 * - Three of the twelve MaterialX-reference samples are dropped — see `samples.ts`
 *   for why (their `.mtlx` documents point at texture files that don't exist at that
 *   relative path in the upstream repo; a broken asset reference, not a mirror gap)
 * - `renderer.inspector.createParameters` dat.gui-style panel replaced with leva:
 *   the same two mesh-visibility toggles
 * - `renderer.toneMapping`/`toneMappingExposure` (Linear, 0.5) set via
 *   `<Canvas renderer={{...}}>`
 * - DemoHelpers' camera-controls orbit replaces `OrbitControls`; min/max distance
 *   match the original's `controls` settings exactly
 */
import { Suspense } from 'react';
import { LinearToneMapping } from 'three/webgpu';
import { Canvas } from '@react-three/fiber/webgpu';
import { Environment } from '@react-three/drei/webgpu';
import { useControls } from 'leva';
import { DemoHelpers } from '../../../utils/DemoHelpers';
import { GridFloor } from './GridFloor';
import { MATERIALX_SAMPLES, sampleGridPosition } from './samples';
import { ShaderBallSample } from './ShaderBallSample';

const HDR_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/equirectangular/san_giuseppe_bridge_2k.hdr';

function ShaderBalls() {
  const { showCalibrationMesh, showPreviewMesh } = useControls('loader-materialx', {
    showCalibrationMesh: { value: true, label: 'Calibration Mesh' },
    showPreviewMesh: { value: true, label: 'Preview Mesh' },
  });

  return (
    <>
      {MATERIALX_SAMPLES.map((sample, i) => (
        // Own Suspense boundary per ball — see header DEMONSTRATES.
        <Suspense key={sample.path + sample.file} fallback={null}>
          <ShaderBallSample
            sample={sample}
            position={sampleGridPosition(i, MATERIALX_SAMPLES.length)}
            showCalibrationMesh={showCalibrationMesh}
            showPreviewMesh={showPreviewMesh}
          />
        </Suspense>
      ))}
    </>
  );
}

export default function LoaderMaterialX() {
  return (
    <Canvas
      renderer={{ toneMapping: LinearToneMapping, toneMappingExposure: 0.5 }}
      background="#ffffff"
      camera={{ position: [10, 10, 20], fov: 45, near: 0.25, far: 200 }}>
      {/* Environment gates the shader balls (not just its own Suspense boundary):
          MaterialXLoader builds MeshPhysicalNodeMaterial graphs, and building one
          before scene.environment exists bakes "no IBL" in permanently on WebGPU
          0.185.1 (AGENTS.md B15) — each ball keeps its OWN nested Suspense for
          progressive pop-in, but only once the HDR is ready. */}
      <Suspense fallback={null}>
        <Environment files={HDR_URL} />
        <ShaderBalls />
      </Suspense>
      <GridFloor />
      <DemoHelpers grid={false} minDistance={2} maxDistance={40} />
    </Canvas>
  );
}

/**
 * exporter
 * One scene, eight export formats: pick a format from the panel and Export writes a
 * file straight from the live three.js objects — no server round-trip.
 * Original: https://threejs.org/examples/#misc_exporter_gltf
 * Also demonstrates: misc_exporter_gltf_normals, misc_exporter_usdz,
 * misc_exporter_ply, misc_exporter_stl, misc_exporter_obj
 *
 * DEMONSTRATES
 * - Five three.js exporter addons (`GLTFExporter`, `USDZExporter`, `PLYExporter`,
 *   `STLExporter`, `OBJExporter`) driven from one leva format select + a `button()` —
 *   the six originals are near-identical "pick a format, click export" pages
 * - Three different exporter API shapes unified behind one `exportMesh()` (see
 *   `exportMesh.ts`): `GLTFExporter`/`USDZExporter`'s promise-based `parseAsync`,
 *   `STLExporter`/`OBJExporter`'s synchronous `parse`, `PLYExporter`'s callback `parse`
 * - `setTextureUtils(WebGPUTextureUtils)` on the GLTF/USDZ exporters — the originals
 *   set the WebGL texture-readback utility; this renderer needs the WebGPU one instead
 * - leva's `get()` inside a `button()` callback, reading the CURRENT value of a
 *   sibling control at click time rather than needing it threaded through as a prop —
 *   the path has to be folder-qualified (`get('Export.format')`), not the bare key
 * - Per-vertex colour by position (`misc_exporter_ply`'s technique) so the PLY export
 *   has something format-specific to show off
 *
 * DIVERGENCE from original
 * - One shared scene (box + ground + grid) replaces six separate kitchen-sink/GUI-
 *   driven scenes — `misc_exporter_gltf`'s own scene alone tests two dozen edge cases
 *   (hidden objects, WebP textures, compressed GLTFs, instancing…) that exercise
 *   GLTFExporter's OWN test coverage, not something this demo needs to re-teach; the
 *   export mechanism is what's on show here.
 */
import { useMemo, useRef } from 'react';
import { DoubleSide } from 'three/webgpu';
import type { Mesh } from 'three/webgpu';
import { Canvas, useThree } from '@react-three/fiber/webgpu';
import { button, useControls } from 'leva';

import { DemoHelpers } from '../../../utils/DemoHelpers';
import { exportMesh, FORMATS } from './exportMesh';

// boxGeometry has 24 vertices (4 per face, unshared) — cycle the 8 corner colours by
// the sign of each corner's position, matching the original's PLY vertex-colour demo.
const BOX_CORNERS: [number, number, number][] = [
  [-0.5, -0.5, -0.5],
  [0.5, -0.5, -0.5],
  [0.5, 0.5, -0.5],
  [-0.5, 0.5, -0.5],
  [-0.5, -0.5, 0.5],
  [0.5, -0.5, 0.5],
  [0.5, 0.5, 0.5],
  [-0.5, 0.5, 0.5],
];

//* Scene =========================================================

function ExportableScene() {
  const meshRef = useRef<Mesh>(null);
  const scene = useThree((state) => state.scene);

  const vertexColors = useMemo(() => {
    const colors = new Float32Array(24 * 3);
    for (let i = 0; i < 24; i++) {
      const [x, y, z] = BOX_CORNERS[i % 8];
      colors[i * 3] = x > 0 ? 0.5 : 0;
      colors[i * 3 + 1] = y > 0 ? 0.5 : 0;
      colors[i * 3 + 2] = z > 0 ? 0.5 : 0;
    }
    return colors;
  }, []);

  useControls('Export', () => ({
    format: { value: 'glTF (JSON)' as keyof typeof FORMATS, options: Object.keys(FORMATS) },
    export: button((get) => {
      // leva's store paths are folder-qualified: inside a named folder (`useControls('Export', ...)`)
      // `get()` needs 'Export.format', not the bare sibling key — the bare key silently
      // resolves to `undefined` rather than throwing (verified: B-entry candidate, see
      // AGENTS.md/UPSTREAM.md). `FORMATS[undefined]` was also `undefined`, so every click
      // fell through the switch with no matching case and no error.
      const format = FORMATS[get('Export.format') as keyof typeof FORMATS];
      exportMesh(format, scene, meshRef.current!);
    }),
  }));

  return (
    <>
      <fog attach="fog" args={['#a0a0a0', 4, 20]} />
      <hemisphereLight color="#ffffff" groundColor="#444444" intensity={3} position={[0, 20, 0]} />
      <directionalLight
        intensity={3}
        position={[0, 20, 10]}
        castShadow
        shadow-camera-top={2}
        shadow-camera-bottom={-2}
        shadow-camera-left={-2}
        shadow-camera-right={2}
      />

      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshPhongNodeMaterial color="#bbbbbb" depthWrite={false} />
      </mesh>
      <gridHelper args={[40, 20, '#000000', '#000000']} material-opacity={0.2} material-transparent />

      <mesh ref={meshRef} position-y={0.5} castShadow name="Box">
        <boxGeometry>
          <bufferAttribute attach="attributes-color" args={[vertexColors, 3]} />
        </boxGeometry>
        <meshPhongNodeMaterial vertexColors side={DoubleSide} />
      </mesh>
    </>
  );
}

export default function Exporter() {
  return (
    <Canvas renderer shadows background="#a0a0a0" camera={{ position: [4, 2, 4], fov: 45, near: 0.1, far: 100 }}>
      <ExportableScene />
      <DemoHelpers target={[0, 0.5, 0]} />
    </Canvas>
  );
}

/**
 * postprocessing-ssgi
 * A Cornell box with one point light — the red and green bleeding onto the white
 * walls and boxes is screen-space global illumination, not a second light.
 * Original: https://threejs.org/examples/#webgpu_postprocessing_ssgi
 *
 * DEMONSTRATES
 * - `ssgi()` producing TWO results from one horizon trace — `getAONode()` and
 *   `getGINode()` — composited as `beauty * AO + albedo * GI`
 * - Why the composite needs an ALBEDO attachment: bounced light is tinted by the
 *   surface color, so multiplying it into the already-lit beauty would double-light it
 * - A four-attachment `mrt()` G-buffer (beauty, albedo, packed normals, velocity)
 *   with the two 8-bit-safe attachments downgraded to `UnsignedByteType`
 * - A runtime output selector that swaps four whole node graphs, next to the
 *   uniform-backed knobs that need no rebuild at all
 */
import { NoToneMapping } from 'three/webgpu';
import { Canvas } from '@react-three/fiber/webgpu';

import { DemoHelpers } from '../../../utils/DemoHelpers';
import { CornellBox } from './CornellBox';
import { SSGIPipeline } from './SSGIPipeline';

export default function PostprocessingSSGI() {
  return (
    <Canvas
      // Original sets no tone mapping (WebGPURenderer default); fiber would default ACES.
      renderer={{ toneMapping: NoToneMapping }}
      shadows="percentage"
      background="#aaaaaa"
      camera={{ position: [0, 10, 30], fov: 40, near: 0.1, far: 100 }}>
      <SSGIPipeline />
      {/* Nearly black ambient: the visible fill on the shadowed faces is GI. */}
      <ambientLight color="#0c0c0c" />
      <pointLight
        color="#ffffff"
        intensity={100}
        distance={100}
        position={[0, 13, 0]}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <CornellBox />
      <DemoHelpers grid={false} target={[0, 7, 0]} minDistance={1} maxDistance={100} />
    </Canvas>
  );
}

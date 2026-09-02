/**
 * compute-rasterizer-ibl
 * The compute rasterizer again, but shaded properly: 15,625 damaged helmets are
 * meshlet-clustered, LOD-picked, frustum- AND occlusion-culled, scan-converted by hand
 * into a visibility buffer, then lit by an environment map through three's own material
 * pipeline.
 * Original: https://threejs.org/examples/#webgpu_compute_rasterizer_ibl
 *
 * DEMONSTRATES
 * - Visibility-buffer shading: the rasterizer stores only "which triangle of which
 *   instance", and the resolve pass rebuilds position, normal, UV, a tangent frame and
 *   analytic UV/normal derivatives from two ids — then hands them to a
 *   `<meshStandardNodeMaterial>` so the standard IBL path lights it
 * - `overrideNodes([[positionView, …], [positionViewDirection, …]])` as the seam: a
 *   fullscreen triangle has no meaningful view position, so the lighting pipeline is
 *   told to use the one reconstructed per fragment instead
 * - GPU occlusion culling with a hierarchical depth pyramid: 16 compute kernels fold
 *   the scene depth into one packed storage buffer, and next frame's cull tests each
 *   bounding sphere against the pyramid level where its diameter fits one texel
 * - meshopt as an asset pipeline: `MeshoptSimplifier` builds six LODs with attribute
 *   weights, `MeshoptClusterizer` cuts each into 64-triangle meshlets with bounding
 *   spheres, and React `use()` suspends on the two WASM modules
 * - Two rasterizers that have to agree: small triangles go through the compute path,
 *   big ones onto an indirect-draw queue that a `<mesh>` with a vertex-pulling
 *   `positionNode` draws — both apply the same specular-antialiasing roughness so the
 *   boundary is invisible
 * - A render-phase takeover that is the demo: compute passes, the scene into an HDR
 *   `RenderTarget`, the depth pyramid, then a `QuadMesh` blit where tone mapping applies
 * - Material variants as conditional JSX rather than three pre-built materials swapped
 *   by hand, and a `key` on the meshes to remount them when the drawing buffer resizes
 *
 * DIVERGENCE from original
 * - No "Rendering N triangles" readout: the repo shell owns the titleblock.
 * - The debug outputs (`Meshlet Debug` and the seven channel views) mount a different
 *   material instead of switching `mesh.material` between three pre-built ones, so a
 *   mode change costs one shader build. Same for the resize path, which remounts by
 *   key rather than reaching in to `dispose()`.
 * - `src/types/meshopt.d.ts` declares the clusterizer and simplifier: three r185 ships
 *   them as .js and @types/three has no declarations for either yet.
 */
import { Suspense, useRef } from 'react';
import { ACESFilmicToneMapping } from 'three/webgpu';
import { Canvas } from '@react-three/fiber/webgpu';
import type CameraControlsImpl from 'camera-controls';

import { DemoHelpers } from '../../../utils/DemoHelpers';
import { HelmetAssets } from './RasterizerIbl';

export default function ComputeRasterizerIbl() {
  // Escape hatch to the live camera-controls instance — switching the instance grid
  // reframes the field, which a direct camera write could not do.
  const controlsRef = useRef<CameraControlsImpl>(null);

  return (
    <Canvas
      // Tone mapping matches the original's renderer setup; the pipeline flips it to
      // NoToneMapping while a debug channel is selected (those are already
      // display-referred).
      renderer={{ toneMapping: ACESFilmicToneMapping }}
      camera={{ position: [0, 8, 30], fov: 50, near: 0.25, far: 1000000 }}>
      {/* Suspends on the helmet, the environment and the meshopt WASM modules; the
          pipeline is its child, so every creator hook runs with the assets in hand. */}
      <Suspense fallback={null}>
        <HelmetAssets controlsRef={controlsRef} />
      </Suspense>

      {/* Grid off: the helmet field is its own ground plane, 500 units across. */}
      <DemoHelpers grid={false} target={[0, -1, 0]} controlsRef={controlsRef} />
    </Canvas>
  );
}

/**
 * postprocessing-ao
 * A gallery room lit by GTAO folded into the scene's ambient lighting, not
 * multiplied flat over the final image — smoothed across frames by TRAA.
 * Original: https://threejs.org/examples/#webgpu_postprocessing_ao
 *
 * DEMONSTRATES
 * - GTAO feeding `scenePass.contextNode = builtinAOContext(...)`, darkening ambient
 *   light where geometry creases instead of multiplying the beauty pass
 * - A second MRT pre-pass (packed normals + velocity) built inside the pipeline's
 *   mainCB and registered by return, feeding both GTAO and TRAA
 * - Runtime output switching for an AO-only debug view, paired with a tone-mapping
 *   swap
 * - RoomEnvironment IBL generated imperatively via `PMREMGenerator.fromScene`
 * - A procedural JSX gallery scene split by role: room shell, furniture, and a
 *   Draco-loaded bust
 *
 * DIVERGENCE from original
 * - Ports the r185 release (GTAO-only): the current dev original adds a GTAO/SSAO
 *   switcher, but `SSAONode` doesn't exist in npm three 0.185.1
 */
import { Suspense, useEffect } from 'react';
import { NeutralToneMapping, PMREMGenerator } from 'three/webgpu';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Canvas, useThree } from '@react-three/fiber/webgpu';
import { useControls } from 'leva';

import { DemoHelpers } from '../../../utils/DemoHelpers';
import { AOPipeline } from './AOPipeline';
import { Furniture } from './Furniture';
import { Gallery } from './Gallery';
import { TennysonBust } from './TennysonBust';

//* Scene ==========================================================

// RoomEnvironment → PMREM → scene.environment, dimmed to let the spotlights carry
// the scene (matches the original: intensity 0.3 over a #666666 background).
function RoomEnv() {
  const renderer = useThree((s) => s.renderer);
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    const environment = new RoomEnvironment();
    const pmremGenerator = new PMREMGenerator(renderer);
    const envRT = pmremGenerator.fromScene(environment, 0.04);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.3;
    environment.dispose();
    pmremGenerator.dispose();
    return () => {
      scene.environment = null;
      envRT.dispose();
    };
  }, [renderer, scene]);

  return null;
}

export default function PostprocessingAO() {
  const { showTransparentMesh, transparentOpacity } = useControls('Test Mesh', {
    showTransparentMesh: false,
    transparentOpacity: { value: 0.3, min: 0, max: 1, step: 0.01 },
  });

  return (
    <Canvas
      renderer={{ toneMapping: NeutralToneMapping }}
      background="#666666"
      camera={{ position: [1, 3, 7], fov: 45, near: 0.1, far: 50 }}>
      {/* AOPipeline (a creator-hook component: useRenderPipeline + useUniforms)
          renders BEFORE the suspending TennysonBust sibling — a creator hook after a
          suspending sibling can trigger the B18 setState-in-render escalation into a
          full B17 pixel freeze (AGENTS.md). */}
      <AOPipeline />
      <RoomEnv />
      <Gallery />
      <Furniture />
      <Suspense fallback={null}>
        <TennysonBust />
      </Suspense>

      {/* Excluded from the AO pre-pass (prePass.transparent = false), so it never
          occludes — toggle it to verify. */}
      <mesh visible={showTransparentMesh} position={[0, 1.2, 1.5]}>
        <planeGeometry args={[1.8, 2]} />
        <meshStandardNodeMaterial transparent opacity={transparentOpacity} />
      </mesh>

      <DemoHelpers grid={false} target={[0, 1.2, 0]} minDistance={2} maxDistance={16} />
    </Canvas>
  );
}

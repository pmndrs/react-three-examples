/**
 * equirectangular
 * R3F port of three.js `webgpu_equirectangular`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_equirectangular (~50 lines of JS)
 *
 * DEMONSTRATES
 * - The smallest possible `scene.backgroundNode`: `texture(equirectTexture,
 *   equirectUV(), 0)` — a flat photo sphere with no geometry at all, just a direct
 *   per-pixel lookup from view direction into an equirect texture at a fixed LOD
 * - `scene.backgroundIntensity` — a genuinely typed `Scene` property (no B11 cast
 *   needed, unlike `backgroundNode`/`environmentNode` elsewhere in this category)
 * - DemoHelpers' `autoRotate` standing in for a continuously auto-orbiting camera
 *   panorama viewer, no scene content to light or shade
 *
 * DIVERGENCE from original
 * - Inspector's single `backgroundIntensity` slider (0-1) -> leva, same range
 * - `OrbitControls` -> DemoHelpers' CameraControls; `autoRotate`/`autoRotateSpeed`
 *   (1.0) forwarded. The original's negative `rotateSpeed` (inverted manual-drag
 *   direction, "to track mouse pointer") has no DemoHelpers equivalent — dropped,
 *   auto-rotation direction/speed otherwise matches
 */
import { Suspense, useLayoutEffect } from 'react';
import { SRGBColorSpace } from 'three/webgpu';
import { equirectUV, texture } from 'three/tsl';
import { Canvas, useNodes, useThree } from '@react-three/fiber/webgpu';
import { useTexture } from '@react-three/drei/webgpu';
import { useControls } from 'leva';
import { DemoHelpers } from '../../utils/DemoHelpers';

const EQUIRECT_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/2294472375_24a3b8ef46_o.jpg';

// The whole demo: one texture, one backgroundNode lookup, one live intensity knob.
function EquirectangularBackground() {
  const { backgroundIntensity } = useControls('equirectangular', {
    backgroundIntensity: { value: 1, min: 0, max: 1, step: 0.01 },
  });

  const scene = useThree((s) => s.scene);
  const equirectTexture = useTexture(EQUIRECT_URL);

  useLayoutEffect(() => {
    equirectTexture.colorSpace = SRGBColorSpace;
  }, [equirectTexture]);

  const { backgroundNode } = useNodes(() => ({
    backgroundNode: texture(equirectTexture, equirectUV(), 0),
  }));

  // `@types/three` declares `backgroundNode` on `Scene` directly (0.185.1), so no
  // cast is needed here.
  useLayoutEffect(() => {
    const withBackgroundNode = scene;
    withBackgroundNode.backgroundNode = backgroundNode;
    return () => {
      withBackgroundNode.backgroundNode = null;
    };
  }, [scene, backgroundNode]);

  // Real (typed, no cast) Scene property, read live every frame by the renderer.
  useLayoutEffect(() => {
    scene.backgroundIntensity = backgroundIntensity;
  }, [scene, backgroundIntensity]);

  return null;
}

export default function Equirectangular() {
  return (
    <Canvas renderer camera={{ position: [1, 0, 0], fov: 45, near: 0.25, far: 20 }}>
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes the displayed scene (AGENTS.md; corpus-wide repair, wave 8). */}
      <Suspense fallback={null}>
        <EquirectangularBackground />
      </Suspense>
      <DemoHelpers grid={false} autoRotate autoRotateSpeed={1} />
    </Canvas>
  );
}

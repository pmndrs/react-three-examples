/**
 * postprocessing-difference
 * A textured crate in fog. Every pixel that CHANGED since the previous frame is pushed
 * back to full saturation, so motion paints colour into an otherwise grey image.
 * Original: https://threejs.org/examples/#webgpu_postprocessing_difference
 *
 * DEMONSTRATES
 * - `scenePass.getPreviousTextureNode()`: the render pipeline keeps the last frame's
 *   colour target alive, so a frame-to-frame difference is a two-node expression
 * - Feeding that difference into `saturation()` — |prev − current| → `luminance()` →
 *   a big gain, clamped. A pure node graph: no pass uniforms, no per-frame JS
 * - The leva slider lives on the crate that consumes it, not on the pipeline —
 *   nothing about the effect is configurable, only the motion that feeds it
 * - Plain `<fog attach="fog">` is auto-wrapped into a fog node by the WebGPU renderer
 */
import { Suspense, useRef } from 'react';
import { NeutralToneMapping, SRGBColorSpace } from 'three/webgpu';
import type { Mesh } from 'three/webgpu';
import { luminance, saturation } from 'three/tsl';
import { Canvas, useFrame, useRenderPipeline } from '@react-three/fiber/webgpu';
import { useTexture } from '@react-three/drei/webgpu';
import { useControls } from 'leva';

import { DemoHelpers } from '../../utils/DemoHelpers';

const CRATE_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/crate.gif';
const SKY_COLOR = '#0487e2';

//* Scene =========================================================

// The only thing the panel controls is how fast the box spins — which is also the only
// thing that feeds the effect. Speed starts at 0, like the original: a still image has
// no frame difference, so it renders fully desaturated until you drag the slider.
function Crate() {
  const { speed } = useControls('Difference', { speed: { value: 0, min: 0, max: 2, step: 0.01 } });
  const map = useTexture(CRATE_URL, (texture) => {
    texture.colorSpace = SRGBColorSpace;
  });
  const meshRef = useRef<Mesh>(null);

  useFrame(({ delta }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.rotation.y += delta * 5 * speed;
  });

  return (
    <mesh ref={meshRef}>
      <boxGeometry />
      <meshBasicNodeMaterial map={map} />
    </mesh>
  );
}

//* Post-processing ===============================================

function FrameDifference() {
  useRenderPipeline(({ renderPipeline, passes }) => {
    const { scenePass } = passes;
    const currentTexture = scenePass.getTextureNode();
    const previousTexture = scenePass.getPreviousTextureNode();

    // Amplify a tiny per-pixel delta into a 0..3 saturation multiplier: 0 leaves the
    // frame monochrome, 1 is untouched, >1 oversaturates the moving edges.
    const frameDiff = previousTexture.sub(currentTexture).abs();
    const saturationAmount = luminance(frameDiff).mul(1000).clamp(0, 3);

    renderPipeline.outputNode = saturation(currentTexture, saturationAmount);
  });

  return null;
}

export default function PostprocessingDifference() {
  return (
    <Canvas
      // Original sets NeutralToneMapping explicitly — fiber's Canvas would otherwise
      // default to ACESFilmic, and the effect's whole point is a saturation readout.
      renderer={{ toneMapping: NeutralToneMapping }}
      background={SKY_COLOR}
      camera={{ position: [1, 2, 3], fov: 50, near: 1, far: 100 }}>
      <fog attach="fog" args={[SKY_COLOR, 7, 25]} />
      {/* The creator-hook component renders BEFORE its suspending sibling — the B18
          hazard (AGENTS.md § React and the ecosystem). */}
      <FrameDifference />
      <Suspense fallback={null}>
        <Crate />
      </Suspense>
      <DemoHelpers grid={false} minDistance={2} maxDistance={10} />
    </Canvas>
  );
}

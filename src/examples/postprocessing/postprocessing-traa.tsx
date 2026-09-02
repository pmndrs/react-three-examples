/**
 * postprocessing-traa
 * Two aliasing-prone boxes — a white wireframe and a nearest-filtered brick texture —
 * antialiased temporally: TRAA jitters the camera a sub-pixel amount each frame and
 * reprojects the previous frame onto the current one using per-pixel motion vectors.
 * The boxes spin for a couple of seconds, then hold still, which is when the temporal
 * history has a chance to converge and the edges go glassy.
 * Original: https://threejs.org/examples/#webgpu_postprocessing_traa
 *
 * DEMONSTRATES
 * - The three buffers TRAA consumes off ONE scene pass: colour, depth, and motion
 *   vectors — the last of which only exists because the pass renders MRT
 *   (`scenePass.setMRT(mrt({ output, velocity }))`, configured in the setupCB)
 * - `options.samples = 0` — TRAA resolves and copies depth, which a multisampled
 *   target cannot do, and fiber's Canvas defaults to 4x MSAA (the trap this batch
 *   hits three times over)
 * - Animating a whole subtree without a ref per mesh: one `<group>` ref, and the
 *   frame loop walks `group.children` exactly as the original walks `scene.children`
 * - A texture deliberately made worse — `NearestFilter`, no mipmaps — so there is
 *   real high-frequency aliasing for the pass to resolve
 */
import { Suspense, useRef } from 'react';
import { mrt, output, velocity } from 'three/tsl';
import { NearestFilter, NoToneMapping, SRGBColorSpace } from 'three/webgpu';
import type { Group } from 'three/webgpu';
import { traa } from 'three/addons/tsl/display/TRAANode.js';
import { Canvas, useFrame, useRenderPipeline } from '@react-three/fiber/webgpu';
import { useTexture } from '@react-three/drei/webgpu';

import { DemoHelpers } from '../../utils/DemoHelpers';

const BRICK_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/brick_diffuse.jpg';

// Frames per stop-go phase. The scene spins for one block and holds still for the
// next: TRAA's history only converges while nothing moves, so the pause IS the demo.
const PHASE_FRAMES = 200;

//* Scene =========================================================

function AliasingBoxes() {
  // Nearest filtering with no mipmaps, straight from the original — the point is to
  // give the pass some genuinely nasty high-frequency detail to resolve.
  const brick = useTexture(BRICK_URL, (map) => {
    map.minFilter = NearestFilter;
    map.magFilter = NearestFilter;
    map.generateMipmaps = false;
    map.colorSpace = SRGBColorSpace;
  });

  const groupRef = useRef<Group>(null);
  const frameRef = useRef(0);

  useFrame(() => {
    const index = ++frameRef.current;
    if (Math.round(index / PHASE_FRAMES) % 2 !== 0) return;
    // The original spins every child of the scene; here the group IS that subtree,
    // which keeps both boxes rotating about their own centres without two refs.
    for (const child of groupRef.current?.children ?? []) {
      child.rotation.x += 0.005;
      child.rotation.y += 0.01;
    }
  });

  return (
    <group ref={groupRef}>
      <mesh position-x={-1}>
        <boxGeometry />
        <meshBasicMaterial color="#ffffff" wireframe />
      </mesh>
      <mesh position-x={1}>
        <boxGeometry />
        <meshBasicMaterial map={brick} />
      </mesh>
    </group>
  );
}

//* Post-processing ===============================================

function TraaPipeline() {
  useRenderPipeline(
    ({ renderPipeline, passes, camera }) => {
      const scenePassColor = passes.scenePass.getTextureNode();
      const scenePassDepth = passes.scenePass.getTextureNode('depth');
      const scenePassVelocity = passes.scenePass.getTextureNode('velocity');
      renderPipeline.outputNode = traa(scenePassColor, scenePassDepth, scenePassVelocity, camera);
    },
    ({ passes }) => {
      // TRAA reprojects the previous frame through the motion vectors, and resolves
      // depth — neither survives a multisampled target, and every pass otherwise
      // inherits the renderer's sample count (fiber's Canvas defaults to 4).
      passes.scenePass.options.samples = 0;
      passes.scenePass.setMRT(mrt({ output, velocity }));
    },
  );

  return null;
}

export default function PostprocessingTraa() {
  return (
    <Canvas
      // Original never sets a tone mapping (WebGPURenderer default) — fiber's Canvas
      // would otherwise default to ACESFilmic.
      renderer={{ toneMapping: NoToneMapping }}
      background="#000000"
      camera={{ position: [0, 0, 2.5], fov: 70, near: 0.1, far: 10 }}>
      {/* Creator hook before the suspending sibling (B18). */}
      <TraaPipeline />
      <Suspense fallback={null}>
        <AliasingBoxes />
      </Suspense>
      <DemoHelpers grid={false} maxDistance={9} />
    </Canvas>
  );
}

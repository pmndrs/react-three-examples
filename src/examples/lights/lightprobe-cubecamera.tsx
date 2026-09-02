/**
 * lightprobe-cubecamera
 * The same spherical-harmonics light probe as `lightprobe`, but baked from a real
 * render — a `CubeCamera` capture of the scene — instead of decoding a static
 * cube-texture image directly.
 * Original: https://threejs.org/examples/#webgpu_lightprobe_cubecamera
 *
 * DEMONSTRATES
 * - drei's `useCubeCamera` (`/webgpu`) hands back the raw `{ fbo, camera, update }`
 *   trio instead of the `<CubeCamera>` render-prop's per-frame hide/update/show cycle
 *   (`sky`, `cubemap-dynamic`) — here the capture is a ONE-TIME bake, so `update()` is
 *   called exactly once rather than every frame
 * - `LightProbeGenerator.fromCubeRenderTarget(renderer, fbo)`: the async twin of
 *   `lightprobe`'s synchronous `fromCubeTexture` — it reads the render target back
 *   from the GPU (`readRenderTargetPixelsAsync`) instead of decoding a loaded image,
 *   so projecting the probe takes a render + a readback, not just pixels already in
 *   memory
 * - Neither `camera` (the `CubeCamera` itself) nor the fbo texture is ever added to
 *   the visible scene — `camera.update(renderer, scene)` only needs the six sub-camera
 *   views it owns as children, not scene membership, to capture from the origin
 *
 * DIVERGENCE from original
 * - OrbitControls -> this repo's CameraControls, same 10/50 dolly limits, pan locked
 */
import { Suspense, useEffect, useLayoutEffect, useState } from 'react';
import { LightProbeGenerator } from 'three/addons/lights/LightProbeGenerator.js';
import { CubeTextureLoader, LightProbe, NoToneMapping } from 'three/webgpu';
import type { CubeTexture } from 'three/webgpu';

import { Canvas, useLoader, useThree } from '@react-three/fiber/webgpu';
import { useCubeCamera } from '@react-three/drei/webgpu';

import '../../assets/LightProbeHelper';
import { DemoHelpers } from '../../utils/DemoHelpers';

const CUBE_BASE = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/cube/pisa/';
const CUBE_URLS = ['px', 'nx', 'py', 'ny', 'pz', 'nz'].map((face) => `${CUBE_BASE}${face}.png`);

function Scene() {
  const scene = useThree((s) => s.scene);
  const renderer = useThree((s) => s.renderer);
  const { fbo, camera, update } = useCubeCamera({ resolution: 256, near: 1, far: 1000 });

  const [cubeTexture] = useLoader(CubeTextureLoader, [CUBE_URLS]) as CubeTexture[];
  useLayoutEffect(() => {
    scene.background = cubeTexture;
    return () => {
      scene.background = null;
    };
  }, [scene, cubeTexture]);

  // The JSX-declared <lightProbe> hands its instance back through this setter (a
  // callback ref never re-renders on its own — same pattern as lightprobe.tsx).
  const [lightProbe, setLightProbe] = useState<LightProbe | null>(null);
  const [ready, setReady] = useState(false);

  // One-time bake: capture the current scene (just the background at this point,
  // matching the original) into `fbo`, then project it into spherical harmonics.
  // The helper only mounts once `ready` — same "no probe yet" gate as the original,
  // which adds the helper inside the load callback rather than up front.
  useEffect(() => {
    if (!lightProbe) return;
    let cancelled = false;
    update();
    LightProbeGenerator.fromCubeRenderTarget(renderer, fbo).then((generated) => {
      if (cancelled) return;
      lightProbe.copy(generated);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [lightProbe, renderer, fbo, update]);

  return (
    <>
      <primitive object={camera} />
      <lightProbe ref={setLightProbe} />
      {ready && lightProbe && <lightProbeHelper args={[lightProbe, 5]} />}
    </>
  );
}

export default function LightprobeCubecamera() {
  return (
    <Canvas renderer={{ toneMapping: NoToneMapping }} camera={{ position: [0, 0, 30], fov: 40, near: 1, far: 1000 }}>
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes the displayed scene (AGENTS.md; corpus-wide repair, wave 8). */}
      <Suspense fallback={null}>
        <Scene />
      </Suspense>
      <DemoHelpers grid={false} pan={false} minDistance={10} maxDistance={50} />
    </Canvas>
  );
}

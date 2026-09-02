/**
 * camera-logarithmicdepthbuffer
 * R3F port of three.js `webgpu_camera_logarithmicdepthbuffer`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_camera_logarithmicdepthbuffer (~350 lines of JS)
 *
 * DEMONSTRATES
 * - `renderer={{ logarithmicDepthBuffer: true }}`, side by side with the default
 *   (`false`): the WebGPU node-material pipeline genuinely implements this
 *   (`NodeMaterial.setupDepth()` swaps in `viewZToLogarithmicDepth()` when the
 *   renderer flag is set — verified against the three.js source, not assumed), so
 *   the comparison is real, not a no-op. `near`/`far` span 1e-6 to 1e27 — 15 scale
 *   markers from a micrometer to 1000 light years share ONE scene, and only the
 *   log-depth pane keeps them all distinguishable at once
 * - TWO independent `<Canvas>` roots — the R3F shape of the original's two
 *   `WebGPURenderer` instances. `logarithmicDepthBuffer` is a renderer CONSTRUCTION
 *   parameter, not a runtime toggle, so it genuinely needs two renderers; fiber has
 *   no concept of one canvas with two backends
 * - A shared camera POSE (not a shared camera object — two renderers can't share
 *   one) driven by one pane and copied into the other every frame (`CameraRig.tsx`)
 * - `LogDepthScene.tsx`: the same JSX scene content mounted into both canvases,
 *   the declarative replacement for the original sharing one `THREE.Scene` instance
 *   across two `renderer.render()` calls
 *
 * DIVERGENCE from original
 * - The draggable resize border (`pointerdown`/`pointermove` on a 2px divider,
 *   `camera.setViewOffset` keeping the FOV consistent as it resizes) is dropped for
 *   a fixed 50/50 split. It's a comparison-UX nicety, not part of what
 *   `logarithmicDepthBuffer` teaches, and replicating `setViewOffset` for two
 *   independently-sized cameras never actually sharing one virtual frame is a lot
 *   of plumbing for zero change to the lesson
 * - `renderer.inspector = new Inspector()` dropped — this repo's shell has no
 *   inspector wiring (same as `postprocessing`/`tsl-halftone`)
 * - Pane labels ("normal z-buffer" / "logarithmic z-buffer") are plain absolutely
 *   positioned `<div>`s outside both canvases, not per-renderer DOM elements
 * - Both panes have DemoHelpers mounted with `grid={false} controls={false}` (for
 *   the readiness signal only) — CameraControls' own per-frame `update()` would
 *   fight `CameraRig`'s driven pose, and the original has no orbit controls either
 *   ("Mousewheel to dolly out" is the only interaction, ported as-is)
 * - Test-infra note: this repo's smoke/screenshot tooling captures
 *   `page.locator('canvas').first()` — a single canvas. With two independent
 *   canvases, only the LEFT (normal z-buffer) pane is captured; the side-by-side
 *   comparison itself is only visible when actually viewing the page
 */
import { Suspense, useState } from 'react';
import type { CSSProperties } from 'react';
import { NoToneMapping, Vector3 } from 'three/webgpu';
import { Canvas } from '@react-three/fiber/webgpu';
import { DemoHelpers } from '../../../utils/DemoHelpers';
import { CameraDriver, CameraFollower } from './CameraRig';
import { LogDepthScene } from './LogDepthScene';

// 1 micrometer to 100 billion light years, in a scene where 1 unit = 1 meter.
const NEAR = 1e-6;
const FAR = 1e27;

const paneLabelStyle: CSSProperties = {
  position: 'absolute',
  bottom: '1em',
  width: '100%',
  textAlign: 'center',
  color: '#fff',
  fontFamily: 'sans-serif',
  pointerEvents: 'none',
};

export default function CameraLogarithmicDepthBuffer() {
  // Identity-stable, shared by both canvases: the driver pane writes it every
  // frame, the follower pane reads it every frame (see CameraRig.tsx). Lazy
  // useState (not useMemo) — this is a plain mutable instance, not a memo value.
  const [pose] = useState(() => new Vector3());

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
      <div style={{ position: 'relative', width: '50%', height: '100%' }}>
        <Canvas
          renderer={{ toneMapping: NoToneMapping, logarithmicDepthBuffer: false }}
          background="#000000"
          camera={{ fov: 50, near: NEAR, far: FAR }}>
          <Suspense fallback={null}>
            <LogDepthScene />
          </Suspense>
          <CameraDriver pose={pose} />
          <DemoHelpers grid={false} controls={false} />
        </Canvas>
        <h2 style={paneLabelStyle}>normal z-buffer</h2>
      </div>
      <div style={{ position: 'relative', width: '50%', height: '100%' }}>
        <Canvas
          renderer={{ toneMapping: NoToneMapping, logarithmicDepthBuffer: true }}
          background="#000000"
          camera={{ fov: 50, near: NEAR, far: FAR }}>
          <Suspense fallback={null}>
            <LogDepthScene />
          </Suspense>
          <CameraFollower pose={pose} />
          <DemoHelpers grid={false} controls={false} />
        </Canvas>
        <h2 style={paneLabelStyle}>logarithmic z-buffer</h2>
      </div>
    </div>
  );
}

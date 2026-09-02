/**
 * procedural-texture
 * R3F port of three.js `webgpu_procedural_texture`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_procedural_texture (~90 lines of JS)
 *
 * DEMONSTRATES
 * - `convertToTexture()` (TSL): baking a purely procedural node graph
 *   (`checker(uv().mul(uvScale))`) into an actual GPU texture (an `RTTNode`, via an
 *   internal quad-mesh render) with zero manual render-target/pipeline wiring — the
 *   node schedules its own `updateBefore(RENDER)` pass as part of the normal node-material
 *   render, independent of `useRenderPipeline`
 * - `gaussianBlur()` chained directly onto that baked texture, showing TSL post-effects
 *   compose over ANY texture-producing node — not just a `useRenderPipeline` scene pass
 *   (contrast with `rtt.tsx`/`shadow-contact`, which blur a scene-pass/depth-pass texture)
 * - `RTTNode.autoUpdate` / `.textureNeedsUpdate`: the baked texture re-bakes every frame
 *   by default; toggling `autoUpdate` off freezes it, and a one-shot "update once" leva
 *   button flips `textureNeedsUpdate` for exactly one more bake — the original ships this
 *   as commented-out dead code, this port wires it up live
 *
 * DIVERGENCE from original
 * - Camera: the original locks a fixed `OrthographicCamera` sized to exactly fill the
 *   viewport with a unit plane (a full-screen shader-toy-style preview) plus a manual
 *   `resize` listener recomputing the frustum. Replaced with this corpus's default
 *   perspective camera + DemoHelpers' orbit controls/grid baseline, so the textured plane
 *   is an orbitable object in a 3D scene instead of a locked 2D preview; fiber resizes the
 *   canvas/camera automatically, so the manual resize handler is dropped entirely
 * - `renderer.inspector.createParameters` dat.gui panel replaced with leva controls (uv
 *   scale, blur amount, auto update, update-once button)
 * - The original's commented-out manual-update lines (`textureNeedsUpdate = true`) are
 *   wired to a live "update once" button instead of left as dead code, so the API is
 *   actually demonstrated, not just narrated in a comment
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js';
import { checker, convertToTexture, uv } from 'three/tsl';

import { Canvas, useUniforms } from '@react-three/fiber/webgpu';
import { button, useControls } from 'leva';

import { DemoHelpers } from '../../utils/DemoHelpers';

function ProceduralPlane() {
  const [updateTick, setUpdateTick] = useState(0);

  const { uvScale, blurAmount, autoUpdate } = useControls('procedural-texture', {
    uvScale: { value: 4, min: 1, max: 10, step: 0.1, label: 'uv scale (before rtt)' },
    blurAmount: { value: 0.5, min: 0, max: 2, step: 0.01, label: 'blur amount (after rtt)' },
    autoUpdate: { value: true, label: 'auto update' },
    'update once': button(() => setUpdateTick((n) => n + 1)),
  });

  const { uvScale: uvScaleNode, blurAmount: blurAmountNode } = useUniforms({ uvScale, blurAmount });

  // Procedural checker pattern, baked to a 512x512 texture. `convertToTexture` returns
  // an `RTTNode` (typed as such by @types/three) — no cast needed to reach `.autoUpdate`/
  // `.textureNeedsUpdate` below.
  const proceduralToTexture = useMemo(
    () => convertToTexture(checker(uv().mul(uvScaleNode)), 512, 512),
    // `useUniforms` returns the same uniform-node instance across re-renders (values are
    // mutated in place via `.value`), so this dep never actually changes identity — listed
    // for the lint rule, not for churn. It guards against re-baking a brand new RTTNode
    // (render target + quad mesh) on every leva tick.
    [uvScaleNode],
  );

  const colorNode = useMemo(
    () => gaussianBlur(proceduralToTexture, blurAmountNode, 20),
    [proceduralToTexture, blurAmountNode],
  );

  useEffect(() => {
    proceduralToTexture.autoUpdate = autoUpdate;
  }, [proceduralToTexture, autoUpdate]);

  // "update once": force exactly one more bake on button click. Skip the mount tick —
  // the initial bake already happens on its own (autoUpdate defaults true).
  const isMount = useRef(true);
  useEffect(() => {
    if (isMount.current) {
      isMount.current = false;
      return;
    }
    proceduralToTexture.textureNeedsUpdate = true;
  }, [updateTick, proceduralToTexture]);

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <meshBasicNodeMaterial colorNode={colorNode} />
    </mesh>
  );
}

export default function ProceduralTexture() {
  return (
    <Canvas renderer background="#111111" camera={{ position: [0, 0, 3], fov: 50 }}>
      <ProceduralPlane />
      <DemoHelpers />
    </Canvas>
  );
}

/**
 * lights-dynamic
 * 100 meshes lit by a growing and shrinking pile of point lights — add, remove or
 * auto-spawn them and watch the frame rate hold steady.
 * Original: https://threejs.org/examples/#webgpu_lights_dynamic
 *
 * DEMONSTRATES
 * - `renderer.lighting = new DynamicLighting()`: an opt-in lighting backend that
 *   batches supported lights into uniform arrays, so adding or removing a `PointLight`
 *   never recompiles the 50 unique `MeshStandardMaterial`s it's lighting (Shapes.tsx).
 *   Installed from the renderer FACTORY, not a layout effect — three caches the
 *   scene's lights node in a module-level WeakMap the first time a render list is
 *   built, and the factory is the only hook that runs early enough (AGENTS.md B41,
 *   same fix as `lights-clustered`)
 * - A dynamic light COUNT modeled as React state (`useState<LightConfig[]>`) rather
 *   than a fixed prop count — each `<PointLightRig>` still takes its orbit data as
 *   plain props (the `lights-phong` rule), it's the ARRAY LENGTH that's live
 * - leva `button()` controls driving imperative add/remove/clear actions, plus an
 *   `autoAdd` toggle wired to a plain `setInterval` effect
 * - 100 meshes sharing just 5 geometries and 50 materials (each material instance
 *   lights TWO meshes) — a `REVIEW(shared-instance)` exception to "no bare `new
 *   Material()` + `material={}`", kept because it's the corpus count the demo itself
 *   advertises
 *
 * DIVERGENCE from original
 * - The original's "dynamic mode" GUI toggle recreates the entire `WebGPURenderer` to
 *   A/B against the classic (non-batched) lighting path. This repo's `<Canvas>` owns
 *   one renderer for the component's lifetime — recreating it from a leva toggle isn't
 *   a pattern used anywhere in this corpus, and it isn't what the demo is actually
 *   teaching (that adding/removing lights doesn't recompile materials), so
 *   `DynamicLighting` stays on permanently and the toggle is dropped
 * - `renderer.inspector`/Stats.js wiring dropped (not ported, repo-wide convention);
 *   the `lightCount` GUI readout goes with it — the marker spheres make the count
 *   visible directly in the scene
 * - OrbitControls -> this repo's CameraControls (damping on by default)
 */
import { NoToneMapping, WebGPURenderer } from 'three/webgpu';
import { DynamicLighting } from 'three/addons/lighting/DynamicLighting.js';

import { Canvas } from '@react-three/fiber/webgpu';

import { DemoHelpers } from '../../../utils/DemoHelpers';
import { DynamicLights } from './DynamicLights';
import { Shapes } from './Shapes';

// The manager goes on at renderer CONSTRUCTION, exactly as `lights-clustered` does —
// see that example's header for the measured ordering that rules out even a Canvas
// child's useLayoutEffect (AGENTS.md B41).
function createRenderer(props: object) {
  const renderer = new WebGPURenderer(props);
  renderer.toneMapping = NoToneMapping;
  renderer.lighting = new DynamicLighting();
  return renderer;
}

export default function LightsDynamic() {
  return (
    <Canvas renderer={createRenderer} camera={{ position: [0, 15, 30], fov: 50, near: 0.1, far: 200 }}>
      <Shapes />
      <DynamicLights />
      <DemoHelpers target={[0, 2, 0]} />
    </Canvas>
  );
}

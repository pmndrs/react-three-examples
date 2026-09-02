/**
 * tsl-vfx-tornado
 * R3F port of three.js `webgpu_tsl_vfx_tornado`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_tsl_vfx_tornado (~300 lines of JS)
 *
 * DEMONSTRATES
 * - Bruno Simon's stylized VFX tornado built from three cheap meshes and one RGB
 *   perlin texture (Tornado.tsx): a floor plate whose `outputNode` swirls two
 *   counter-scrolling radial noises into a glowing ring, plus two open cylinders
 *   whose `positionNode` re-radiuses every vertex along a parabola of its height —
 *   the funnel silhouette is pure vertex math over a stock CylinderGeometry
 * - Reusable TSL helper `Fn`s composed across three materials: `toRadialUv`
 *   (plane UV → polar scroll), `toSkewedUv` (shear for wind-dragged streaks) and
 *   `twistedCylinder` (parabola + sine turbulence), all animated by the TSL `time`
 *   built-in — zero per-frame JS
 * - Layered transparency doing volumetric work: an emissive core cylinder
 *   (luminance-normalized color × 1.2, alpha from multiplied noises) inside a
 *   slightly larger pure-black smoke shell, over a hard-thresholded emissive floor
 *   (×3, i.e. HDR) that only reads as fire once bloom picks it up
 * - `useRenderPipeline`'s pattern (b): `bloom()`'s own `uniform()`-backed
 *   `.strength`/`.radius` fields are swapped for live `useUniforms` nodes inside
 *   the pipeline callback, before the shader compiles — no pipeline rebuild, no
 *   read-back cast, no effect
 * - `useUniforms` create-or-update semantics for the tornado shape knobs
 *   (timeScale/parabol trio/emissive color) — every slider mutates live GPU
 *   uniforms, the node graphs never rebuild
 *
 * DIVERGENCE from original
 * - `frustumCulled = false` on both twisted cylinders: `positionNode` reshapes the
 *   funnel on the GPU, and with the parabola knobs raised the radius exceeds the
 *   CPU geometry's culling sphere — the original has the same latent bug class and
 *   just never pans (rule established by tsl-galaxy)
 * - Fn parameters named `uv`/`time` in the original are renamed (`uvIn`, `timeIn`)
 *   to avoid shadowing the imported TSL builtins
 * - perlin noise texture hotlinked from jsdelivr @r185 and loaded via drei's
 *   suspending `useTexture` (wrap set to repeat in a layout effect, before the
 *   first shader build) instead of a bare `TextureLoader.load`
 * - Grid disabled — the tornado's own noise floor plate covers the origin and a
 *   grid would slice through it
 */
import { Suspense } from 'react';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { ACESFilmicToneMapping } from 'three/webgpu';

import { Canvas, useRenderPipeline, useUniforms } from '@react-three/fiber/webgpu';
import { useControls } from 'leva';

import { DemoHelpers } from '../../../utils/DemoHelpers';
import { Tornado } from './Tornado';

// Scene color + bloom, matching the original's RenderPipeline: the floor's ×3
// emissive cells and the luminance-normalized core blow past the bloom threshold (1)
// and read as fire.
function PostFX() {
  //* Controls ====================================================
  const { bloomStrength, bloomRadius } = useControls('bloom', {
    bloomStrength: { value: 1, min: 0, max: 10, step: 0.01, label: 'strength' },
    bloomRadius: { value: 0.1, min: 0, max: 1, step: 0.01, label: 'radius' },
  });
  const uniforms = useUniforms({ bloomStrength, bloomRadius });

  useRenderPipeline(({ renderPipeline, passes }) => {
    const scenePassColor = passes.scenePass.getTextureNode('output');
    const bloomPass = bloom(scenePassColor, undefined, undefined, 1);
    // bloom() builds its own uniforms; swap ours in before the shader compiles so
    // leva drives the pass with no pipeline rebuild.
    bloomPass.strength = uniforms.bloomStrength;
    bloomPass.radius = uniforms.bloomRadius;
    renderPipeline.outputNode = scenePassColor.add(bloomPass);
  });

  return null;
}

export default function TslVfxTornado() {
  return (
    <Canvas
      // The original sets ACESFilmic explicitly — written out here rather than
      // inherited from fiber's default, per the tone-mapping parity rule.
      renderer={{ toneMapping: ACESFilmicToneMapping }}
      background="#201919"
      camera={{ position: [1, 1, 3], fov: 25, near: 0.1, far: 50 }}>
      <Suspense fallback={null}>
        <Tornado />
      </Suspense>

      <PostFX />

      <DemoHelpers grid={false} target={[0, 0.4, 0]} minDistance={0.1} maxDistance={50} />
    </Canvas>
  );
}

/**
 * texturegrad
 * R3F port of three.js `webgpu_texturegrad`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_texturegrad (~90 lines of JS)
 *
 * DEMONSTRATES
 * - TSL's `.grad(ddx, ddy)`: an explicit-gradient texture sample (`textureGrad` in
 *   WGSL/GLSL) — the four diagonal taps below pick their own mip/anisotropy level
 *   instead of letting the hardware infer one from screen-space derivatives, so the
 *   blur radius can be driven by an arbitrary shader value (a `time`-based
 *   oscillation) instead of actual on-screen pixel footprint
 * - A hand-rolled 4-tap soft blur built entirely from that gradient sample: the same
 *   `map`, four diagonally-offset UVs, `.grad()` at the SAME per-pixel radius on
 *   every tap, averaged — the bottom half of the plane carries a nonzero gradient
 *   (blurred), the top half's gradient is zeroed inside `If()` (sharp), so one
 *   plane shows both regimes at once
 * - `Fn()` + `If()` + `.toVar()`/`.assign()` composing a stateful node graph
 *   (AGENTS.md: the `Fn()` wrapper is load-bearing for the `.assign()` calls inside)
 *
 * DIVERGENCE from original
 * - The original renders TWO side-by-side canvases (a `WebGPURenderer` and a
 *   `forceWebGL` `WebGPURenderer`) behind a locked orthographic camera sized to
 *   exactly fill each half. This repo is WebGPU-only and single-canvas — one
 *   `<Canvas>`, the default perspective camera, and DemoHelpers' orbit controls/grid
 *   replace the fixed fullscreen split-preview (same substitution as
 *   `procedural-texture`)
 * - No leva controls: nothing in the original is parameterized
 */
import { Suspense } from 'react';
import { cos, float, Fn, If, pow, texture, time, uv, vec2, vec4 } from 'three/tsl';
import { NoToneMapping } from 'three/webgpu';
import { Canvas, useLocalNodes } from '@react-three/fiber/webgpu';
import { useTexture } from '@react-three/drei/webgpu';
import { DemoHelpers } from '../../utils/DemoHelpers';

const UV_GRID_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/uv_grid_opengl.jpg';

function GradientBlurPlane() {
  const map = useTexture(UV_GRID_URL);

  const { colorNode } = useLocalNodes(() => ({
    colorNode: Fn(() => {
      const color = vec4(1).toVar();
      const vuv = uv().toVar();

      // Oscillating per-pixel blur radius, driven by `time` rather than screen-space
      // derivatives — this is the value `.grad()` gets handed explicitly below.
      const blur = pow(
        float(0.0625)
          .sub(cos(vuv.x.mul(20).add(time)))
          .mul(0.0625),
        2,
      );
      const grad = vec2(blur).toVar();

      // Top half: zero the gradient (sharp, hardware-picked mip). Bottom half keeps
      // the animated blur — one plane, two sampling regimes.
      If(vuv.y.greaterThan(0.5), () => {
        grad.assign(0);
      });

      color.assign(
        texture(map, vuv.add(vec2(blur, blur).mul(0.5)))
          .grad(grad, grad)
          .mul(0.25)
          .add(
            texture(map, vuv.add(vec2(blur, blur.negate()).mul(0.5)))
              .grad(grad, grad)
              .mul(0.25),
          )
          .add(
            texture(map, vuv.add(vec2(blur.negate(), blur).mul(0.5)))
              .grad(grad, grad)
              .mul(0.25),
          )
          .add(
            texture(map, vuv.add(vec2(blur.negate(), blur.negate()).mul(0.5)))
              .grad(grad, grad)
              .mul(0.25),
          ),
      );

      // Thin white seam marking the sharp/blurred split.
      If(vuv.y.greaterThan(0.497).and(vuv.y.lessThan(0.503)), () => {
        color.assign(1);
      });

      return color;
    })(),
  }));

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <meshBasicNodeMaterial colorNode={colorNode} />
    </mesh>
  );
}

export default function TextureGrad() {
  return (
    <Canvas renderer={{ toneMapping: NoToneMapping }} background="#313131" camera={{ position: [0, 0, 3], fov: 50 }}>
      {/* B17 gate: ungated suspension reaching Canvas's boundary re-runs createRoot
          and freezes the displayed scene (AGENTS.md; corpus-wide repair, wave 8). */}
      <Suspense fallback={null}>
        <GradientBlurPlane />
      </Suspense>
      <DemoHelpers />
    </Canvas>
  );
}

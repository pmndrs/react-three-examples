/**
 * shadertoy
 * Two ShaderToy shaders — rolling water noise and a flame gradient — translated to TSL
 * in the browser and cross-faded on a full-screen quad.
 * Original: https://threejs.org/examples/#webgpu_shadertoy
 *
 * DEMONSTRATES
 * - three's `Transpiler` addon end to end: `ShaderToyDecoder` parses ShaderToy-flavoured
 *   GLSL, `TSLEncoder` emits JavaScript TSL, and the result is evaluated into real node
 *   functions — GLSL in, a WGSL pipeline out, with no GLSL ever reaching the GPU
 * - The ShaderToy globals arriving as TSL built-ins: the encoder emits `iTime = time`,
 *   `iResolution = screenSize` and a flipped `fragCoord` from `screenCoordinate`, so a
 *   pasted ShaderToy shader runs unmodified
 * - `Fn()` as the transpiler's target: every GLSL function becomes a typed `Fn` and
 *   `mainImage` is just another one, so the whole shader is a `vec4` node you can
 *   compose with — here `oscSine(time.mul(0.3)).mix(water, flame)` cross-fades two of them
 * - `.mix()` chained on the oscillator: the CALLING node is the blend FACTOR
 *   (`t.mix(a, b)` is `mix(a, b, t)`), which is why the oscillator leads
 *
 * DIVERGENCE from original
 * - The original wraps each shader in a `ShaderToyNode extends THREE.Node` subclass whose
 *   only job is to call `mainImage()` from `setup()`. `mainImage` is an `Fn`, so calling
 *   it already returns a lazily-built `vec4` node — the subclass is dropped and the call
 *   happens where the rest of the graph is built
 * - The full-screen quad is a viewport-sized plane under the default camera instead of a
 *   2x2 plane behind a hand-built `OrthographicCamera(-1, 1, 1, -1, 0, 1)`. Both shaders
 *   are screen-space (`fragCoord / iResolution`), so orbit controls are switched off —
 *   the original has none either
 */
import * as TSL from 'three/tsl';
import { oscSine, time } from 'three/tsl';
import { LinearSRGBColorSpace, NoToneMapping } from 'three/webgpu';
import type { Node } from 'three/webgpu';
import Transpiler from 'three/addons/transpiler/Transpiler.js';
import ShaderToyDecoder from 'three/addons/transpiler/ShaderToyDecoder.js';
import TSLEncoder from 'three/addons/transpiler/TSLEncoder.js';
import { Canvas, useLocalNodes, useThree } from '@react-three/fiber/webgpu';
import { DemoHelpers } from '../../../utils/DemoHelpers';
import { FLAME_GLSL, WATER_GLSL } from './shaders';

//* Transpiler ====================================================

// GLSL -> TSL source -> node. `iife` makes the encoder emit `(function (TSL) { … })`
// instead of an ES module, so it can be evaluated synchronously during the graph build.
// Indirect `eval` runs the generated source in global scope: it closes over nothing but
// the `TSL` namespace it is handed, which is the whole point of the iife form.
// `mainImage` is always vec4 — the encoder emits `property('vec4')` for ShaderToy's
// `out vec4 fragColor`, so that is the contract being annotated here, not a guess.
function transpileShaderToy(glsl: string): Node<'vec4'> {
  const encoder = new TSLEncoder();
  encoder.iife = true;
  const jsCode = new Transpiler(new ShaderToyDecoder(), encoder).parse(glsl);
  const { mainImage } = (0, eval)(jsCode)(TSL) as { mainImage: () => Node<'vec4'> };
  return mainImage();
}

//* Scene =========================================================

function ShaderToyQuad() {
  // World size of the near plane at z = 0 — the plane fills the canvas and follows resizes.
  const { width, height } = useThree((state) => state.viewport);

  const { colorNode } = useLocalNodes(() => ({
    colorNode: oscSine(time.mul(0.3)).mix(transpileShaderToy(WATER_GLSL), transpileShaderToy(FLAME_GLSL)),
  }));

  return (
    <mesh scale={[width, height, 1]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicNodeMaterial colorNode={colorNode} />
    </mesh>
  );
}

export default function ShaderToy() {
  return (
    <Canvas
      // Both mirrored from the original: no tone mapping, and a linear output color
      // space so the shaders' literal colours reach the screen unconverted.
      renderer={{ toneMapping: NoToneMapping, outputColorSpace: LinearSRGBColorSpace }}>
      <ShaderToyQuad />
      {/* Screen-space shaders on a screen-filling quad: nothing to orbit or stand on. */}
      <DemoHelpers grid={false} controls={false} />
    </Canvas>
  );
}

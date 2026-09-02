/**
 * texturegather
 * R3F port of three.js `webgpu_texturegather`, running on WebGPU.
 * Original: https://threejs.org/examples/#webgpu_texturegather (~110 lines of JS)
 *
 * DEMONSTRATES
 * - TSL's `.gather(component)`: reads the 2x2 texel neighborhood a bilinear sample
 *   would blend, WITHOUT blending it — one channel from all four texels at once
 *   (`textureGather` in WGSL/GLSL). The visible plane's top half gathers the RED
 *   channel of a color render target; the bottom half gathers a DEPTH-comparison
 *   render target with `.compare(1)`, exercising the shadow-sampler gather variant
 *   in the same shader
 * - `.offset(ivec2(x, y))`: shifts the sample footprint by whole texels before the
 *   gather — both halves use the same `offset(0, 7)` to read near an edge of the
 *   100x100 render target on purpose
 * - A bare `texture()` node (no `map` yet) whose `.value` is assigned AFTER a
 *   one-time offscreen render — the node graph is built once, the render target
 *   texture/depthTexture it points at is filled in afterward, same "declare the
 *   graph, wire the value later" shape as `rtt.tsx`'s post pass
 * - `renderer.render(rtScene, rtCamera)` called directly (not through
 *   `useRenderPipeline`) into a manually-built `RenderTarget` with mipmaps and a
 *   `DepthTexture` — a one-shot bake, not a per-frame render-to-texture loop
 *
 * DIVERGENCE from original
 * - The original renders TWO side-by-side canvases (a `WebGPURenderer` and a
 *   `forceWebGL` `WebGPURenderer`) behind a locked orthographic camera. This repo is
 *   WebGPU-only and single-canvas — one `<Canvas>`, the default perspective camera,
 *   and DemoHelpers' orbit controls/grid replace the fixed fullscreen split-preview
 *   (same substitution as `procedural-texture`)
 * - The offscreen scene (rotated red box, one directional + one ambient light) is
 *   authored declaratively via `createPortal` into a plain `THREE.Scene`, instead of
 *   the original's imperative `rtScene.add(...)` calls — same pattern as
 *   `textures-anisotropy`'s two portal scenes
 * - No leva controls: nothing in the original is parameterized
 */
import { useLayoutEffect, useState } from 'react';
import { Fn, ivec2, texture, uv, vec4, If } from 'three/tsl';
import {
  DepthTexture,
  LessEqualCompare,
  LinearMipmapLinearFilter,
  NoToneMapping,
  PerspectiveCamera,
  RenderTarget,
  RepeatWrapping,
  Scene,
} from 'three/webgpu';
import { Canvas, createPortal, useLocalNodes, useThree } from '@react-three/fiber/webgpu';
import { DemoHelpers } from '../../utils/DemoHelpers';

const RT_SIZE = 100;
const CAMERA_Z = 2.5;

// The scene that gets baked into the render target: a single rotated red box under
// one directional + one dim ambient light, against a mid-grey background.
function GatherSourceScene({ scene }: { scene: Scene }) {
  return createPortal(
    <>
      <color attach="background" args={[0x808080]} />
      <directionalLight position={[1, 1, 0]} intensity={1} />
      <ambientLight intensity={0.1} />
      <mesh rotation={[Math.PI / 4, Math.PI / 4, 0]}>
        <boxGeometry />
        <meshStandardNodeMaterial color="#ff0000" />
      </mesh>
    </>,
    scene,
  );
}

function GatherPlane() {
  const renderer = useThree((state) => state.renderer);

  // Non-node instances captured by the render-once effect below — lazy useState
  // keeps identity stable across a StrictMode re-render (AGENTS.md convention). The
  // depthTexture is kept alongside the target (rather than read back via
  // `renderTarget.depthTexture`, which types as nullable) since we just made it.
  const [{ renderTarget, depthTexture }] = useState(() => {
    const depthTexture = new DepthTexture();
    depthTexture.compareFunction = LessEqualCompare;
    const renderTarget = new RenderTarget(RT_SIZE, RT_SIZE, {
      depthTexture,
      generateMipmaps: true,
      minFilter: LinearMipmapLinearFilter,
    });
    renderTarget.texture.wrapS = RepeatWrapping;
    renderTarget.texture.wrapT = RepeatWrapping;
    return { renderTarget, depthTexture };
  });
  const [rtScene] = useState(() => new Scene());
  const [rtCamera] = useState(
    () => new PerspectiveCamera(50, 1, CAMERA_Z - 0.5 * Math.sqrt(3), CAMERA_Z + 0.5 * Math.sqrt(3)),
  );

  // Create-once graph: two bare texture nodes get their `.value` filled in below,
  // once the offscreen bake has actually produced a color/depth texture to point at.
  const { colorNode, colorTex, depthTex } = useLocalNodes(() => {
    const colorTex = texture();
    const depthTex = texture();

    const colorNode = Fn(() => {
      const color = vec4(1).toVar();
      const vuv = uv().toVar();

      If(vuv.y.greaterThan(0.5), () => {
        color.assign(colorTex.sample(vuv.mul(10)).offset(ivec2(0, 7)).gather(0));
      }).Else(() => {
        color.assign(depthTex.sample(vuv).offset(ivec2(0, 7)).gather(0).compare(1));
      });

      return color;
    })();

    return { colorNode, colorTex, depthTex };
  });

  // One-shot bake: render the box scene into the target, then point the two texture
  // nodes at its color/depth textures. Must land before the first shader-graph build
  // reads `colorTex`/`depthTex`'s `.value` (AGENTS.md useLayoutEffect rule).
  useLayoutEffect(() => {
    rtCamera.position.z = CAMERA_Z;
    renderer.setRenderTarget(renderTarget);
    renderer.render(rtScene, rtCamera);
    renderer.setRenderTarget(null);

    colorTex.value = renderTarget.texture;
    depthTex.value = depthTexture;
  }, [renderer, renderTarget, depthTexture, rtScene, rtCamera, colorTex, depthTex]);

  return (
    <>
      <GatherSourceScene scene={rtScene} />
      <mesh>
        <planeGeometry args={[1, 1]} />
        <meshBasicNodeMaterial color="#ffffff" colorNode={colorNode} />
      </mesh>
    </>
  );
}

export default function TextureGather() {
  return (
    <Canvas renderer={{ toneMapping: NoToneMapping }} background="#000000" camera={{ position: [0, 0, 2], fov: 50 }}>
      <GatherPlane />
      <DemoHelpers />
    </Canvas>
  );
}

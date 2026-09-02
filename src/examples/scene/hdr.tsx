/**
 * hdr
 * A light-painting brush: drag the pointer to leave additive HDR strokes that persist
 * and slowly fade, rendered through a real extended-range color pipeline so an HDR
 * display shows highlights brighter than plain white.
 * Original: https://threejs.org/examples/#webgpu_hdr (~140 lines of JS)
 *
 * DEMONSTRATES
 * - Real HDR display output: `renderer={{ outputType: HalfFloatType, outputColorSpace:
 *   ExtendedSRGBColorSpace }}` plus `THREE.ColorManagement.define(...)` registering the
 *   addon's extended-sRGB color space at module scope (one-time, idempotent — same
 *   convention as `RectAreaLightNode.setLTC`) — additive strokes can now exceed 1.0 and
 *   an HDR monitor renders them visibly brighter than white, not clamped
 * - `afterImage(brushPass, decay)` as the WHOLE pipeline output: the brush scene is
 *   redrawn additively every frame, and the addon accumulates a fading trail — no manual
 *   ping-pong render targets
 * - A second, fully independent `THREE.Scene` + pixel-space `OrthographicCamera`
 *   (`createPortal`, same pattern as `portal.tsx`) driving a register-to-override custom
 *   pass (`pass(brushScene, orthoCamera, { type: HalfFloatType })` returned under the
 *   `scenePass` key, pattern: `mrt.tsx`) — the Canvas's own default scene/camera are
 *   never rendered at all
 * - A radial falloff brush (`t.clamp().oneMinus().pow(hardness*8+1)`) built once via
 *   `useNodes`, with `useUniforms` driving intensity/hardness/radius live with no
 *   shader rebuild
 *
 * DIVERGENCE from original
 * - Pointer tracking: a `window.pointermove` listener (like the original's) rather than
 *   fiber's `state.pointer`, because the brush lives in PIXEL space against a pixel-space
 *   ortho camera, not NDC — the original does the same rect-relative math by hand
 * - The `#no-hdr` capability banner is ported as a small DOM overlay sibling to the
 *   Canvas (`matchMedia('(dynamic-range: high)')`); mobile scroll-prevention listeners
 *   are dropped as page chrome unrelated to the demo
 * - `WebGPU.isAvailable()` gate and `renderer.inspector` wiring dropped — house
 *   conventions (the shell handles unsupported browsers; this repo doesn't wire
 *   Inspector, see `mrt.tsx`)
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { pass, uv } from 'three/tsl';
import { AdditiveBlending, ColorManagement, Color, HalfFloatType, OrthographicCamera, Scene } from 'three/webgpu';
import type { Mesh } from 'three/webgpu';
import { afterImage } from 'three/addons/tsl/display/AfterImageNode.js';
import { ExtendedSRGBColorSpace, ExtendedSRGBColorSpaceImpl } from 'three/addons/math/ColorSpaces.js';

import { Canvas, createPortal, useNodes, useRenderPipeline, useThree, useUniforms } from '@react-three/fiber/webgpu';
import { useControls } from 'leva';

import { DemoHelpers } from '../../utils/DemoHelpers';

// Registers the extended-sRGB color space with three's ColorManagement so
// `outputColorSpace`/`texture.colorSpace` accept it. Module-scope, one-time,
// idempotent — same convention as RectAreaLightNode.setLTC (AGENTS.md).
ColorManagement.define({ [ExtendedSRGBColorSpace]: ExtendedSRGBColorSpaceImpl });

//* Brush ==========================================================

// The additive brush quad: a radial falloff painted into `brushScene` at the pointer
// position. Position is a plain Object3D mutation (pixel space), not a uniform — it
// only changes on pointer move, exactly like the original.
function Brush() {
  const meshRef = useRef<Mesh>(null);
  const size = useThree((state) => state.size);
  const domElement = useThree((state) => state.renderer.domElement);

  const { intensity, hardness, radius } = useControls('Brush', {
    intensity: { value: 4, min: 0, max: 10, step: 0.1 },
    hardness: { value: 0.4, min: 0, max: 0.99, step: 0.01 },
    radius: { value: 0.5, min: 0.1, max: 2, step: 0.01 },
  });
  const { uColor, uHard, uRadius } = useUniforms({ uColor: intensity, uHard: hardness, uRadius: radius });

  // Radial falloff, built once — useUniforms keeps `.value` synced, no rebuild.
  const { colorNode, opacityNode } = useNodes(() => {
    const d = uv().sub(0.5).length();
    const t = d.div(uRadius);
    const a = t.clamp().oneMinus().pow(uHard.mul(8).add(1));
    return { colorNode: uColor.mul(a), opacityNode: a }; // premultiplied-style, additive blending
  });

  useEffect(() => {
    function onPointerMove(event: PointerEvent) {
      const rect = domElement.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      // camera has origin at bottom-left (0,0)
      meshRef.current?.position.set(x, size.height - y, 0);
    }
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    return () => window.removeEventListener('pointermove', onPointerMove);
  }, [domElement, size.height]);

  return (
    <mesh ref={meshRef} scale={[300, 300, 1]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicNodeMaterial
        colorNode={colorNode}
        opacityNode={opacityNode}
        transparent
        depthTest={false}
        depthWrite={false}
        blending={AdditiveBlending} // additive, to build HDR energy
      />
    </mesh>
  );
}

//* Post-processing ===============================================

interface PostFXProps {
  brushScene: Scene;
  camera: OrthographicCamera;
}

// The whole pipeline: render the brush scene once, let afterImage accumulate the trail.
function PostFX({ brushScene, camera }: PostFXProps) {
  const { afterImageDecay } = useControls('Effects', {
    afterImageDecay: { value: 0.985, min: 0.9, max: 0.999, step: 0.001 },
  });
  const { decay } = useUniforms({ decay: afterImageDecay });

  useRenderPipeline(
    ({ renderPipeline, passes }) => {
      const brushPass = passes.scenePass;
      brushPass.renderTarget.texture.colorSpace = ExtendedSRGBColorSpace;
      renderPipeline.outputNode = afterImage(brushPass, decay);
    },
    // Register-to-override: our own scene/camera replace the hook's default
    // full-viewport scenePass (pattern: mrt.tsx).
    () => ({ scenePass: pass(brushScene, camera, { type: HalfFloatType }) }),
  );

  return null;
}

//* Scene ==========================================================

function HdrScene() {
  // Identity-stable across the component's life — the pipeline closes over these once,
  // so resizing must MUTATE the camera, never replace it (AGENTS.md).
  const [brushScene] = useState(() => {
    const scene = new Scene();
    scene.background = new Color(0xffffff);
    return scene;
  });
  const [camera] = useState(() => {
    const orthoCamera = new OrthographicCamera(0, 0, 0, 0, 1, 2);
    orthoCamera.position.z = 1;
    return orthoCamera;
  });

  const size = useThree((state) => state.size);
  useLayoutEffect(() => {
    camera.right = size.width;
    camera.top = size.height;
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height]);

  return (
    <>
      {createPortal(<Brush />, brushScene)}
      <PostFX brushScene={brushScene} camera={camera} />
    </>
  );
}

//* HDR capability banner ==========================================

function HdrWarning() {
  const [isHDR, setIsHDR] = useState(() => window.matchMedia('(dynamic-range: high)').matches);

  useEffect(() => {
    const query = window.matchMedia('(dynamic-range: high)');
    const update = () => setIsHDR(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  if (isHDR) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: '5em',
        left: '50%',
        transform: 'translateX(-50%)',
        maxWidth: 600,
        padding: '1.5em',
        borderRadius: 4,
        background: '#000',
        color: '#fff',
        font: '11px monospace',
        textAlign: 'center',
        pointerEvents: 'none',
      }}>
      The browser says your device or monitor doesn&apos;t support HDR. If you&apos;re on a laptop using an external
      monitor, try the built-in monitor, or try this site on your phone. Most phones support HDR.
    </div>
  );
}

export default function Hdr() {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Canvas renderer={{ antialias: true, outputType: HalfFloatType, outputColorSpace: ExtendedSRGBColorSpace }}>
        <HdrScene />
        <DemoHelpers grid={false} controls={false} />
      </Canvas>
      <HdrWarning />
    </div>
  );
}

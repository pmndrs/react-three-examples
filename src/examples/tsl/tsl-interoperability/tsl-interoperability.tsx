/**
 * tsl-interoperability
 * Two halves of the screen run the same CRT aperture-grille effect over a scrolling
 * earth-lights texture — the top one written in raw WGSL, the bottom one in TSL.
 * Original: https://threejs.org/examples/#webgpu_tsl_interoperability
 *
 * DEMONSTRATES
 * - `wgslFn()`: hand-written WGSL dropped straight into a node graph, wired up as a
 *   material's `positionNode` and `fragmentNode` — the raw shader is a node like any
 *   other, so the SAME `useUniforms` values drive both implementations
 * - Passing a `varyingProperty` between shader stages across the language boundary:
 *   a WGSL vertex function writes it through the implicit `varyings` struct (the node
 *   goes in wgslFn's *includes* array), and the WGSL fragment function receives it as
 *   an ordinary named input
 * - WGSL's split `texture_2d<f32>` + `sampler` inputs, fed by TSL's `texture()` and
 *   `sampler()` accessors off one `useTexture` result
 * - One leva panel driving two shader languages at once: the shared knobs move both
 *   quads, and each language gets its own scroll-speed uniform so you can watch them
 *   diverge
 *
 * DIVERGENCE from original
 * - The two quads are not pixel-identical, and that is upstream's doing: the TSL
 *   fragment shifts its sample point down by 1.5 and the WGSL one doesn't, so the
 *   halves show different bands of the texture
 */
import { Suspense } from 'react';
import { LinearSRGBColorSpace, NoToneMapping, RepeatWrapping } from 'three/webgpu';
import { Canvas, useNodes, useUniforms } from '@react-three/fiber/webgpu';
import { useTexture } from '@react-three/drei/webgpu';
import { useControls } from 'leva';
import { DemoHelpers } from '../../../utils/DemoHelpers';
import { createTslCrtNodes, createWgslCrtNodes } from './crtShaders';

const EARTH_LIGHTS_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/planets/earth_lights_2048.png';

function CrtScreens() {
  const map = useTexture(EARTH_LIGHTS_URL, (texture) => {
    texture.wrapS = texture.wrapT = RepeatWrapping;
  });

  //* Controls =====================================================
  // Both quads consume these, so the panel lives at their shared parent — one hop up.
  const { wgslSpeed, tslSpeed, ...grille } = useControls('tsl-interoperability', {
    cellSize: { value: 6, min: 6, max: 50, step: 1 },
    cellOffset: { value: 0.5, min: 0, max: 1, step: 0.1 },
    borderMask: { value: 1, min: 0, max: 5, step: 0.1 },
    pulseIntensity: { value: 0.06, min: 0, max: 0.5, step: 0.01 },
    pulseWidth: { value: 60, min: 10, max: 100, step: 5 },
    wgslSpeed: { value: 1, min: 1, max: 10, label: 'WGSL speed' },
    tslSpeed: { value: 1, min: 1, max: 10, label: 'TSL speed' },
  });

  // crtWidth/crtHeight/pulseRate are uniforms in the original too, just without GUI.
  const { wgslSpeedU, tslSpeedU, ...shared } = useUniforms({
    ...grille,
    crtWidth: 1608,
    crtHeight: 1608,
    pulseRate: 20,
    wgslSpeedU: wgslSpeed,
    tslSpeedU: tslSpeed,
  });

  //* Shader graphs ================================================
  const { wgslPosition, wgslFragment, tslPosition, tslColor } = useNodes(() => {
    const wgsl = createWgslCrtNodes(map, { ...shared, speed: wgslSpeedU });
    const tsl = createTslCrtNodes(map, { ...shared, speed: tslSpeedU });
    return {
      wgslPosition: wgsl.positionNode,
      wgslFragment: wgsl.fragmentNode,
      tslPosition: tsl.positionNode,
      tslColor: tsl.colorNode,
    };
  });

  return (
    <>
      <mesh position={[0, 0.5, 0]}>
        <planeGeometry args={[2, 1]} />
        <meshBasicNodeMaterial positionNode={wgslPosition} fragmentNode={wgslFragment} />
      </mesh>
      <mesh position={[0, -0.5, 0]}>
        <planeGeometry args={[2, 1]} />
        <meshBasicNodeMaterial positionNode={tslPosition} colorNode={tslColor} />
      </mesh>
    </>
  );
}

export default function TslInteroperability() {
  return (
    <Canvas
      renderer={{ toneMapping: NoToneMapping, outputColorSpace: LinearSRGBColorSpace }}
      orthographic
      // Passing left/right/top/bottom flips fiber's camera to `manual`, so the frustum
      // stays the original's fixed -1..1 box instead of being resized to pixels.
      camera={{ left: -1, right: 1, top: 1, bottom: -1, near: 0.1, far: 10, position: [0, 0, 1] }}>
      {/* One suspending resource, gated so the texture resolves before the node
          graphs that sample it are built. */}
      <Suspense fallback={null}>
        <CrtScreens />
      </Suspense>
      <DemoHelpers grid={false} controls={false} />
    </Canvas>
  );
}

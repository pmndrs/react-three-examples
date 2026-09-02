/**
 * postprocessing-masking
 * Two photographs revealed only where a tumbling box and torus are — each shape is its
 * own scene, rendered to its own pass, and used purely as a stencil.
 * Original: https://threejs.org/examples/#webgpu_postprocessing_masking
 *
 * DEMONSTRATES
 * - Three scenes, three `pass()` nodes, one canvas: `createPortal` authors the two
 *   off-graph mask scenes declaratively, so the shapes are still ordinary JSX with
 *   ordinary `useFrame` animation
 * - A pass used as a MASK rather than an image: `pass(scene, camera).a` is the
 *   coverage alpha, and `.mix()` composites a picture wherever it is 1
 * - `flipY = false` on the source images — a post-processing node samples in screen
 *   space, where three's usual texture flip would stand them on their heads
 * - Lazy `useState` for the two `THREE.Scene`s: the pipeline callback closes over them
 *   once, so they have to be identity-stable across re-renders
 */
import { Suspense, useRef, useState } from 'react';
import { LinearFilter, NoToneMapping, Scene, SRGBColorSpace } from 'three/webgpu';
import type { Mesh } from 'three/webgpu';
import { pass, texture } from 'three/tsl';
import { Canvas, createPortal, useFrame, useRenderPipeline, useThree } from '@react-three/fiber/webgpu';
import { useTexture } from '@react-three/drei/webgpu';

import { DemoHelpers } from '../../utils/DemoHelpers';

const TEXTURE_BASE = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/';
const PAINTING_URL = `${TEXTURE_BASE}758px-Canestra_di_frutta_%28Caravaggio%29.jpg`;
const PHOTO_URL = `${TEXTURE_BASE}2294472375_24a3b8ef46_o.jpg`;

//* Scene =========================================================

// One shape per mask scene. Nothing about it is shaded — only its silhouette's alpha
// is ever read — so the default white basic material is all it needs.
// `phase` offsets the two Lissajous paths against each other, as the original does by
// swapping which axis gets the /1.5 term.
function MaskShape({ children, swapped = false }: { children: React.ReactNode; swapped?: boolean }) {
  const meshRef = useRef<Mesh>(null);

  useFrame(({ elapsed }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = elapsed + 6000;
    mesh.position.x = Math.cos(swapped ? t : t / 1.5) * 2;
    mesh.position.y = Math.sin(swapped ? t / 1.5 : t) * 2;
    mesh.rotation.x = t;
    mesh.rotation.y = t / 2;
  });

  return (
    <mesh ref={meshRef}>
      {children}
      <meshBasicNodeMaterial />
    </mesh>
  );
}

//* Post-processing ===============================================

function MaskCompose() {
  const camera = useThree((state) => state.camera);

  // The two mask scenes live outside the Canvas's own tree; createPortal fills them.
  const [maskScenes] = useState(() => [new Scene(), new Scene()] as const);

  const [painting, photo] = useTexture([PAINTING_URL, PHOTO_URL], (maps) => {
    for (const map of maps) {
      map.colorSpace = SRGBColorSpace;
      // A post node samples in screen space — three's default flip would invert them.
      map.flipY = false;
    }
    // The painting is only ever seen at full screen size; skip its mip chain.
    maps[0].minFilter = LinearFilter;
    maps[0].generateMipmaps = false;
  });

  useRenderPipeline(({ renderPipeline, passes }) => {
    // `.a` of a pass over a background-less scene: 1 where the shape covered a pixel.
    const boxMask = pass(maskScenes[0], camera).a;
    const torusMask = pass(maskScenes[1], camera).a;

    // Chained `.mix` is mixElement — the CALLING node is the factor, so this reads
    // "where the mask is 1, show the picture instead of what's underneath".
    const withPainting = boxMask.mix(passes.scenePass, texture(painting));
    renderPipeline.outputNode = torusMask.mix(withPainting, texture(photo));
  });

  return (
    <>
      {createPortal(
        <MaskShape>
          <boxGeometry args={[4, 4, 4]} />
        </MaskShape>,
        maskScenes[0],
      )}
      {createPortal(
        <MaskShape swapped>
          <torusGeometry args={[3, 1, 16, 32]} />
        </MaskShape>,
        maskScenes[1],
      )}
    </>
  );
}

export default function PostprocessingMasking() {
  return (
    <Canvas
      // Original never sets a tone mapping (WebGPURenderer default) — fiber's Canvas
      // would otherwise default to ACESFilmic and mute both the grey and the pictures.
      renderer={{ toneMapping: NoToneMapping }}
      background="#e0e0e0"
      camera={{ position: [0, 0, 10], fov: 50, near: 1, far: 1000 }}>
      <Suspense fallback={null}>
        <MaskCompose />
      </Suspense>
      <DemoHelpers grid={false} />
    </Canvas>
  );
}

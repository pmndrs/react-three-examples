/**
 * materials-blending
 * A five-by-five grid: five textures (opaque, alpha-cut, alpha-gradient, flare, flare
 * mask) down the rows, five blend modes across the columns, over a slowly scrolling
 * checker so you can see how each mode mixes with what is behind it.
 * Original: https://threejs.org/examples/#webgl_materials_blending
 *
 * DEMONSTRATES
 * - `blending`, `transparent` and `premultipliedAlpha` as plain material props; the grid
 *   is two nested `map()`s over the row and column data
 * - `useTexture([...urls])`: five loads in one call, five textures back, one Suspense
 * - A `CanvasTexture` built from a 2D canvas as `scene.background` via
 *   `<primitive attach="background">`, with its `offset` scrolled from `useFrame` — the
 *   WebGPU renderer wraps a texture background in a `texture()` node that honours the
 *   texture matrix
 * - Text labels as `CanvasTexture`s on small planes
 */
import { Suspense, useLayoutEffect, useMemo, useState } from 'react';
import {
  AdditiveBlending,
  CanvasTexture,
  MultiplyBlending,
  NoBlending,
  NormalBlending,
  NoToneMapping,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  SubtractiveBlending,
} from 'three/webgpu';
import { Canvas, useFrame } from '@react-three/fiber/webgpu';
import { useTexture } from '@react-three/drei/webgpu';
import { DemoHelpers } from '../../utils/DemoHelpers';

const TEXTURES = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/';
const MAP_URLS = [
  'uv_grid_opengl.jpg',
  'sprite0.jpg',
  'sprite0.png',
  'lensflare/lensflare0.png',
  'lensflare/lensflare0_alpha.png',
].map((file) => TEXTURES + file);

const BLENDINGS = [
  { name: 'No', constant: NoBlending },
  { name: 'Normal', constant: NormalBlending },
  { name: 'Additive', constant: AdditiveBlending },
  { name: 'Subtractive', constant: SubtractiveBlending },
  { name: 'Multiply', constant: MultiplyBlending },
];

//* Canvas textures ===============================================

function makeCheckerTexture() {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  canvas.width = canvas.height = 128;
  ctx.fillStyle = '#ddd';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#555';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#999';
  ctx.fillRect(32, 32, 32, 32);
  ctx.fillStyle = '#555';
  ctx.fillRect(64, 64, 64, 64);
  ctx.fillStyle = '#777';
  ctx.fillRect(96, 96, 32, 32);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(64, 32);
  return texture;
}

function makeLabelTexture(text: string) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  canvas.width = 128;
  canvas.height = 32;
  ctx.fillStyle = 'rgba( 0, 0, 0, 0.95 )';
  ctx.fillRect(0, 0, 128, 32);
  ctx.fillStyle = 'white';
  ctx.font = 'bold 12pt arial';
  ctx.fillText(text, 10, 22);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

//* Scene =========================================================

function ScrollingBackground() {
  const [checker] = useState(makeCheckerTexture);

  useFrame(({ elapsed }) => {
    const time = elapsed * 0.25;
    checker.offset.set((time * -0.01 * checker.repeat.x) % 1, (time * -0.01 * checker.repeat.y) % 1);
  });

  return <primitive object={checker} attach="background" />;
}

function BlendGrid() {
  const maps = useTexture(MAP_URLS);
  useLayoutEffect(() => {
    for (const map of maps) map.colorSpace = SRGBColorSpace;
  }, [maps]);

  const labels = useMemo(() => BLENDINGS.map(({ name }) => makeLabelTexture(name)), []);

  // REVIEW(shared-instance): one plane for the 25 images and one for the 25 labels, as in
  // the original; a JSX child per mesh would allocate 50.
  const [image] = useState(() => new PlaneGeometry(100, 100));
  const [label] = useState(() => new PlaneGeometry(100, 25));

  return maps.map((map, row) => {
    const y = 300 - row * 150;
    return BLENDINGS.map(({ name, constant }, column) => {
      const x = (column - BLENDINGS.length / 2) * 110;
      return (
        <group key={`${row}-${name}`} position={[x, y, 0]}>
          <mesh geometry={image}>
            <meshBasicNodeMaterial map={map} transparent blending={constant} premultipliedAlpha />
          </mesh>
          <mesh geometry={label} position-y={-75}>
            <meshBasicNodeMaterial map={labels[column]} transparent />
          </mesh>
        </group>
      );
    });
  });
}

export default function MaterialsBlending() {
  return (
    <Canvas
      // The original never sets a tone mapping — the renderer default is none.
      renderer={{ toneMapping: NoToneMapping }}
      camera={{ position: [0, 0, 600], fov: 70, near: 1, far: 1000 }}>
      <ScrollingBackground />
      <Suspense fallback={null}>
        <BlendGrid />
      </Suspense>
      {/* Grid off: the demo is a flat wall of planes facing the camera. */}
      <DemoHelpers grid={false} />
    </Canvas>
  );
}

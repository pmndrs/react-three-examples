/**
 * materials-texture-canvas
 * Draw in the white box (top right) and watch your strokes appear on the spinning cube:
 * a 2D canvas used live as a texture.
 * Original: https://threejs.org/examples/#webgl_materials_texture_canvas
 *
 * DEMONSTRATES
 * - `<canvasTexture attach="map" args={[canvas]}>` — a DOM `<canvas>` as a material map,
 *   declared as a JSX child instead of `material.map = new CanvasTexture(...)`
 * - The one imperative line a canvas texture needs: `texture.needsUpdate = true` after
 *   each stroke, so the GPU copy re-uploads
 * - React pointer handlers on a plain DOM element (`onPointerDown/Move/Up/Leave`) doing
 *   the drawing, with the paint-or-not flag in a ref — nothing here re-renders
 * - Mirroring a DOM ref into state (`ref={setCanvas}`) so the texture can be created only
 *   once the element exists: a callback ref never re-renders on its own
 */
import { useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { NoToneMapping } from 'three/webgpu';
import type { CanvasTexture, Mesh } from 'three/webgpu';
import { Canvas, useFrame } from '@react-three/fiber/webgpu';

import { DemoHelpers } from '../../utils/DemoHelpers';

const PAD_SIZE = 128;

//* Sketchpad (DOM) ===============================================

interface SketchpadProps {
  onReady: (canvas: HTMLCanvasElement | null) => void;
  onStroke: () => void;
}

// A 128x128 2D canvas you draw on with the pointer. Paints a white background once on
// mount, then strokes black lines from the last pointer position to the current one.
function Sketchpad({ onReady, onStroke }: SketchpadProps) {
  const paintingRef = useRef(false);
  const lastRef = useRef({ x: 0, y: 0 });

  const setup = (canvas: HTMLCanvasElement | null) => {
    if (canvas) {
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, PAD_SIZE, PAD_SIZE);
    }
    onReady(canvas);
  };

  const draw = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!paintingRef.current) return;
    const { offsetX: x, offsetY: y } = event.nativeEvent;
    const context = event.currentTarget.getContext('2d')!;
    // The original never calls beginPath() between strokes, so every moveTo/lineTo call
    // keeps extending the SAME path — overlapping segments re-stroke and visibly darken
    // the longer you draw over one spot. Kept faithful rather than "fixed": it's a visible
    // demo behaviour, not dead code (AGENTS.md's dead-code carve-out doesn't apply here).
    context.moveTo(lastRef.current.x, lastRef.current.y);
    context.strokeStyle = '#000000';
    context.lineTo(x, y);
    context.stroke();
    lastRef.current = { x, y };
    onStroke();
  };

  return (
    <canvas
      ref={setup}
      width={PAD_SIZE}
      height={PAD_SIZE}
      style={{ position: 'absolute', top: 0, right: 0, zIndex: 10, cursor: 'crosshair', touchAction: 'none' }}
      onPointerDown={(event) => {
        paintingRef.current = true;
        lastRef.current = { x: event.nativeEvent.offsetX, y: event.nativeEvent.offsetY };
      }}
      onPointerMove={draw}
      onPointerUp={() => (paintingRef.current = false)}
      onPointerLeave={() => (paintingRef.current = false)}
    />
  );
}

//* Scene =========================================================

interface PaintedCubeProps {
  canvas: HTMLCanvasElement;
  textureRef: React.RefObject<CanvasTexture | null>;
}

function PaintedCube({ canvas, textureRef }: PaintedCubeProps) {
  const meshRef = useRef<Mesh>(null);
  useFrame(({ elapsed }) => {
    meshRef.current!.rotation.x = meshRef.current!.rotation.y = elapsed * 0.6;
  });
  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[200, 200, 200]} />
      <meshBasicNodeMaterial>
        <canvasTexture ref={textureRef} attach="map" args={[canvas]} />
      </meshBasicNodeMaterial>
    </mesh>
  );
}

export default function MaterialsTextureCanvas() {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const textureRef = useRef<CanvasTexture>(null);

  return (
    <>
      <Canvas
        // The original never sets tone mapping (WebGPURenderer default is none); fiber's
        // Canvas defaults to ACESFilmic, which visibly dulls the white cube. Match explicitly.
        renderer={{ toneMapping: NoToneMapping }}
        camera={{ position: [0, 0, 500], fov: 50, near: 1, far: 2000 }}>
        {canvas && <PaintedCube canvas={canvas} textureRef={textureRef} />}
        <DemoHelpers grid={false} />
      </Canvas>
      {/* After the <Canvas> in DOM order: the repo's test tiers screenshot the FIRST
          <canvas> on the page, and this one is the sketchpad, not the WebGPU surface. */}
      <Sketchpad onReady={setCanvas} onStroke={() => textureRef.current && (textureRef.current.needsUpdate = true)} />
    </>
  );
}

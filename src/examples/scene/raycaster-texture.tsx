/**
 * raycaster-texture
 * A cube, a plane and a disc all show the same UV-grid canvas. Move the pointer over
 * any of them and a yellow cross is drawn on the canvas at the texel you are touching —
 * on all three surfaces at once, each through its own wrap mode and transform.
 * Original: https://threejs.org/examples/#webgl_raycaster_texture
 *
 * DEMONSTRATES
 * - `event.uv` on `onPointerMove`: the surface UV of the hit, which the original dug
 *   out of `raycaster.intersectObjects()[0].uv`
 * - `texture.transformUv()` — mapping that surface UV through the hit texture's own
 *   offset/repeat/rotation/wrapping, so the cross lands on the texel you SEE
 * - Three `<canvasTexture>`s declared in JSX over ONE shared canvas element: the
 *   drawing happens once, each texture just re-uploads (`needsUpdate`)
 * - A `key` on the disc's texture: changing wrap mode remounts it, which is what the
 *   original's `needsUpdate = true` after `wrapS = …` was for
 */
import { useMemo, useRef, useState } from 'react';
import {
  BoxGeometry,
  CircleGeometry,
  ClampToEdgeWrapping,
  MirroredRepeatWrapping,
  NoToneMapping,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three/webgpu';
import type { BufferGeometry, CanvasTexture } from 'three/webgpu';
import { Canvas, useTexture, type ThreeEvent } from '@react-three/fiber/webgpu';
import { useControls } from 'leva';
import { DemoHelpers } from '../../utils/DemoHelpers';

const UV_GRID_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/uv_grid_opengl.jpg';

const WRAPPING = { RepeatWrapping, ClampToEdgeWrapping, MirroredRepeatWrapping };

//* Geometry ======================================================

// Each surface remaps its UVs so the texture tiles/wraps visibly: the original edits
// `attributes.uv.array` in place, which has no JSX prop — kept as a one-line helper.
function remapUv(geometry: BufferGeometry, map: (u: number) => number) {
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.array.length; i++) uv.array[i] = map(uv.array[i]);
  return geometry;
}

//* Shared canvas =================================================

// One 2D canvas: the UV grid as background, a yellow cross wherever the pointer last
// hit. `draw` repaints it and flags every texture built on it for re-upload.
function useCrossCanvas(textures: React.RefObject<CanvasTexture | null>[]) {
  const background = useTexture(UV_GRID_URL).image as HTMLImageElement;

  return useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = background.naturalWidth;
    canvas.height = background.naturalHeight;
    const ctx = canvas.getContext('2d')!;

    const radius = Math.ceil(Math.min(canvas.width, canvas.height / 30));
    const max = Math.ceil(0.70710678 * radius);
    const min = Math.ceil(max / 10);
    const thickness = Math.ceil(max / 10);

    const draw = (u = 0, v = 0) => {
      const x = u * canvas.width;
      const y = v * canvas.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(background, 0, 0);
      ctx.lineWidth = thickness * 3;
      ctx.strokeStyle = '#ffff00';
      ctx.beginPath();
      ctx.moveTo(x - max - 2, y - max - 2);
      ctx.lineTo(x - min, y - min);
      ctx.moveTo(x + min, y + min);
      ctx.lineTo(x + max + 2, y + max + 2);
      ctx.moveTo(x - max - 2, y + max + 2);
      ctx.lineTo(x - min, y + min);
      ctx.moveTo(x + min, y - min);
      ctx.lineTo(x + max + 2, y - max - 2);
      ctx.stroke();
      for (const texture of textures) if (texture.current) texture.current.needsUpdate = true;
    };
    draw();
    return { canvas, draw };
  }, [background, textures]);
}

//* Scene =========================================================

function Surfaces() {
  const cubeTexture = useRef<CanvasTexture>(null);
  const planeTexture = useRef<CanvasTexture>(null);
  const circleTexture = useRef<CanvasTexture>(null);
  const [textures] = useState(() => [cubeTexture, planeTexture, circleTexture]);
  const { canvas, draw } = useCrossCanvas(textures);

  const [cube, plane, circle] = useMemo(
    () => [
      remapUv(new BoxGeometry(20, 20, 20), (u) => u * 2),
      remapUv(new PlaneGeometry(25, 25, 1, 1), (u) => u * 2),
      remapUv(new CircleGeometry(25, 40, 0, Math.PI * 2), (u) => (u - 0.25) * 2),
    ],
    [],
  );

  const { wrapS, wrapT, offsetX, offsetY, repeatX, repeatY, rotation } = useControls('Circle Texture Settings', {
    wrapS: { value: RepeatWrapping, options: WRAPPING },
    wrapT: { value: RepeatWrapping, options: WRAPPING },
    offsetX: { value: 0, min: 0, max: 5 },
    offsetY: { value: 0, min: 0, max: 5 },
    repeatX: { value: 1, min: 0, max: 5 },
    repeatY: { value: 1, min: 0, max: 5 },
    rotation: { value: 0, min: 0, max: 2 * Math.PI },
  });

  // The hit's surface UV, pushed through THAT texture's transform (offset/repeat/
  // rotation/wrap) so the cross lands on the texel actually shown under the pointer.
  const pick = (event: ThreeEvent<PointerEvent>, texture: React.RefObject<CanvasTexture | null>) => {
    if (!event.uv || !texture.current) return;
    const uv = texture.current.transformUv(event.uv.clone());
    draw(uv.x, uv.y);
  };

  return (
    <>
      <mesh geometry={cube} position={[4, -5, 0]} onPointerMove={(e) => pick(e, cubeTexture)}>
        <meshBasicNodeMaterial>
          <canvasTexture
            ref={cubeTexture}
            attach="map"
            args={[canvas]}
            colorSpace={SRGBColorSpace}
            wrapS={RepeatWrapping}
            wrapT={RepeatWrapping}
          />
        </meshBasicNodeMaterial>
      </mesh>
      <mesh geometry={plane} position={[-16, -5, 0]} onPointerMove={(e) => pick(e, planeTexture)}>
        <meshBasicNodeMaterial>
          <canvasTexture
            ref={planeTexture}
            attach="map"
            args={[canvas]}
            colorSpace={SRGBColorSpace}
            wrapS={MirroredRepeatWrapping}
            wrapT={MirroredRepeatWrapping}
          />
        </meshBasicNodeMaterial>
      </mesh>
      <mesh geometry={circle} position={[24, -5, 0]} onPointerMove={(e) => pick(e, circleTexture)}>
        <meshBasicNodeMaterial>
          <canvasTexture
            key={`${wrapS}-${wrapT}`}
            ref={circleTexture}
            attach="map"
            args={[canvas]}
            colorSpace={SRGBColorSpace}
            wrapS={wrapS}
            wrapT={wrapT}
            offset={[offsetX, offsetY]}
            repeat={[repeatX, repeatY]}
            rotation={rotation}
          />
        </meshBasicNodeMaterial>
      </mesh>
    </>
  );
}

export default function RaycasterTexture() {
  return (
    <Canvas
      renderer={{ toneMapping: NoToneMapping }}
      background="#eeeeee"
      camera={{ position: [-30, 40, 50], fov: 45, near: 1, far: 1000 }}>
      <Surfaces />
      <DemoHelpers grid={false} />
    </Canvas>
  );
}

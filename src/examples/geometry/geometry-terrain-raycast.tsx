/**
 * geometry-terrain-raycast
 * A Perlin-noise mountain range with its lighting baked into a canvas texture. Move
 * the pointer over it and a small cone stands up on the surface, pointing along the
 * face normal of the triangle under the cursor.
 * Original: https://threejs.org/examples/#webgl_geometry_terrain_raycast
 *
 * DEMONSTRATES
 * - `onPointerMove` on a 130k-triangle mesh: `event.point` and `event.face.normal`
 *   are the whole hit test — the original's `Raycaster` + NDC pointer maths is gone
 * - Heightfield geometry: a dense `PlaneGeometry` whose vertices are displaced from a
 *   CPU noise field (`ImprovedNoise`), built once in `useMemo`
 * - A 2D-canvas texture with shading baked from the same height data, declared as a
 *   `<canvasTexture attach="map">` child

 * DIVERGENCE from original
 * - The cone's `translate`/`rotateX` are done in `useMemo`, not with fiber's
 *   `translate={once(…)}` prop: `once()` spreads its arguments, so the typed tuple form
 *   calls `translate([x, y, z])` and NaNs the geometry, while `once(0, 50, 0)` fails
 *   the typecheck (reported upstream)
 */
import { useMemo, useRef, useState } from 'react';
import { ClampToEdgeWrapping, ConeGeometry, NoToneMapping, PlaneGeometry, SRGBColorSpace, Vector3 } from 'three/webgpu';
import type { Mesh } from 'three/webgpu';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import { Canvas } from '@react-three/fiber/webgpu';
import { DemoHelpers } from '../../utils/DemoHelpers';

const WORLD_WIDTH = 256;
const WORLD_DEPTH = 256;

//* Height field ==================================================

// Four octaves of Perlin noise, absolute-valued so ridges form — as in the original.
function generateHeight(width: number, height: number) {
  const size = width * height;
  const data = new Uint8Array(size);
  const perlin = new ImprovedNoise();
  const z = Math.random() * 100;
  let quality = 1;

  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < size; i++) {
      const x = i % width;
      const y = ~~(i / width);
      data[i] += Math.abs(perlin.noise(x / quality, y / quality, z) * quality * 1.75);
    }
    quality *= 5;
  }

  return data;
}

// Bake sun shading from the height gradient into a canvas, then upscale 4x with a
// little noise — the terrain is unlit, this texture IS its lighting.
function generateTexture(data: Uint8Array, width: number, height: number) {
  const vector3 = new Vector3();
  const sun = new Vector3(1, 1, 1).normalize();

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  let context = canvas.getContext('2d')!;
  context.fillStyle = '#000';
  context.fillRect(0, 0, width, height);

  let image = context.getImageData(0, 0, canvas.width, canvas.height);
  let imageData = image.data;
  for (let i = 0, j = 0; i < imageData.length; i += 4, j++) {
    vector3.x = data[j - 2] - data[j + 2];
    vector3.y = 2;
    vector3.z = data[j - width * 2] - data[j + width * 2];
    vector3.normalize();
    const shade = vector3.dot(sun);
    imageData[i] = (96 + shade * 128) * (0.5 + data[j] * 0.007);
    imageData[i + 1] = (32 + shade * 96) * (0.5 + data[j] * 0.007);
    imageData[i + 2] = shade * 96 * (0.5 + data[j] * 0.007);
  }
  context.putImageData(image, 0, 0);

  const canvasScaled = document.createElement('canvas');
  canvasScaled.width = width * 4;
  canvasScaled.height = height * 4;
  context = canvasScaled.getContext('2d')!;
  context.scale(4, 4);
  context.drawImage(canvas, 0, 0);

  image = context.getImageData(0, 0, canvasScaled.width, canvasScaled.height);
  imageData = image.data;
  for (let i = 0; i < imageData.length; i += 4) {
    const v = ~~(Math.random() * 5);
    imageData[i] += v;
    imageData[i + 1] += v;
    imageData[i + 2] += v;
  }
  context.putImageData(image, 0, 0);

  return canvasScaled;
}

//* Scene =========================================================

function Terrain({ heights }: { heights: Uint8Array }) {
  const helperRef = useRef<Mesh>(null);

  // Displacing 65k vertices from the height data has no JSX prop — one `useMemo`.
  const geometry = useMemo(() => {
    const geometry = new PlaneGeometry(7500, 7500, WORLD_WIDTH - 1, WORLD_DEPTH - 1);
    geometry.rotateX(-Math.PI / 2);
    const vertices = geometry.attributes.position.array;
    for (let i = 0, j = 0; i < vertices.length; i++, j += 3) vertices[j + 1] = heights[i] * 10;
    return geometry;
  }, [heights]);
  const canvas = useMemo(() => generateTexture(heights, WORLD_WIDTH, WORLD_DEPTH), [heights]);

  // Base at its origin, pointing down +z — so `lookAt(normal)` stands it on the surface.
  const cone = useMemo(() => {
    const cone = new ConeGeometry(20, 100, 3);
    cone.translate(0, 50, 0);
    cone.rotateX(Math.PI / 2);
    return cone;
  }, []);

  return (
    <>
      <mesh
        geometry={geometry}
        onPointerMove={({ point, face }) => {
          const helper = helperRef.current;
          if (!helper || !face) return;
          // Aim from the origin along the normal, THEN move to the hit point.
          helper.position.set(0, 0, 0);
          helper.lookAt(face.normal);
          helper.position.copy(point);
        }}>
        <meshBasicNodeMaterial>
          <canvasTexture
            attach="map"
            args={[canvas]}
            wrapS={ClampToEdgeWrapping}
            wrapT={ClampToEdgeWrapping}
            colorSpace={SRGBColorSpace}
          />
        </meshBasicNodeMaterial>
      </mesh>
      <mesh ref={helperRef} geometry={cone}>
        <meshNormalNodeMaterial />
      </mesh>
    </>
  );
}

export default function GeometryTerrainRaycast() {
  const [heights] = useState(() => generateHeight(WORLD_WIDTH, WORLD_DEPTH));
  // Orbit around a point 500 above the terrain's centre, camera 2000 above that.
  const targetY = heights[WORLD_WIDTH / 2 + (WORLD_DEPTH / 2) * WORLD_WIDTH] + 500;

  return (
    <Canvas
      renderer={{ toneMapping: NoToneMapping }}
      background="#bfd1e5"
      camera={{ position: [2000, targetY + 2000, 0], fov: 60, near: 10, far: 20000 }}>
      <Terrain heights={heights} />
      <DemoHelpers
        grid={false}
        target={[0, targetY, 0]}
        minDistance={1000}
        maxDistance={10000}
        maxPolarAngle={Math.PI / 2}
      />
    </Canvas>
  );
}

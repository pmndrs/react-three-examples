/**
 * geometry-colors-lookuptable
 * A pressure field over a mesh, colored through a lookup table — pick one of four color
 * maps and the legend on the left follows.
 * Original: https://threejs.org/examples/#webgl_geometry_colors_lookuptable
 *
 * DEMONSTRATES
 * - `Lut` (three's colormap addon): `setColorMap`/`setMin`/`setMax`, then `getColor` per
 *   vertex into a `color` attribute that a `vertexColors` Lambert material reads
 * - `useLoader(BufferGeometryLoader, …)` for a JSON geometry carrying a custom `pressure`
 *   attribute — the data the colors come from — cloned before it is centered and colored,
 *   so the cached loader result stays pristine
 * - drei `<Hud>` for the legend: the original's second scene, orthographic camera and
 *   `autoClear = false` overlay pass, as one component
 * - `<canvasTexture attach="map">` on a sprite, repainted in place with `lut.updateCanvas()`
 *   whenever the color map changes
 */
import { Suspense, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  BufferGeometryLoader,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  NoToneMapping,
  SRGBColorSpace,
} from 'three/webgpu';
import type { CanvasTexture } from 'three/webgpu';
import { Lut } from 'three/addons/math/Lut.js';
import { Canvas, useLoader } from '@react-three/fiber/webgpu';
import { Hud, OrthographicCamera, PerspectiveCamera } from '@react-three/drei/webgpu';
import { useControls } from 'leva';
import { DemoHelpers } from '../../utils/DemoHelpers';

const MODEL_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/json/pressure.json';

type ColorMap = 'rainbow' | 'cooltowarm' | 'blackbody' | 'grayscale';
const COLOR_MAPS: ColorMap[] = ['rainbow', 'cooltowarm', 'blackbody', 'grayscale'];

function PressureMesh() {
  const { colorMap } = useControls('geometry-colors-lookuptable', {
    colorMap: { value: 'rainbow' as ColorMap, options: COLOR_MAPS },
  });
  const source = useLoader(BufferGeometryLoader, MODEL_URL);
  const [lut] = useState(() => new Lut());
  const [legend] = useState(() => lut.createCanvas());
  const legendRef = useRef<CanvasTexture>(null);

  const geometry = useMemo(() => {
    const geometry = source.clone();
    geometry.center();
    geometry.computeVertexNormals();
    geometry.setAttribute('color', new Float32BufferAttribute(geometry.attributes.position.count * 3, 3));
    return geometry;
  }, [source]);

  // Lut -> per-vertex color, and the same Lut repaints the legend canvas. A layout effect,
  // so the first frame never shows the blank color attribute.
  useLayoutEffect(() => {
    lut.setColorMap(colorMap);
    lut.setMax(2000);
    lut.setMin(0);

    const pressures = geometry.attributes.pressure;
    const colors = geometry.attributes.color;
    const color = new Color();
    for (let i = 0; i < pressures.count; i++) {
      color.copy(lut.getColor(pressures.getX(i))).convertSRGBToLinear();
      colors.setXYZ(i, color.r, color.g, color.b);
    }
    colors.needsUpdate = true;

    lut.updateCanvas(legend);
    if (legendRef.current) legendRef.current.needsUpdate = true;
  }, [lut, legend, geometry, colorMap]);

  return (
    <>
      <mesh geometry={geometry}>
        <meshLambertNodeMaterial side={DoubleSide} color="#f5f5f5" vertexColors />
      </mesh>
      {/* Legend: a unit-tall sprite in a [-1, 1] orthographic view, pushed to the left. */}
      <Hud>
        <OrthographicCamera
          makeDefault
          manual
          left={-1}
          right={1}
          top={1}
          bottom={-1}
          near={1}
          far={2}
          position={[0.5, 0, 1]}
        />
        <sprite scale-x={0.125}>
          <spriteNodeMaterial>
            <canvasTexture ref={legendRef} attach="map" args={[legend]} colorSpace={SRGBColorSpace} />
          </spriteNodeMaterial>
        </sprite>
      </Hud>
    </>
  );
}

export default function GeometryColorsLookuptable() {
  return (
    // The original never sets a tone mapping — WebGPURenderer's default is none.
    <Canvas renderer={{ toneMapping: NoToneMapping }} background="#ffffff">
      {/* The child light is the declarative form of the original's camera.add(light). */}
      <PerspectiveCamera makeDefault position={[0, 0, 10]} fov={60} near={1} far={100}>
        <pointLight color="#ffffff" intensity={3} decay={0} />
      </PerspectiveCamera>
      <Suspense fallback={null}>
        <PressureMesh />
      </Suspense>
      {/* Grid off: the mesh floats centred on the origin against plain white. */}
      <DemoHelpers grid={false} />
    </Canvas>
  );
}

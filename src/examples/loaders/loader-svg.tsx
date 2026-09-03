/**
 * loader-svg
 * `SVGLoader` turns vector art into real geometry: every filled region becomes a
 * `ShapeGeometry`, every stroke a triangulated ribbon. A leva panel switches between three
 * dozen sample files — the tiger, a few illustrations, and the loader's own edge-case test
 * suite — and toggles fill/stroke visibility and wireframe independently.
 * Original: https://threejs.org/examples/#webgl_loader_svg
 *
 * DEMONSTRATES
 * - `useLoader(SVGLoader, url)`: switching files is a Suspense re-suspend, replacing the
 *   original's manual `disposeScene()` + rebuild-the-whole-scene function
 * - `SVGLoader.createFillMaterial()`/`createStrokeMaterial()` read each path's parsed CSS
 *   (color, opacity, fill-rule) into a ready `MeshBasicMaterial` — genuinely vanilla, no JSX
 *   material can express "whatever this SVG's `style` attribute said"
 * - `path.toShapes()` for fills and `SVGLoader.pointsToStroke()` for strokes, both letting
 *   several meshes share one path's material — inherent to the loader's per-path API, not a
 *   scene doing its own instancing
 * - `renderOrder` preserved across fills and strokes in file order, so overlapping shapes
 *   still paint in the SVG's own painter's-algorithm order
 *
 * DIVERGENCE from original
 * - `ShapePath.userData` types as `Record<string, unknown>`; the stroke style object it
 *   carries is cast once to `SVGLoader`'s own `StrokeStyle`, exactly what `pointsToStroke`
 *   expects
 */
import { Suspense, useMemo } from 'react';
import { NoToneMapping, ShapeGeometry } from 'three/webgpu';
import type { BufferGeometry, Material } from 'three/webgpu';
import { SVGLoader, type StrokeStyle } from 'three/addons/loaders/SVGLoader.js';
import { Canvas, useLoader } from '@react-three/fiber/webgpu';
import { useControls } from 'leva';
import { DemoHelpers } from '../../utils/DemoHelpers';

const ASSETS = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/svg';

const FILES = {
  Tiger: 'tiger.svg',
  'Joins and caps': 'lineJoinsAndCaps.svg',
  Hexagon: 'hexagon.svg',
  Energy: 'energy.svg',
  'Test 1': 'tests/1.svg',
  'Test 2': 'tests/2.svg',
  'Test 3': 'tests/3.svg',
  'Test 4': 'tests/4.svg',
  'Test 5': 'tests/5.svg',
  'Test 6': 'tests/6.svg',
  'Test 7': 'tests/7.svg',
  'Test 8': 'tests/8.svg',
  'Test 9': 'tests/9.svg',
  Units: 'tests/units.svg',
  Ordering: 'tests/ordering.svg',
  Defs: 'tests/testDefs/Svg-defs.svg',
  Defs2: 'tests/testDefs/Svg-defs2.svg',
  Defs3: 'tests/testDefs/Wave-defs.svg',
  Defs4: 'tests/testDefs/defs4.svg',
  Defs5: 'tests/testDefs/defs5.svg',
  'Style CSS inside defs': 'style-css-inside-defs.svg',
  'Styled Paths': 'styled-paths.svg',
  'Multiple CSS classes': 'multiple-css-classes.svg',
  'Zero Radius': 'zero-radius.svg',
  'Styles in svg tag': 'tests/styles.svg',
  'Round join': 'tests/roundJoinPrecisionIssue.svg',
  'Ellipse Transformations': 'tests/ellipseTransform.svg',
  singlePointTest: 'singlePointTest.svg',
  singlePointTest2: 'singlePointTest2.svg',
  singlePointTest3: 'singlePointTest3.svg',
  emptyPath: 'emptyPath.svg',
  emoji: 'emoji.svg',
  blueprint: 'blueprint.svg',
  wideStroke: 'tests/wideStroke.svg',
  letter: 'tests/letter.svg',
};

interface RenderItem {
  key: string;
  geometry: BufferGeometry;
  material: Material;
  renderOrder: number;
}

function SvgArt() {
  const { file, drawFillShapes, drawStrokes, fillShapesWireframe, strokesWireframe } = useControls('SVGLoader', {
    file: { value: 'tiger.svg', options: FILES },
    drawFillShapes: { value: true, label: 'Draw fill shapes' },
    drawStrokes: { value: true, label: 'Draw strokes' },
    fillShapesWireframe: { value: false, label: 'Wireframe fill shapes' },
    strokesWireframe: { value: false, label: 'Wireframe strokes' },
  });

  const data = useLoader(SVGLoader, `${ASSETS}/${file}`);

  // One material per PATH (not per shape/subpath) — several meshes below share the same
  // instance, because that's what `createFillMaterial`/`createStrokeMaterial` hand back.
  const items = useMemo(() => {
    const items: RenderItem[] = [];
    let renderOrder = 0;
    data.paths.forEach((path, pi) => {
      if (drawFillShapes) {
        const material = SVGLoader.createFillMaterial(path);
        if (material) {
          material.wireframe = fillShapesWireframe;
          path.toShapes().forEach((shape, si) => {
            items.push({
              key: `f${pi}-${si}`,
              geometry: new ShapeGeometry(shape),
              material,
              renderOrder: renderOrder++,
            });
          });
        }
      }
      if (drawStrokes) {
        const material = SVGLoader.createStrokeMaterial(path);
        if (material) {
          material.wireframe = strokesWireframe;
          path.subPaths.forEach((subPath, si) => {
            const geometry = SVGLoader.pointsToStroke(subPath.getPoints(), path.userData!.style as StrokeStyle);
            if (geometry) items.push({ key: `s${pi}-${si}`, geometry, material, renderOrder: renderOrder++ });
          });
        }
      }
    });
    return items;
  }, [data, drawFillShapes, drawStrokes, fillShapesWireframe, strokesWireframe]);

  return (
    <group position={[-70, 70, 0]} scale={[0.25, -0.25, 0.25]}>
      {items.map((item) => (
        <mesh key={item.key} geometry={item.geometry} material={item.material} renderOrder={item.renderOrder} />
      ))}
    </group>
  );
}

export default function LoaderSvg() {
  return (
    <Canvas
      renderer={{ toneMapping: NoToneMapping }}
      background="#b0b0b0"
      camera={{ position: [0, 0, 200], fov: 50, near: 1, far: 1000 }}>
      {/* The original's backdrop grid faces the camera instead of lying flat, so it's drawn
          directly rather than through DemoHelpers' floor grid. */}
      <gridHelper args={[160, 10, 0x8d8d8d, 0xc1c1c1]} rotation={[Math.PI / 2, 0, 0]} />
      <Suspense fallback={null}>
        <SvgArt />
      </Suspense>
      <DemoHelpers grid={false} />
    </Canvas>
  );
}

/**
 * lines-dashed
 * A Hilbert curve and a box outline drawn as dashed lines, slowly tumbling in the dark.
 * Original: https://threejs.org/examples/#webgl_lines_dashed
 *
 * DEMONSTRATES
 * - `<lineDashedNodeMaterial>` — the node form of `LineDashedMaterial` — on a native
 *   `<threeLine>` and a `<lineSegments>`, with `dashSize`/`gapSize` as plain props
 * - `computeLineDistances()` is the one imperative step dashes need: the material reads a
 *   per-vertex `lineDistance` attribute, so a layout effect fills it in once the geometry
 *   has mounted
 * - Plain `<fog attach="fog">` fading the lines into the background color
 *
 * DIVERGENCE from original
 * - The box outline is `<edgesGeometry>` over a `BoxGeometry` instead of the original's
 *   hand-listed 24 vertices — the same twelve edges
 */
import { useLayoutEffect, useRef } from 'react';
import { BoxGeometry, CatmullRomCurve3, NoToneMapping, Vector3 } from 'three/webgpu';
import type { Group, Line, LineSegments } from 'three/webgpu';
import * as GeometryUtils from 'three/addons/utils/GeometryUtils.js';
import { Canvas, useFrame } from '@react-three/fiber/webgpu';
import '../../assets/ThreeLine';
import { DemoHelpers } from '../../utils/DemoHelpers';

// Hilbert curve -> Catmull-Rom spline -> six samples per control point, ported from the
// original's init(). Pure data prep, runs once.
function buildSplinePositions() {
  const points = GeometryUtils.hilbert3D(new Vector3(0, 0, 0), 25.0, 1, 0, 1, 2, 3, 4, 5, 6, 7);
  const samples = new CatmullRomCurve3(points).getPoints(points.length * 6);
  return new Float32Array(samples.flatMap((p) => p.toArray()));
}

const SPLINE_POSITIONS = buildSplinePositions();
const BOX = new BoxGeometry(50, 50, 50);

function DashedLines() {
  const groupRef = useRef<Group>(null);
  const lineRef = useRef<Line>(null);
  const segmentsRef = useRef<LineSegments>(null);

  // Dashes are measured along the line, so each object needs its `lineDistance` attribute
  // filled before the first frame draws it.
  useLayoutEffect(() => {
    lineRef.current?.computeLineDistances();
    segmentsRef.current?.computeLineDistances();
  }, []);

  // Both objects sit at the origin with the same rotation, so one group turns them together.
  useFrame(({ elapsed }) => {
    groupRef.current?.rotation.set(0.25 * elapsed, 0.25 * elapsed, 0);
  });

  return (
    <group ref={groupRef}>
      <threeLine ref={lineRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[SPLINE_POSITIONS, 3]} />
        </bufferGeometry>
        <lineDashedNodeMaterial color="#ffffff" dashSize={1} gapSize={0.5} />
      </threeLine>
      <lineSegments ref={segmentsRef}>
        <edgesGeometry args={[BOX]} />
        <lineDashedNodeMaterial color="#ffaa00" dashSize={3} gapSize={1} />
      </lineSegments>
    </group>
  );
}

export default function LinesDashed() {
  return (
    <Canvas
      // The original never sets a tone mapping — WebGPURenderer's default is none.
      renderer={{ toneMapping: NoToneMapping }}
      background="#111111"
      camera={{ position: [0, 0, 150], fov: 60, near: 1, far: 200 }}>
      <fog attach="fog" args={['#111111', 150, 200]} />
      <DashedLines />
      {/* Grid off: a dark void with no ground plane. */}
      <DemoHelpers grid={false} />
    </Canvas>
  );
}

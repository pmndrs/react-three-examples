// RaycastLines — the comparison pair of fat-line objects sharing one helix dataset:
// a continuous `Line2` (LineGeometry) and a segmented `LineSegments2`
// (LineSegmentsGeometry), both drawn with the SAME shared `Line2NodeMaterial`. Each
// has a wider, translucent "threshold" twin (`matThresholdLine`, depthTest off) that
// visualizes the raycaster's hit-test margin. Built imperatively in one `useMemo`:
// the addon classes take their geometry/material as constructor args and need a
// one-time `computeLineDistances()` call, so JSX construction would just obscure the
// three.js API being showcased (same rationale as the `lines-fat` sibling).
//
// Hands the currently-visible object off to `Raycasting.tsx` via `activeLineRef` — a
// plain object-instance handoff between sibling components, not a leva value, so it
// sits outside the "controls live with their consumer" rule.
import { useEffect, useMemo } from 'react';
import type { RefObject } from 'react';
import { CatmullRomCurve3, Color, Line2NodeMaterial, SRGBColorSpace, Vector3 } from 'three/webgpu';
import { Line2 } from 'three/addons/lines/webgpu/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineSegments2 } from 'three/addons/lines/webgpu/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { useFrame } from '@react-three/fiber/webgpu';
import { useControls } from 'leva';

export type LineType = 'continuous' | 'segmented';

// Helix curve -> Catmull-Rom spline -> flat position/color arrays, ported verbatim
// from the original's init(). Pure CPU data prep, runs once.
function buildRaycastLineData() {
  const points: Vector3[] = [];
  for (let i = -50; i < 50; i++) {
    const t = i / 3;
    points.push(new Vector3(t * Math.sin(2 * t), t, t * Math.cos(2 * t)));
  }

  const spline = new CatmullRomCurve3(points);
  const divisions = Math.round(3 * points.length);
  const point = new Vector3();
  const lineColor = new Color();

  const positions: number[] = [];
  const colors: number[] = [];

  for (let i = 0; i < divisions; i++) {
    const t = i / divisions;
    spline.getPoint(t, point);
    positions.push(point.x, point.y, point.z);
    lineColor.setHSL(t, 1.0, 0.5, SRGBColorSpace);
    colors.push(lineColor.r, lineColor.g, lineColor.b);
  }

  return { positions, colors };
}

export interface RaycastLinesProps {
  activeLineRef: RefObject<Line2 | LineSegments2 | null>;
  /** Raycaster hit-test threshold (leva, owned by `Raycasting.tsx`'s shared parent) —
   * only consumed here to size the threshold-visualization overlay's linewidth. */
  threshold: number;
}

export function RaycastLines({ activeLineRef, threshold }: RaycastLinesProps) {
  const { lineType, worldUnits, width, alphaToCoverage, visualizeThreshold, translation, animate } = useControls(
    'lines-fat-raycasting',
    {
      lineType: {
        value: 'continuous' as LineType,
        options: { 'Line2 (continuous)': 'continuous', 'LineSegments2 (segmented)': 'segmented' } as Record<
          string,
          LineType
        >,
        label: 'line type',
      },
      worldUnits: { value: true, label: 'world units' },
      width: { value: 1, min: 1, max: 10, step: 0.5, label: 'width (px)' },
      alphaToCoverage: { value: true, label: 'alpha to coverage' },
      visualizeThreshold: { value: false, label: 'visualize threshold' },
      translation: { value: 0, min: 0, max: 10, step: 0.1 },
      animate: { value: true },
    },
  );

  const { line, segments, thresholdLine, thresholdSegments, matLine, matThresholdLine } = useMemo(() => {
    const { positions, colors } = buildRaycastLineData();

    const lineGeometry = new LineGeometry();
    lineGeometry.setPositions(positions);
    lineGeometry.setColors(colors);

    const segmentsGeometry = new LineSegmentsGeometry();
    segmentsGeometry.setPositions(positions);
    segmentsGeometry.setColors(colors);

    const matLine = new Line2NodeMaterial({
      color: 0xffffff,
      linewidth: 1, // in world units with size attenuation, pixels otherwise
      worldUnits: true,
      vertexColors: true,
      alphaToCoverage: true,
    });

    const matThresholdLine = new Line2NodeMaterial({
      color: 0xffffff,
      linewidth: matLine.linewidth,
      worldUnits: true,
      transparent: true,
      opacity: 0.2,
      depthTest: false,
      visible: false,
    });

    // Both fat objects — and their threshold twins — share ONE material, exactly as
    // the original does (`line`/`segments` never diverge in appearance).
    const line = new Line2(lineGeometry, matLine);
    line.computeLineDistances();

    const segments = new LineSegments2(segmentsGeometry, matLine);
    segments.computeLineDistances();

    const thresholdLine = new Line2(lineGeometry, matThresholdLine);
    thresholdLine.computeLineDistances();

    const thresholdSegments = new LineSegments2(segmentsGeometry, matThresholdLine);
    thresholdSegments.computeLineDistances();

    return { line, segments, thresholdLine, thresholdSegments, matLine, matThresholdLine };
  }, []);

  useEffect(() => {
    activeLineRef.current = lineType === 'continuous' ? line : segments;
  }, [activeLineRef, lineType, line, segments]);

  useEffect(() => {
    // Setters bump needsUpdate themselves (pixel vs world-unit pipeline rebuild).
    matLine.worldUnits = worldUnits;
    matThresholdLine.worldUnits = worldUnits;
  }, [matLine, matThresholdLine, worldUnits]);

  useEffect(() => {
    matLine.linewidth = width;
    // The threshold overlay is exactly as wide as the hit-test margin around the
    // real line (width + threshold), so it visually frames the raycastable area.
    matThresholdLine.linewidth = width + threshold;
  }, [matLine, matThresholdLine, width, threshold]);

  useEffect(() => {
    matLine.alphaToCoverage = alphaToCoverage;
  }, [matLine, alphaToCoverage]);

  useEffect(() => {
    matThresholdLine.visible = visualizeThreshold;
  }, [matThresholdLine, visualizeThreshold]);

  // Auto-rotation + keeping each threshold twin glued to its real counterpart —
  // ported near-verbatim from the original's animate().
  useFrame(
    ({ delta }) => {
      thresholdLine.position.copy(line.position);
      thresholdLine.quaternion.copy(line.quaternion);
      thresholdSegments.position.copy(segments.position);
      thresholdSegments.quaternion.copy(segments.quaternion);

      if (animate) {
        line.rotation.y += delta * 0.1;
        segments.rotation.y = line.rotation.y;
      }
    },
    { phase: 'update' },
  );

  return (
    <>
      <primitive object={line} visible={lineType === 'continuous'} position-x={translation} />
      <primitive object={segments} visible={lineType === 'segmented'} position-x={translation} />
      <primitive object={thresholdLine} visible={lineType === 'continuous'} />
      <primitive object={thresholdSegments} visible={lineType === 'segmented'} />
    </>
  );
}

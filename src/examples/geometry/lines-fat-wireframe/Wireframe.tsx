// WireframeIcosahedron — the two comparison wireframe objects sharing one
// Icosahedron: a fat `Wireframe` (`WireframeGeometry2` + `Line2NodeMaterial`,
// instanced-quad edges with real width) and a native `LineSegments`
// (`WireframeGeometry`, gl.LINE, always 1px) that swaps between basic and dashed
// materials. Built imperatively in one `useMemo`: the addon classes take their
// geometry/material as constructor args and need a one-time `computeLineDistances()`
// call, so JSX construction would just obscure the three.js API being showcased
// (same rationale as the `lines-fat` sibling's `HilbertLines.tsx`).
//
// leva knobs land as plain material property writes in effects: `linewidth`/`scale`/
// `dashSize`/`gapSize` are reference-node-backed (re-read per frame — the leva ->
// plain-material-accessor pattern), and the `dashed` setter bumps `needsUpdate` itself.
import { useEffect, useMemo } from 'react';
import {
  IcosahedronGeometry,
  LineBasicMaterial,
  LineDashedMaterial,
  LineSegments,
  Line2NodeMaterial,
  WireframeGeometry,
} from 'three/webgpu';
import { Wireframe } from 'three/addons/lines/webgpu/Wireframe.js';
import { WireframeGeometry2 } from 'three/addons/lines/WireframeGeometry2.js';
import { useControls } from 'leva';

export type LineType = 'fat' | 'native';
export type DashRatio = '2:1' | '1:1' | '1:2';

const DASH_RATIOS: Record<DashRatio, [dashSize: number, gapSize: number]> = {
  '2:1': [2, 1],
  '1:1': [1, 1],
  '1:2': [1, 2],
};

export function WireframeIcosahedron() {
  const { lineType, width, dashed, dashScale, dashRatio } = useControls('lines-fat-wireframe', {
    lineType: {
      value: 'fat' as LineType,
      options: { 'WireframeGeometry2 (fat)': 'fat', 'gl.LINE (native)': 'native' } as Record<string, LineType>,
      label: 'line type',
    },
    width: { value: 5, min: 1, max: 10, step: 0.5, label: 'width (px)' },
    dashed: { value: false },
    dashScale: {
      value: 1,
      min: 0.5,
      max: 1,
      step: 0.1,
      label: 'dash scale',
      render: (get) => get('lines-fat-wireframe.dashed') as boolean,
    },
    dashRatio: {
      value: '1:1' as DashRatio,
      options: { '2 : 1': '2:1', '1 : 1': '1:1', '1 : 2': '1:2' } as Record<string, DashRatio>,
      label: 'dash / gap',
      render: (get) => get('lines-fat-wireframe.dashed') as boolean,
    },
  });

  const { fatWireframe, nativeWireframe, matLine, matLineBasic, matLineDashed } = useMemo(() => {
    const icosahedron = new IcosahedronGeometry(20, 1);

    // Fat wireframe: Wireframe (WireframeGeometry2, Line2NodeMaterial).
    const fatGeometry = new WireframeGeometry2(icosahedron);
    const matLine = new Line2NodeMaterial({ color: 0x4080ff, linewidth: 5, dashed: false });
    const fatWireframe = new Wireframe(fatGeometry, matLine);
    fatWireframe.computeLineDistances();

    // Native wireframe: LineSegments (WireframeGeometry, classic Line materials) —
    // gl.LINE, always 1px regardless of `linewidth`.
    const nativeGeometry = new WireframeGeometry(icosahedron);
    const matLineBasic = new LineBasicMaterial({ color: 0x4080ff });
    const matLineDashed = new LineDashedMaterial({ scale: 2, dashSize: 1, gapSize: 1 });

    // Explicit material union on the generic: the dashed toggle swaps between the two
    // materials at runtime, but LineSegments<> infers the constructor arg's narrow type.
    const nativeWireframe = new LineSegments<typeof nativeGeometry, LineBasicMaterial | LineDashedMaterial>(
      nativeGeometry,
      matLineBasic,
    );
    nativeWireframe.computeLineDistances();

    return { fatWireframe, nativeWireframe, matLine, matLineBasic, matLineDashed };
  }, []);

  useEffect(() => {
    matLine.linewidth = width;
  }, [matLine, width]);

  useEffect(() => {
    // Setter bumps needsUpdate itself (pipeline rebuild for the dashed path).
    matLine.dashed = dashed;
    nativeWireframe.material = dashed ? matLineDashed : matLineBasic;
  }, [dashed, matLine, nativeWireframe, matLineBasic, matLineDashed]);

  useEffect(() => {
    // Both dashed materials sync to the control's default (1) on mount — the
    // original's GUI never force-syncs, so `matLineDashed`'s constructor value (2)
    // silently disagrees with its own GUI default until first touch; here it doesn't.
    matLine.scale = dashScale;
    matLineDashed.scale = dashScale;
  }, [dashScale, matLine, matLineDashed]);

  useEffect(() => {
    const [dashSize, gapSize] = DASH_RATIOS[dashRatio];
    matLine.dashSize = dashSize;
    matLine.gapSize = gapSize;
    matLineDashed.dashSize = dashSize;
    matLineDashed.gapSize = gapSize;
  }, [dashRatio, matLine, matLineDashed]);

  return (
    <>
      <primitive object={fatWireframe} visible={lineType === 'fat'} />
      <primitive object={nativeWireframe} visible={lineType === 'native'} />
    </>
  );
}

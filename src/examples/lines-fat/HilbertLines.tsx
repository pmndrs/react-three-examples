// HilbertLines — the two comparison line objects sharing one Hilbert-curve dataset:
// a fat `Line2` (LineGeometry + Line2NodeMaterial, instanced quads with real width)
// and a native `Line` (gl.LINE_STRIP, always 1px) that swaps between basic and dashed
// node materials. Built imperatively in one `useMemo`: the addon classes take their
// geometry/material as constructor args and need a one-time `computeLineDistances()`
// call, so JSX construction would just obscure the three.js API being showcased.
//
// All leva knobs land as plain material property writes in effects: `linewidth`/
// `scale`/`dashSize`/`gapSize`/`dashOffset` are reference-node-backed (re-read per
// frame — the leva -> plain-material-accessor pattern), and the `worldUnits`/`dashed`/
// `alphaToCoverage` setters bump `needsUpdate` internally.
import { useEffect, useMemo } from 'react'
import {
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  Float32BufferAttribute,
  Line,
  Line2NodeMaterial,
  LineBasicNodeMaterial,
  LineDashedNodeMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three/webgpu'
import { Line2 } from 'three/addons/lines/webgpu/Line2.js'
import { LineGeometry } from 'three/addons/lines/LineGeometry.js'
import * as GeometryUtils from 'three/addons/utils/GeometryUtils.js'

export type LineType = 'fat' | 'strip'
export type DashRatio = '2:1' | '1:1' | '1:2'

const DASH_RATIOS: Record<DashRatio, [dashSize: number, gapSize: number]> = {
  '2:1': [2, 1],
  '1:1': [1, 1],
  '1:2': [1, 2],
}

// Hilbert curve -> Catmull-Rom spline -> flat position/color arrays, ported verbatim
// from the original's init(). Pure CPU data prep, runs once.
function buildLineData() {
  const points = GeometryUtils.hilbert3D(new Vector3(0, 0, 0), 20.0, 1, 0, 1, 2, 3, 4, 5, 6, 7)

  const spline = new CatmullRomCurve3(points)
  const divisions = Math.round(12 * points.length)
  const point = new Vector3()
  const lineColor = new Color()

  const positions: number[] = []
  const colors: number[] = []

  for (let i = 0; i < divisions; i++) {
    const t = i / divisions
    spline.getPoint(t, point)
    positions.push(point.x, point.y, point.z)
    lineColor.setHSL(t, 1.0, 0.5, SRGBColorSpace)
    colors.push(lineColor.r, lineColor.g, lineColor.b)
  }

  return { positions, colors }
}

export interface HilbertLinesProps {
  lineType: LineType
  worldUnits: boolean
  /** World units when `worldUnits`, pixels otherwise (Line2NodeMaterial semantics). */
  width: number
  alphaToCoverage: boolean
  dashed: boolean
  dashScale: number
  dashOffset: number
  dashRatio: DashRatio
}

export function HilbertLines({
  lineType,
  worldUnits,
  width,
  alphaToCoverage,
  dashed,
  dashScale,
  dashOffset,
  dashRatio,
}: HilbertLinesProps) {
  const { fatLine, stripLine, matLine, matLineBasic, matLineDashed } = useMemo(() => {
    const { positions, colors } = buildLineData()

    // Fat line: Line2 (LineGeometry, Line2NodeMaterial).
    const fatGeometry = new LineGeometry()
    fatGeometry.setPositions(positions)
    fatGeometry.setColors(colors)

    const matLine = new Line2NodeMaterial({
      color: 0xffffff,
      linewidth: 5, // world units with size attenuation, pixels otherwise
      vertexColors: true,
      dashed: false,
      alphaToCoverage: false,
    })

    const fatLine = new Line2(fatGeometry, matLine)
    fatLine.computeLineDistances()

    // Native line: THREE.Line (BufferGeometry, LineBasicNodeMaterial) — gl.LINE_STRIP.
    const stripGeometry = new BufferGeometry()
    stripGeometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    stripGeometry.setAttribute('color', new Float32BufferAttribute(colors, 3))

    const matLineBasic = new LineBasicNodeMaterial({ vertexColors: true })
    const matLineDashed = new LineDashedNodeMaterial({ vertexColors: true, scale: 1, dashSize: 1, gapSize: 1 })

    // Explicit material union on the generic: the dashed toggle swaps between the two
    // materials at runtime, but Line<> infers the constructor arg's narrow type.
    const stripLine = new Line<BufferGeometry, LineBasicNodeMaterial | LineDashedNodeMaterial>(
      stripGeometry,
      matLineBasic,
    )
    stripLine.computeLineDistances()

    return { fatLine, stripLine, matLine, matLineBasic, matLineDashed }
  }, [])

  useEffect(() => {
    // Setter bumps needsUpdate itself (pipeline rebuild: pixel vs world-unit path).
    matLine.worldUnits = worldUnits
  }, [matLine, worldUnits])

  useEffect(() => {
    matLine.linewidth = width
  }, [matLine, width])

  useEffect(() => {
    // Setter bumps needsUpdate itself (multisample pipeline state).
    matLine.alphaToCoverage = alphaToCoverage
  }, [matLine, alphaToCoverage])

  useEffect(() => {
    matLine.dashed = dashed
    stripLine.material = dashed ? matLineDashed : matLineBasic
  }, [dashed, matLine, stripLine, matLineBasic, matLineDashed])

  useEffect(() => {
    matLine.scale = dashScale
    matLineDashed.scale = dashScale
  }, [dashScale, matLine, matLineDashed])

  useEffect(() => {
    matLine.dashOffset = dashOffset
    matLineDashed.dashOffset = dashOffset
  }, [dashOffset, matLine, matLineDashed])

  useEffect(() => {
    const [dashSize, gapSize] = DASH_RATIOS[dashRatio]
    matLine.dashSize = dashSize
    matLine.gapSize = gapSize
    matLineDashed.dashSize = dashSize
    matLineDashed.gapSize = gapSize
  }, [dashRatio, matLine, matLineDashed])

  return (
    <>
      <primitive object={fatLine} visible={lineType === 'fat'} />
      <primitive object={stripLine} visible={lineType === 'strip'} />
    </>
  )
}

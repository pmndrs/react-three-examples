// The original's procedural presentation floor: a transparent circle whose
// colorNode draws a dotted grid (squares at cell centers + thin lines) with
// screen-space-derivative antialiasing and a radial fade to nothing.
// Straight port of the original's `createGridPlane()` TSL graph; the Fn
// parameters are folded into build-time constants (see header DIVERGENCE).
import { useMemo } from 'react'
import { abs, float, fract, fwidth, length, max, mix, positionWorld, smoothstep, vec4 } from 'three/tsl'

const GRID_SIZE = 1.0
const DOT_WIDTH = 0.03
const LINE_WIDTH = 0.005
const FADE_RADIUS = 30.0
const FADE_FALLOFF = 20.0

export function GridPlane() {
  const colorNode = useMemo(() => {
    const coord = positionWorld.xz.div(GRID_SIZE)
    const grid = fract(coord)

    // Screen-space derivative for automatic antialiasing.
    const fw = fwidth(coord)
    const smoothing = max(fw.x, fw.y).mul(0.5)

    // Squares at cell centers.
    const squareDist = max(abs(grid.x.sub(0.5)), abs(grid.y.sub(0.5)))
    const dots = smoothstep(smoothing.add(DOT_WIDTH), float(DOT_WIDTH).sub(smoothing), squareDist)

    // Grid lines.
    const lineX = smoothstep(smoothing.add(LINE_WIDTH), float(LINE_WIDTH).sub(smoothing), abs(grid.x.sub(0.5)))
    const lineZ = smoothstep(smoothing.add(LINE_WIDTH), float(LINE_WIDTH).sub(smoothing), abs(grid.y.sub(0.5)))
    const lines = max(lineX, lineZ)

    const gridPattern = max(dots, lines)
    const radialGradient = smoothstep(FADE_RADIUS, FADE_RADIUS - FADE_FALLOFF, length(positionWorld))

    // Original chains `gridPattern.mix(base, grid)` — chained .mix is mixElement,
    // the CALLING node is the interpolation factor; written functionally here
    // (.mix is also missing from @types' fluent surface).
    const baseColor = vec4(1.0, 1.0, 1.0, 0.0)
    const gridColor = vec4(0.5, 0.5, 0.5, 1.0)
    return mix(baseColor, gridColor, gridPattern).mul(radialGradient)
  }, [])

  return (
    <mesh rotation-x={-Math.PI / 2} renderOrder={-1}>
      <circleGeometry args={[40]} />
      <meshBasicNodeMaterial transparent colorNode={colorNode} />
    </mesh>
  )
}

// <DemoHelpers> — the Poimandres baseline demo furniture (SPEC §8).
// A visible, generic, toggleable component: infinite grid + camera controls,
// with an inspector/perf slot to come. Examples opt out per-prop when the
// original look demands it.
import { Grid } from '@react-three/drei/webgpu'
import { CameraControls } from './CameraControls'

export interface DemoHelpersProps {
  /** Infinite ground grid. Default on. */
  grid?: boolean
  /** camera-controls orbit controls. Default on. */
  controls?: boolean
  /** Orbit/look-at target. */
  target?: [number, number, number]
}

export function DemoHelpers({ grid = true, controls = true, target }: DemoHelpersProps) {
  return (
    <>
      {grid && (
        <Grid
          position={[0, 0.002, 0]}
          infiniteGrid
          cellSize={0.5}
          sectionSize={2.5}
          // Sub-pixel thin lines shimmer worst under WGSL's coarse fwidth derivatives
          // (drei Grid TSL port; upstream) — keep thickness ≥1 and fade before moiré range.
          cellThickness={1}
          sectionThickness={1.4}
          cellColor="#7a7a7a"
          sectionColor="#5f5f5f"
          fadeDistance={28}
          fadeStrength={1.5}
        />
      )}
      {controls && <CameraControls target={target} />}
    </>
  )
}

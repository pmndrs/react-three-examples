// <DemoHelpers> — the Poimandres baseline demo furniture (SPEC §8).
// A visible, generic, toggleable component: infinite grid + camera controls,
// with an inspector/perf slot to come. Examples opt out per-prop when the
// original look demands it.
import { Grid } from '@react-three/drei/webgpu'
import { CameraControls, type CameraControlsProps } from './CameraControls'
import { ReadinessSignal } from './ReadinessSignal'

export interface DemoHelpersProps {
  /** Infinite ground grid. Default on. */
  grid?: boolean
  /** camera-controls orbit controls. Default on. */
  controls?: boolean
  /** Orbit/look-at target. */
  target?: [number, number, number]
  /** Dolly-in limit, forwarded to CameraControls. */
  minDistance?: number
  /** Dolly-out limit, forwarded to CameraControls. */
  maxDistance?: number
  /** Allow panning; false = orbit/dolly only. Forwarded to CameraControls. */
  pan?: boolean
  /** Continuous auto-orbit. Forwarded to CameraControls. */
  autoRotate?: boolean
  /** OrbitControls-compatible auto-orbit speed (2 ≈ 30s/orbit). */
  autoRotateSpeed?: number
  /** Escape hatch to the live camera-controls instance (fitToBox/setLookAt/…). */
  controlsRef?: CameraControlsProps['controlsRef']
}

// Test-only escape hatch: `?nogrid` suppresses the grid regardless of props. CI uses
// it for examples hitting the SwiftShader stall (Grid + custom node graph hangs
// pipeline compile on software Vulkan — see docs/HANDOFF.md); also the bisection
// probe for that bug. Read once at module load; not part of the component API.
const NOGRID_OVERRIDE =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('nogrid')

export function DemoHelpers({
  grid = true,
  controls = true,
  target,
  minDistance,
  maxDistance,
  pan,
  autoRotate,
  autoRotateSpeed,
  controlsRef,
}: DemoHelpersProps) {
  return (
    <>
      {grid && !NOGRID_OVERRIDE && (
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
      {controls && (
        <CameraControls
          target={target}
          minDistance={minDistance}
          maxDistance={maxDistance}
          pan={pan}
          autoRotate={autoRotate}
          autoRotateSpeed={autoRotateSpeed}
          controlsRef={controlsRef}
        />
      )}
      <ReadinessSignal />
    </>
  )
}

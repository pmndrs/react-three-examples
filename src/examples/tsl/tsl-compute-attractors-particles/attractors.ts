// Shared attractor constants for tsl-compute-attractors-particles: default
// positions (leva seeds + uniformArray seeds) and the fixed rotation axes
// (the original edits these live with TransformControls gizmos — see the
// DIVERGENCE block in the entry file). Module-scope Vector3s are setup
// constants, never mutated — consumers clone before writing.
import { Vector3 } from 'three/webgpu'

export const ATTRACTOR_DEFAULT_POSITIONS: readonly Vector3[] = [
  new Vector3(-1, 0, 0),
  new Vector3(1, 0, -0.5),
  new Vector3(0, 0.5, 1),
]

export const ATTRACTOR_ROTATION_AXES: readonly Vector3[] = [
  new Vector3(0, 1, 0),
  new Vector3(0, 1, 0),
  new Vector3(1, 0, -0.5).normalize(),
]

export const ATTRACTOR_COUNT = ATTRACTOR_DEFAULT_POSITIONS.length

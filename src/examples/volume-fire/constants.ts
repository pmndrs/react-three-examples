// Shared constants for the volume-fire fluid simulation — grid resolution, world-space
// volume box, and the fixed physical/lighting parameters this port keeps at the
// original's defaults instead of exposing in the (reduced) leva panel.

// Voxel grid of the fluid simulation (~2M cells).
export const GRID_SIZE_X = 100
export const GRID_SIZE_Y = 100
export const GRID_SIZE_Z = 200
export const CELL_COUNT = GRID_SIZE_X * GRID_SIZE_Y * GRID_SIZE_Z
export const TEXEL_X = 1 / GRID_SIZE_X
export const TEXEL_Y = 1 / GRID_SIZE_Y
export const TEXEL_Z = 1 / GRID_SIZE_Z

// Jacobi pressure-solve iterations (keep even — the ping-pong must land back on A).
export const PRESSURE_ITERATIONS = 2

// World-space size of the volume box.
export const VOLUME_WORLD_SIZE_X = 12
export const VOLUME_WORLD_SIZE_Y = 12
export const VOLUME_WORLD_SIZE_Z = 24
export const VOLUME_WORLD_SIZE_DIAGONAL = Math.sqrt(
  VOLUME_WORLD_SIZE_X ** 2 + VOLUME_WORLD_SIZE_Y ** 2 + VOLUME_WORLD_SIZE_Z ** 2,
)

// Scene placement (original: volume box lifted 0.4 above its half-height, floor at 0.8).
export const VOLUME_MESH_Y = VOLUME_WORLD_SIZE_Y / 2 + 0.4
export const FLOOR_Y = -VOLUME_WORLD_SIZE_Y / 2 + 0.4 + VOLUME_WORLD_SIZE_Y / 2 + 0.4 // = 0.8

// Key light position (original computes it from the volume size — resolved here).
export const KEY_LIGHT_POS: [number, number, number] = [
  -3 * (VOLUME_WORLD_SIZE_X / 8),
  6 * (VOLUME_WORLD_SIZE_Y / 8) + VOLUME_WORLD_SIZE_Y / 2 + 0.4,
  3 * (VOLUME_WORLD_SIZE_Z / 8),
]

// The volumetric mesh renders ONLY in the half-resolution volumetric pass (layer 10);
// everything else stays on the default layer 0 for the main scene pass.
export const LAYER_VOLUMETRIC_LIGHTING = 10

// Fixed simulation timestep (the frame loop accumulates real time into these steps).
export const SIM_STEP = 1 / 120
export const MAX_SUBSTEPS = 8

// --- Fixed parameters (original GUI knobs this port pins at their defaults) ---

// Fluid forces
export const SMOKE_WEIGHT = 0.15 // smoke weight (pulls down)
export const TURBULENCE_DECAY = 0.1 // turbulence decay rate over age
export const TURB_FREQUENCY = 10.0 // curl-noise force frequency
export const VEL_DAMPING = 0.25 // velocity dissipation /s
export const MOTION_BOOST = 0.25 // emission boost when the teapot moves
export const WIND_STRENGTH = 6.5 // wind force while dragging the teapot

// Volume shading
export const FIRE_INTENSITY = 40.0
export const SHADOW_ABSORPTION = 2.0
export const SHADOW_AMBIENT = 0.5
export const PHASE_ASYMMETRY = 0.0 // Henyey-Greenstein g
export const POWDER_STRENGTH = 0.59
export const MULTI_SCATTERING = 1.0

// Fire point light (capsule falloff + projected flicker pattern)
export const PL_VOLUME_INTENSITY = 2.0
export const PL_SURFACE_INTENSITY = 10.0
export const LIGHT_NEAR_INTENSITY = 10.0
export const LIGHT_FAR_INTENSITY = 15.0
export const LIGHT_FAR_DISTANCE = 10.0
export const PL_PROJECTION_RADIUS = 20.0
export const PL_PROJECTION_FREQUENCY = 0.2
export const PL_PROJECTION_NOISE_FADE = 17.0
export const PL_PROJECTION_CENTER_FADE = 3.25

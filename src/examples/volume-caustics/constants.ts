// Shared constants for volume-caustics: asset URLs and the volumetric-lighting
// render layer index, ported verbatim from the original's LAYER_VOLUMETRIC_LIGHTING.
export const DUCK_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/duck.glb'
export const CAUSTIC_MAP_URL =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/opengameart/Caustic_Free.jpg'

// Objects/lights on this layer render ONLY in the half-resolution volumetric pass,
// not the main scene pass (see VolumeCaustics.tsx's useRenderPipeline setup).
export const LAYER_VOLUMETRIC_LIGHTING = 10

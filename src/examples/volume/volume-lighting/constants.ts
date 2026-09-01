// Spot light "cookie" texture and the volumetric-lighting render layer index, ported
// verbatim from the original's LAYER_VOLUMETRIC_LIGHTING.
export const COLORS_MAP_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/colors.png'

// The fog box is exclusively on this layer (disableAll + enable — volumetric-pass-only,
// same as volume-caustics' fog box). The point/spot lights instead ADD this layer to
// their default membership (enable only, no disableAll), so they keep casting real
// shadows in the main pass while also illuminating the volumetric-only pass.
export const LAYER_VOLUMETRIC_LIGHTING = 10

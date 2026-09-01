// The volumetric-lighting render layer index, ported verbatim from the original's
// LAYER_VOLUMETRIC_LIGHTING. The fog box is exclusively on this layer (disableAll +
// enable); the three RectAreaLights ADD it to their default membership (enable only),
// so they keep lighting the knot in the main pass while also illuminating the fog.
export const LAYER_VOLUMETRIC_LIGHTING = 10

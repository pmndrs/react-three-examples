// Spot light "cookie" texture (shared asset with volume-lighting/volume-lighting-rectarea)
// and the Halton (base 2, 3) jitter sequence — ported verbatim from the original's
// `halton()`. It matches TRAA's own 32-sample Halton jitter, so the volumetric fog's
// per-frame dither offset accumulates cleanly across TRAA's temporal history instead of
// fighting it with an uncorrelated random sequence.
export const COLORS_MAP_URL = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/textures/colors.png';

function halton(index: number, base: number) {
  let result = 0;
  let f = 1;
  while (index > 0) {
    f /= base;
    result += f * (index % base);
    index = Math.floor(index / base);
  }
  return result;
}

export const HALTON_OFFSETS: [number, number][] = Array.from({ length: 32 }, (_, i) => [
  halton(i + 1, 2),
  halton(i + 1, 3),
]);

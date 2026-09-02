// The MaterialX Standard Surface samples the original demo loads: the MaterialX
// project's own reference set (GitHub raw, since three.js doesn't vendor them) plus
// 19 smaller feature-test files three.js ships alongside its examples. Commented-out
// entries in the original (glass, look_*, thin_film, greysphere, chess_set, default)
// are skipped there too — dropped here rather than ported "off".
//
// Three reference samples are ALSO dropped here (brass_tiled, brick_procedural,
// wood_tiled): their `.mtlx` documents reference sibling texture files by bare
// filename (e.g. `brass_color.jpg`), which `MaterialXLoader` resolves relative to the
// `.mtlx`'s own directory — but in the upstream MaterialX repo those images actually
// live under a sibling `resources/Images/` folder, not next to the `.mtlx`. That's a
// broken relative path in the UPSTREAM reference content itself (not a jsdelivr/CDN
// gap — verified via the GitHub API against the live repo), so the original demo 404s
// on these three today too. Ported here as "genuinely unavailable" (AGENTS.md §
// Assets) rather than fabricating a corrected path.
export interface MaterialXSample {
  file: string;
  path: string;
}

const MATERIALX_REFERENCE_PATH =
  'https://raw.githubusercontent.com/materialx/MaterialX/main/resources/Materials/Examples/StandardSurface/';
const THREEJS_LOCAL_PATH = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/materialx/';

const REFERENCE_SAMPLES = [
  'standard_surface_carpaint.mtlx',
  'standard_surface_chrome.mtlx',
  'standard_surface_copper.mtlx',
  'standard_surface_gold.mtlx',
  'standard_surface_jade.mtlx',
  'standard_surface_marble_solid.mtlx',
  'standard_surface_metal_brushed.mtlx',
  'standard_surface_plastic.mtlx',
  'standard_surface_velvet.mtlx',
];

const LOCAL_SAMPLES = [
  'heightnormal.mtlx',
  'conditional_if_float.mtlx',
  'image_transform.mtlx',
  'color3_vec3_cm_test.mtlx',
  'rotate2d_test.mtlx',
  'rotate3d_test.mtlx',
  'heighttonormal_normal_input.mtlx',
  'roughness_test.mtlx',
  'opacity_test.mtlx',
  'opacity_only_test.mtlx',
  'specular_test.mtlx',
  'ior_test.mtlx',
  'combined_test.mtlx',
  'texture_opacity_test.mtlx',
  'transmission_test.mtlx',
  'transmission_only_test.mtlx',
  'transmission_rough.mtlx',
  'thin_film_rainbow_test.mtlx',
  'thin_film_ior_clamp_test.mtlx',
  'sheen_test.mtlx',
];

export const MATERIALX_SAMPLES: MaterialXSample[] = [
  ...REFERENCE_SAMPLES.map((file) => ({ file, path: MATERIALX_REFERENCE_PATH })),
  ...LOCAL_SAMPLES.map((file) => ({ file, path: THREEJS_LOCAL_PATH })),
];

const COLUMN_COUNT = 6;
const DIST_X = 3;
const DIST_Z = 3;

// Ported from the original's `updateModelsAlign()` — a fixed 6-column grid, centered
// on the origin (the original recomputes this on every load; since the sample count
// here never changes at runtime, it collapses to one function of `index`).
export function sampleGridPosition(index: number, total: number): [number, number, number] {
  const lineCount = Math.floor(total / COLUMN_COUNT) - 1.5;
  const offsetX = DIST_X * (COLUMN_COUNT - 1) * -0.5;
  const offsetZ = DIST_Z * lineCount * 0.5;

  const x = (index % COLUMN_COUNT) * DIST_X + offsetX;
  const z = Math.floor(index / COLUMN_COUNT) * -DIST_Z + offsetZ;

  return [x, 0, z];
}

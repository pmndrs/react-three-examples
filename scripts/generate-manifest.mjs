// One-shot generator: adds `category` to every entry in src/examples.json and
// normalises the tag vocabulary. Re-run after adding/renaming examples in
// examples.json; CATEGORY_MAP below is the source of truth since examples live
// FLAT under src/examples/<slug>(/<slug>).tsx today — there is no category
// folder to read the value from (see docs/SITE.md "Category data" for why).
//
// Usage: node scripts/generate-manifest.mjs [--check]
//   --check   exit 1 if applying the maps would change the file (CI-friendly,
//             catches an example added to examples.json without a category).

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const MANIFEST_PATH = fileURLToPath(new URL('../src/examples.json', import.meta.url))

// The 15 categories (AGENTS.md § Files, routes, manifest), alphabetical.
const CATEGORIES = [
  'animation',
  'camera',
  'compute',
  'geometry',
  'lights',
  'loaders',
  'materials',
  'postprocessing',
  'reflections',
  'render-targets',
  'scene',
  'shadows',
  'textures',
  'tsl',
  'volume',
]

// slug -> category. Derived by hand from each example's original three.js
// example name (the `#webgpu_<category>_<name>` anchor in `original`) plus
// judgment for slugs with no category-shaped prefix (backdrop, sky, layers,
// occlusion, fog-*, tonemapping, ...). Grouped here by category so additions
// are easy to place and the 15-way split is easy to eyeball.
const CATEGORY_MAP = {
  // animation
  'animation-skinning-blending': 'animation',
  'animation-retargeting': 'animation',
  'skinning-instancing': 'animation',
  'skinning-points': 'animation',
  morphtargets: 'animation',

  // camera
  camera: 'camera',
  'camera-array': 'camera',

  // compute
  'compute-texture': 'compute',
  'compute-particles': 'compute',
  'compute-particles-rain': 'compute',
  'compute-particles-snow': 'compute',
  'compute-water': 'compute',
  'compute-birds': 'compute',
  'compute-cloth': 'compute',
  'compute-points': 'compute',
  'compute-geometry': 'compute',
  'compute-texture-pingpong': 'compute',
  'compute-texture-3d': 'compute',

  // geometry (instancing / primitives / batching demos)
  'instance-mesh': 'geometry',
  'instance-uniform': 'geometry',
  'instance-points': 'geometry',
  'instance-sprites': 'geometry',
  'mesh-batch': 'geometry',
  'lines-fat': 'geometry',
  'geometry-loft': 'geometry',
  sprites: 'geometry',

  // lights
  'lights-rectarealight': 'lights',
  'lights-spotlight': 'lights',
  'lights-pointlights': 'lights',
  'lights-phong': 'lights',
  'lights-selective': 'lights',
  'lights-ies-spotlight': 'lights',
  'lights-projector': 'lights',
  'lights-physical': 'lights',
  lensflares: 'lights',

  // loaders
  'loader-gltf': 'loaders',
  'loader-gltf-transmission': 'loaders',
  'loader-gltf-iridescence': 'loaders',
  'loader-gltf-sheen': 'loaders',
  'loader-gltf-anisotropy': 'loaders',
  'loader-gltf-dispersion': 'loaders',
  'loader-gltf-compressed': 'loaders',

  // materials
  refraction: 'materials',
  clipping: 'materials',
  'materials-envmaps': 'materials',
  'materials-displacementmap': 'materials',
  'materials-basic': 'materials',
  'materials-matcap': 'materials',
  'materials-toon': 'materials',
  clearcoat: 'materials',
  'materials-sss': 'materials',
  'materials-transmission': 'materials',
  'materials-alphahash': 'materials',
  'materials-envmaps-groundprojected': 'materials',
  'materials-lightmap': 'materials',
  'parallax-uv': 'materials',
  'materials-arrays': 'materials',
  'materials-video': 'materials',
  'materials-texture-manualmipmap': 'materials',
  'materials-cubemap-mipmaps': 'materials',

  // postprocessing
  'postprocessing-bloom-emissive': 'postprocessing',
  postprocessing: 'postprocessing',
  'postprocessing-dof': 'postprocessing',
  'postprocessing-pixel': 'postprocessing',
  'postprocessing-ao': 'postprocessing',
  'postprocessing-afterimage': 'postprocessing',
  'postprocessing-outline': 'postprocessing',
  'postprocessing-motion-blur': 'postprocessing',
  'postprocessing-godrays': 'postprocessing',
  'postprocessing-sobel': 'postprocessing',
  'postprocessing-fxaa': 'postprocessing',
  'postprocessing-smaa': 'postprocessing',
  'postprocessing-ca': 'postprocessing',
  'postprocessing-bloom': 'postprocessing',
  'postprocessing-bloom-selective': 'postprocessing',
  'postprocessing-anamorphic': 'postprocessing',
  'postprocessing-lensflare': 'postprocessing',

  // reflections
  reflection: 'reflections',
  mirror: 'reflections',
  'cubemap-dynamic': 'reflections',
  'pmrem-equirectangular': 'reflections',
  'reflection-blurred': 'reflections',

  // render-targets
  rtt: 'render-targets',
  'depth-texture': 'render-targets',
  portal: 'render-targets',
  mrt: 'render-targets',
  'mrt-mask': 'render-targets',
  'multiple-rendertargets': 'render-targets',
  'multiple-rendertargets-readback': 'render-targets',
  'rendertarget-2d-array-3d': 'render-targets',

  // scene (backdrop/fog/atmosphere/global-setting demos with no sharper home)
  'hello-webgpu': 'scene',
  sky: 'scene',
  tonemapping: 'scene',
  backdrop: 'scene',
  'backdrop-water': 'scene',
  'backdrop-area': 'scene',
  'fog-height': 'scene',
  'custom-fog': 'scene',
  occlusion: 'scene',
  layers: 'scene',

  // shadows
  'shadow-contact': 'shadows',
  shadowmap: 'shadows',
  'shadowmap-pointlight': 'shadows',
  'shadowmap-vsm': 'shadows',
  'shadowmap-opacity': 'shadows',
  'shadowmap-array': 'shadows',
  'shadowmap-csm': 'shadows',
  'shadowmap-progressive': 'shadows',

  // textures
  'procedural-texture': 'textures',
  'video-panorama': 'textures',
  'textures-anisotropy': 'textures',
  'textures-partialupdate': 'textures',
  'textures-2d-array': 'textures',
  'textures-2d-array-compressed': 'textures',

  // tsl (three.js's own "tsl_*" showcase family — node-graph/shader demos
  // whose subject IS TSL rather than a more specific technique)
  'tsl-halftone': 'tsl',
  'tsl-earth': 'tsl',
  'tsl-galaxy': 'tsl',
  'tsl-procedural-terrain': 'tsl',
  'tsl-raging-sea': 'tsl',
  'tsl-compute-attractors-particles': 'tsl',
  'tsl-vfx-tornado': 'tsl',
  'tsl-vfx-flames': 'tsl',
  'tsl-angular-slicing': 'tsl',
  'tsl-wood': 'tsl',
  ocean: 'tsl',

  // volume
  'volume-cloud': 'volume',
  'volume-perlin': 'volume',
  'volume-caustics': 'volume',
  'volume-lighting': 'volume',
  'volume-lighting-rectarea': 'volume',
  'volume-fire': 'volume',
}

// Tag vocabulary normalisation. Two kinds of entries:
//  - semantic duplicates (two spellings of the same concept) -> merged to one
//  - camelCase/smashed-compound outliers -> kebab-cased to match the other ~165 tags
// `null` means "drop this tag" (redundant given every example in this repo is WebGPU).
const TAG_RENAME = {
  'post-processing': 'postprocessing',
  shadow: 'shadows',
  texture: 'textures',
  reflector: 'reflection',
  glTF: 'gltf',
  'compressed-textures': 'compression',
  'data-3d-texture': '3d-texture',
  envmap: 'environment',
  'render-to-texture': 'render-target',
  lightsNode: 'lights-node',
  castShadowNode: 'cast-shadow-node',
  cameraHelper: 'camera-helper',
  tileshadownode: 'tile-shadow-node',
  geometrynode: 'geometry-node',
  instancedarray: 'instanced-array',
  objectloader: 'object-loader',
  transformcontrols: 'transform-controls',
  masknode: 'mask-node',
  batchedmesh: 'batched-mesh',
  arraycamera: 'array-camera',
  cubecamera: 'cube-camera',
  hemispherelight: 'hemisphere-light',
  pointlight: 'point-light',
  rectarealight: 'rectarea-light',
  spotlight: 'spot-light',
  webgpu: null,
}

function applyTags(tags) {
  const renamed = tags.map((t) => (t in TAG_RENAME ? TAG_RENAME[t] : t)).filter((t) => t !== null)
  return [...new Set(renamed)].sort((a, b) => a.localeCompare(b))
}

function main() {
  const raw = readFileSync(MANIFEST_PATH, 'utf-8')
  const examples = JSON.parse(raw)

  const missing = examples.filter((e) => !(e.slug in CATEGORY_MAP))
  if (missing.length > 0) {
    console.error(
      `${missing.length} example(s) have no category mapping — add them to CATEGORY_MAP:\n` +
        missing.map((e) => `  ${e.slug}`).join('\n'),
    )
    process.exit(1)
  }
  const unknownCategory = Object.entries(CATEGORY_MAP).filter(([, c]) => !CATEGORIES.includes(c))
  if (unknownCategory.length > 0) {
    console.error(`Unknown category value(s): ${unknownCategory.map(([s, c]) => `${s}->${c}`).join(', ')}`)
    process.exit(1)
  }

  const tagMergeCounts = new Map()
  const next = examples.map((e) => {
    const category = CATEGORY_MAP[e.slug]
    const tags = applyTags(e.tags ?? [])
    for (const t of e.tags ?? []) {
      if (t in TAG_RENAME) tagMergeCounts.set(t, (tagMergeCounts.get(t) ?? 0) + 1)
    }
    // Preserve field order: slug, title, category, tags, then whatever else was there.
    const { slug, title, tags: _oldTags, category: _oldCategory, ...rest } = e
    return { slug, title, category, tags, ...rest }
  })

  const check = process.argv.includes('--check')
  const nextJson = JSON.stringify(next, null, 2) + '\n'
  if (check) {
    if (nextJson !== raw) {
      console.error('examples.json is out of date — run `node scripts/generate-manifest.mjs`.')
      process.exit(1)
    }
    console.log('examples.json is up to date.')
    return
  }

  writeFileSync(MANIFEST_PATH, nextJson)

  const byCategory = new Map()
  for (const e of next) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + 1)
  console.log(`Wrote ${next.length} examples across ${byCategory.size} categories:`)
  for (const c of CATEGORIES) console.log(`  ${c}: ${byCategory.get(c) ?? 0}`)

  const allTagsBefore = new Set(examples.flatMap((e) => e.tags ?? []))
  const allTagsAfter = new Set(next.flatMap((e) => e.tags))
  console.log(`\nTags: ${allTagsBefore.size} -> ${allTagsAfter.size} distinct.`)
  console.log('Merged/renamed tag occurrences:')
  for (const [from, count] of [...tagMergeCounts.entries()].sort()) {
    console.log(`  ${from} -> ${TAG_RENAME[from] ?? '(dropped)'}  (${count}x)`)
  }
}

main()

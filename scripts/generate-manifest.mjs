// Generator: adds `category` to every entry in src/examples.json and normalises the
// tag vocabulary. Re-run after adding, renaming or MOVING an example.
//
// Category is READ FROM DISK — an example's category is the folder it lives in
// (`src/examples/<category>/…`), so moving a file is the only edit needed and the
// manifest cannot drift from the layout. (An earlier draft hand-maintained a
// slug -> category table; that was written before the category reorg landed.)
//
// Usage: node scripts/generate-manifest.mjs [--check]
//   --check   exit 1 if applying the maps would change the file (CI-friendly,
//             catches an example added to examples.json without a category).

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MANIFEST_PATH = fileURLToPath(new URL('../src/examples.json', import.meta.url));

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
];

// slug -> category. Derived by hand from each example's original three.js
// example name (the `#webgpu_<category>_<name>` anchor in `original`) plus
// judgment for slugs with no category-shaped prefix (backdrop, sky, layers,
// occlusion, fog-*, tonemapping, ...). Grouped here by category so additions
// are easy to place and the 15-way split is easy to eyeball.
const EXAMPLES_DIR = fileURLToPath(new URL('../src/examples', import.meta.url));

/** slug -> category, read off the folder each entry file lives in. */
function categoriesFromDisk(slugs) {
  const found = new Map();
  for (const category of readdirSync(EXAMPLES_DIR)) {
    const categoryDir = join(EXAMPLES_DIR, category);
    if (!statSync(categoryDir).isDirectory()) continue;
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!name.endsWith('.tsx')) continue;
        // Entry files are the ones whose BASENAME is a registered slug; siblings
        // (subcomponents) are ignored automatically. Same rule as src/app/routes.ts.
        const slug = name.slice(0, -'.tsx'.length);
        if (slugs.has(slug)) found.set(slug, category);
      }
    };
    walk(categoryDir);
  }
  return found;
}

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
};

function applyTags(tags) {
  const renamed = tags.map((t) => (t in TAG_RENAME ? TAG_RENAME[t] : t)).filter((t) => t !== null);
  return [...new Set(renamed)].sort((a, b) => a.localeCompare(b));
}

function main() {
  const raw = readFileSync(MANIFEST_PATH, 'utf-8');
  const examples = JSON.parse(raw);

  const slugs = new Set(examples.map((e) => e.slug));
  const categoryBySlug = categoriesFromDisk(slugs);

  const missing = examples.filter((e) => !categoryBySlug.has(e.slug));
  if (missing.length > 0) {
    console.error(
      `${missing.length} manifest entr(ies) have no entry file under src/examples/<category>/:\n` +
        missing.map((e) => `  ${e.slug}`).join('\n'),
    );
    process.exit(1);
  }
  const unknownCategory = [...categoryBySlug.entries()].filter(([, c]) => !CATEGORIES.includes(c));
  if (unknownCategory.length > 0) {
    console.error(
      `Example(s) live in a folder that is not a known category: ` +
        unknownCategory.map(([s, c]) => `${s} -> ${c}`).join(', '),
    );
    process.exit(1);
  }

  const tagMergeCounts = new Map();
  const next = examples.map((e) => {
    const category = categoryBySlug.get(e.slug);
    const tags = applyTags(e.tags ?? []);
    for (const t of e.tags ?? []) {
      if (t in TAG_RENAME) tagMergeCounts.set(t, (tagMergeCounts.get(t) ?? 0) + 1);
    }
    // Preserve field order: slug, title, category, tags, then whatever else was there.
    const { slug, title, tags: _oldTags, category: _oldCategory, ...rest } = e;
    return { slug, title, category, tags, ...rest };
  });

  const check = process.argv.includes('--check');
  const nextJson = JSON.stringify(next, null, 2) + '\n';
  if (check) {
    if (nextJson !== raw) {
      console.error('examples.json is out of date — run `node scripts/generate-manifest.mjs`.');
      process.exit(1);
    }
    console.log('examples.json is up to date.');
    return;
  }

  writeFileSync(MANIFEST_PATH, nextJson);

  const byCategory = new Map();
  for (const e of next) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + 1);
  console.log(`Wrote ${next.length} examples across ${byCategory.size} categories:`);
  for (const c of CATEGORIES) console.log(`  ${c}: ${byCategory.get(c) ?? 0}`);

  const allTagsBefore = new Set(examples.flatMap((e) => e.tags ?? []));
  const allTagsAfter = new Set(next.flatMap((e) => e.tags));
  console.log(`\nTags: ${allTagsBefore.size} -> ${allTagsAfter.size} distinct.`);
  console.log('Merged/renamed tag occurrences:');
  for (const [from, count] of [...tagMergeCounts.entries()].sort()) {
    console.log(`  ${from} -> ${TAG_RENAME[from] ?? '(dropped)'}  (${count}x)`);
  }
}

main();

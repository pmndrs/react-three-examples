import examples from '../examples.json'

// The 15 example categories (AGENTS.md § Files, routes, manifest). Examples live
// FLAT under src/examples/<slug>(/<slug>).tsx — there is no category folder to read
// this from, so it's assigned in examples.json by scripts/generate-manifest.mjs
// (see docs/SITE.md "Category data" for why).
export const CATEGORIES = [
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
] as const

export type Category = (typeof CATEGORIES)[number]

// Human-readable label for a category slug — home page + sidebar group headers.
export const categoryLabels: Record<Category, string> = {
  animation: 'Animation',
  camera: 'Camera',
  compute: 'Compute',
  geometry: 'Geometry',
  lights: 'Lights',
  loaders: 'Loaders',
  materials: 'Materials',
  postprocessing: 'Postprocessing',
  reflections: 'Reflections',
  'render-targets': 'Render Targets',
  scene: 'Scene',
  shadows: 'Shadows',
  textures: 'Textures',
  tsl: 'TSL',
  volume: 'Volume',
}

// Accent color per category (hex) — spread across the wheel in CATEGORIES order, used
// by the home page's card grid and section headers. No screenshots are committed
// (screenshots/ is gitignored — see docs/SITE.md "Category data"), so this is the
// visual differentiator between categories instead of a thumbnail.
export const categoryAccent: Record<Category, string> = {
  animation: '#f97316',
  camera: '#eab308',
  compute: '#84cc16',
  geometry: '#22c55e',
  lights: '#10b981',
  loaders: '#14b8a6',
  materials: '#06b6d4',
  postprocessing: '#0ea5e9',
  reflections: '#3b82f6',
  'render-targets': '#6366f1',
  scene: '#8b5cf6',
  shadows: '#a855f7',
  textures: '#d946ef',
  tsl: '#ec4899',
  volume: '#f43f5e',
}

// Typed view over examples.json (SPEC: manifest is the agent/site backbone; schema
// hardens through M1–M2). Optional fields appear as examples fill them in.
export interface ExampleMeta {
  slug: string
  title: string
  category: Category
  tags: string[]
  /** URL of the original three.js example this ports. */
  original?: string
  /** Asset/author attribution shown in the titleblock. */
  credits?: string
  /** CI smoke-tier exception (SPEC §10): reason this example can't run on SwiftShader. */
  ciSkip?: string
  /** CI runs this example with ?nogrid (DemoHelpers grid suppressed) — SwiftShader
   * Grid+node-graph stall workaround that keeps smoke coverage. Value = reason. */
  ciNoGrid?: string
}

export const exampleMeta = examples as ExampleMeta[]
export const metaBySlug = new Map(exampleMeta.map((example) => [example.slug, example]))

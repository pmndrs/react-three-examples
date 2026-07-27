import examples from '../examples.json'

// Typed view over examples.json (SPEC: manifest is the agent/site backbone; schema
// hardens through M1–M2). Optional fields appear as examples fill them in.
export interface ExampleMeta {
  slug: string
  title: string
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

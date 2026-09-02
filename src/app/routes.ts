import { lazy, type ComponentType } from 'react'

type ExampleModule = { default: ComponentType }

// Glob-routed examples per SPEC §9: one route per file in src/examples/*.tsx,
// or per folder src/examples/*/<slug>.tsx when an example needs subcomponents.
// Route path/slug = filename (or folder name) without extension.
const fileModules = import.meta.glob<ExampleModule>('../examples/*.tsx')
const folderModules = import.meta.glob<ExampleModule>('../examples/*/*.tsx')

export interface ExampleRoute {
  slug: string
  Component: ComponentType
}

function fromFiles(modules: Record<string, () => Promise<ExampleModule>>): ExampleRoute[] {
  return Object.entries(modules).flatMap(([path, load]) => {
    const match = path.match(/\/([^/]+)\.tsx$/)
    if (!match) return []
    return [{ slug: match[1], Component: lazy(load) }]
  })
}

function fromFolders(modules: Record<string, () => Promise<ExampleModule>>): ExampleRoute[] {
  return Object.entries(modules).flatMap(([path, load]) => {
    // '../examples/<slug>/<slug>.tsx' — folder name must match the entry file name.
    const match = path.match(/\/([^/]+)\/\1\.tsx$/)
    if (!match) return []
    return [{ slug: match[1], Component: lazy(load) }]
  })
}

export const exampleRoutes: ExampleRoute[] = [...fromFiles(fileModules), ...fromFolders(folderModules)]

// slug -> repo-root-relative source path (e.g. "src/examples/sky.tsx" or
// "src/examples/animation-retargeting/animation-retargeting.tsx"), derived from the
// same glob keys the routes come from rather than a hand-maintained table. Used by
// the action bar to build "view source on GitHub" / "open in ..." links.
function repoPath(globPath: string): string {
  // globPath is relative to this file ("../examples/..."); repo root is one level up.
  return `src/examples/${globPath.slice('../examples/'.length)}`
}

export const exampleFilePaths: Map<string, string> = new Map([
  ...Object.keys(fileModules).flatMap((path) => {
    const match = path.match(/\/([^/]+)\.tsx$/)
    return match ? [[match[1], repoPath(path)] as const] : []
  }),
  ...Object.keys(folderModules).flatMap((path) => {
    const match = path.match(/\/([^/]+)\/\1\.tsx$/)
    return match ? [[match[1], repoPath(path)] as const] : []
  }),
])

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

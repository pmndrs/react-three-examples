import { lazy, type ComponentType } from 'react';
import { exampleMeta } from './manifest';

type ExampleModule = { default: ComponentType };

// Glob-routed examples (SPEC §9). Examples live in category folders —
// `src/examples/<category>/<slug>.tsx`, or `<category>/<slug>/<slug>.tsx` when an
// example needs subcomponents — but the CATEGORY NEVER APPEARS IN THE URL: the route
// is always `/examples/<slug>`.
//
// Entry files are identified by basename against the manifest rather than by path
// shape, so sibling subcomponents are ignored automatically and nesting depth can
// change without touching this file.
const modules = import.meta.glob<ExampleModule>('../examples/**/*.tsx');

const slugs = new Set(exampleMeta.map((example) => example.slug));

export interface ExampleRoute {
  slug: string;
  Component: ComponentType;
}

export const exampleRoutes: ExampleRoute[] = Object.entries(modules).flatMap(([path, load]) => {
  const slug = path.slice(path.lastIndexOf('/') + 1, -'.tsx'.length);
  if (!slugs.has(slug)) return [];
  return [{ slug, Component: lazy(load) }];
});

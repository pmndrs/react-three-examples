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

/** Entry files only: glob path -> slug, for every path whose basename is a real slug. */
const entries = Object.keys(modules).flatMap((path) => {
  const slug = path.slice(path.lastIndexOf('/') + 1, -'.tsx'.length);
  return slugs.has(slug) ? [[path, slug] as const] : [];
});

export interface ExampleRoute {
  slug: string;
  Component: ComponentType;
}

export const exampleRoutes: ExampleRoute[] = entries.map(([path, slug]) => ({
  slug,
  Component: lazy(modules[path]),
}));

// slug -> repo-root-relative source path (e.g.
// `src/examples/scene/sky.tsx`, `src/examples/scene/ocean/ocean.tsx`), derived from the
// SAME glob keys the routes come from rather than a hand-maintained table — so it stays
// correct if an example moves category or gains a subfolder. Used by the action bar to
// build "view source on GitHub" and the "open in …" deep links.
export const exampleFilePaths: Map<string, string> = new Map(
  // Glob keys are relative to this file (`../examples/…`); the repo path is `src/examples/…`.
  entries.map(([path, slug]) => [slug, `src/examples/${path.slice('../examples/'.length)}`]),
);

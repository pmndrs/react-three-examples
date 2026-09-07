import { exampleFilePaths } from './routes';

// Raw source text for every example file, loaded lazily (no `eager: true` — each entry
// is `() => Promise<string>`, only invoked when a tab is actually opened). Keyed the
// same way `routes.ts`'s module glob is, so the two stay in lockstep with the same
// glob root.
const rawModules = import.meta.glob<string>('../examples/**/*.tsx', { query: '?raw', import: 'default' });

export interface ExampleSourceFile {
  /** Repo-root-relative path, e.g. `src/examples/compute/compute-water/Water.tsx`. */
  path: string;
  /** Basename, for a tab label. */
  name: string;
  load: () => Promise<string>;
}

/**
 * Every source file for one example, entry file first then alphabetical.
 *
 * A flat example (`src/examples/<category>/<slug>.tsx`) has exactly one file. A
 * folder-based example (`src/examples/<category>/<slug>/<slug>.tsx` + siblings) is
 * detected by its entry's PARENT DIRECTORY NAME matching the slug — the same signal
 * `routes.ts` doesn't need but `generate-manifest.mjs`'s category map effectively
 * relies on — and returns every `.tsx` file in that folder, not just the entry.
 */
export function getExampleSourceFiles(slug: string): ExampleSourceFile[] {
  const entryPath = exampleFilePaths.get(slug);
  if (!entryPath) return [];

  const entrySegments = entryPath.split('/');
  const parentDirName = entrySegments[entrySegments.length - 2];
  const isFolderExample = parentDirName === slug;
  const folderPrefix = isFolderExample ? entrySegments.slice(0, -1).join('/') + '/' : null;

  const files: ExampleSourceFile[] = [];
  for (const [key, load] of Object.entries(rawModules)) {
    // Glob keys are relative to this file (`../examples/…`), matching exampleFilePaths'
    // `src/examples/…` convention once re-based.
    const repoPath = `src/examples/${key.slice('../examples/'.length)}`;
    const include = folderPrefix ? repoPath.startsWith(folderPrefix) : repoPath === entryPath;
    if (!include) continue;
    files.push({ path: repoPath, name: repoPath.slice(repoPath.lastIndexOf('/') + 1), load });
  }

  files.sort((a, b) => {
    if (a.path === entryPath) return -1;
    if (b.path === entryPath) return 1;
    return a.name.localeCompare(b.name);
  });
  return files;
}

// Shared slug selection for the screenshot + test tooling.
//
// Why this exists: before it, the only screenshot entry point captured ALL 131
// examples, so every porting agent hand-rolled its own throwaway Playwright
// script — which is what hung three agents for 10 minutes each on open-ended
// waits (HANDOFF wave 13). One selector, used by `pnpm shot` and
// `pnpm test:changed`, means nobody needs to write another one.
import { execFileSync } from 'node:child_process'
import examples from '../src/examples.json' with { type: 'json' }

const ALL = examples.map((e) => e.slug)

function git(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8' })
  } catch {
    return ''
  }
}

/** Slugs whose files are uncommitted, or committed but not yet on origin/main. */
export function changedSlugs() {
  const paths = [
    ...git(['status', '--porcelain'])
      .split('\n')
      .map((l) => l.slice(3)),
    ...git(['diff', '--name-only', 'origin/main...HEAD']).split('\n'),
  ]
  const found = new Set()
  for (const path of paths) {
    // Examples live at src/examples/<category>/<slug>.tsx or
    // <category>/<slug>/<file>. Match ANY path segment against the manifest so the
    // folder depth can change without touching this.
    if (!path.trim().startsWith('src/examples/')) continue
    for (const segment of path
      .trim()
      .replace(/\.tsx?$/, '')
      .split('/')) {
      if (ALL.includes(segment)) found.add(segment)
    }
  }
  return [...found]
}

/**
 * Resolve argv into a slug list.
 *   (no args)        -> every example
 *   --changed        -> only examples touched vs origin/main
 *   <slug> [slug...] -> exactly those (validated against the manifest)
 */
export function selectSlugs(argv = process.argv.slice(2)) {
  const args = argv.filter((a) => !a.startsWith('-'))
  if (argv.includes('--changed')) {
    const changed = changedSlugs()
    if (!changed.length) {
      console.log('No changed examples vs origin/main.')
      process.exit(0)
    }
    return changed
  }
  if (!args.length) return ALL

  const unknown = args.filter((s) => !ALL.includes(s))
  if (unknown.length) {
    console.error(`Unknown slug(s): ${unknown.join(', ')}`)
    process.exit(1)
  }
  return args
}

export { ALL as allSlugs }

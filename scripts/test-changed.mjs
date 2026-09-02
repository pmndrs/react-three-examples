// Run the smoke + animates tiers for ONLY the examples this branch touched.
//
// Usage:
//   pnpm test:changed              examples changed vs origin/main
//   pnpm test:changed <slug>...    exactly those examples
//
// Why: the full suites are ~19 min (smoke) and ~1.4h (animates) at 131
// examples, and running many heavy WebGPU examples in one process produces
// contention flakes that cost more to triage than they catch (HANDOFF wave 13).
// The full sweep belongs at wave end and in nightly CI — not in the edit loop.
import { spawnSync } from 'node:child_process';
import { selectSlugs, allSlugs } from './slugs.mjs';

const slugs = selectSlugs();

if (slugs.length === allSlugs.length) {
  console.error(
    'Refusing to run the full suite via test:changed — that is `pnpm test:smoke` /\n' +
      '`pnpm test:animates`. Pass slugs explicitly or use --changed.',
  );
  process.exit(1);
}

console.log(`Testing ${slugs.length} example(s): ${slugs.join(', ')}\n`);

let failed = false;
for (const spec of ['tests/smoke.spec.ts', 'tests/animates.spec.ts']) {
  console.log(`── ${spec} ──`);
  const result = spawnSync('npx', ['playwright', 'test', spec], {
    stdio: 'inherit',
    env: { ...process.env, SLUGS: slugs.join(',') },
  });
  if (result.status !== 0) failed = true;
}

process.exitCode = failed ? 1 : 0;

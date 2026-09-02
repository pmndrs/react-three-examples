// Tick off ported examples in docs/PORTING-BACKLOG.md.
//
// The manifest is the source of truth for "is it ported" — a slug in src/examples.json
// has a real, routed, tested example behind it. This just reflects that into the backlog
// so nobody hand-maintains checkboxes (and so a wave can't silently forget to).
//
// Usage: node scripts/tick-backlog.mjs [--check]

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import examples from '../src/examples.json' with { type: 'json' };

const PATH = fileURLToPath(new URL('../docs/PORTING-BACKLOG.md', import.meta.url));
const ported = new Set(examples.map((e) => e.slug));

const before = readFileSync(PATH, 'utf8');
let ticked = 0;
const after = before.replace(/- \[ \] `([a-z0-9-]+)`/g, (whole, slug) => {
  if (!ported.has(slug)) return whole;
  ticked++;
  return `- [x] ~~\`${slug}\`~~ — ported`;
});

const remaining = [...after.matchAll(/^- \[ \] `([a-z0-9-]+)`/gm)].length;

if (process.argv.includes('--check')) {
  if (ticked > 0) {
    console.error(`${ticked} ported example(s) still unticked — run node scripts/tick-backlog.mjs`);
    process.exit(1);
  }
  console.log(`Backlog is up to date. ${remaining} left to port.`);
} else {
  if (after !== before) writeFileSync(PATH, after);
  console.log(`Ticked ${ticked}. ${remaining} left to port.`);
}

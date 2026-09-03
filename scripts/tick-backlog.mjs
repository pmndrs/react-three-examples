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

// Phase 1 lists slugs; Phase 2 lists ORIGINAL names (`webgl_decals`) because the slug is
// derived from them. Match on either: a slug, or the manifest entry's `original` anchor.
const FILES = ['../docs/PORTING-BACKLOG.md', '../docs/PORTING-BACKLOG-PHASE2.md'].map((f) =>
  fileURLToPath(new URL(f, import.meta.url)),
);
const ported = new Set(examples.map((e) => e.slug));
for (const e of examples) {
  const anchor = e.original?.split('#')[1];
  if (anchor) ported.add(anchor);
}

const check = process.argv.includes('--check');
let totalTicked = 0;
let totalRemaining = 0;

for (const PATH of FILES) {
  const before = readFileSync(PATH, 'utf8');
  let ticked = 0;
  const after = before.replace(/- \[ \] `([a-z0-9_-]+)`/g, (whole, name) => {
    if (!ported.has(name)) return whole;
    ticked++;
    return `- [x] ~~\`${name}\`~~ — ported`;
  });
  const remaining = [...after.matchAll(/^- \[ \] `([a-z0-9_-]+)`/gm)].length;
  totalTicked += ticked;
  totalRemaining += remaining;
  if (!check && after !== before) writeFileSync(PATH, after);
}

if (check) {
  if (totalTicked > 0) {
    console.error(`${totalTicked} ported example(s) still unticked — run node scripts/tick-backlog.mjs`);
    process.exit(1);
  }
  console.log(`Backlog is up to date. ${totalRemaining} left to port.`);
} else {
  console.log(`Ticked ${totalTicked}. ${totalRemaining} left to port.`);
}

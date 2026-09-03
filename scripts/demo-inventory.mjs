// Regenerate docs/DEMO-INVENTORY.md: every r185 example in exactly one bucket.
//
// Answers "of the demos worth porting, how many do we have, and why not all?" by joining
// research/data/files_r185.json (the universe), research/webgl-unique-list.md (the dedup
// audit, Class B/C tables), both porting backlogs (struck ~~names~~ carry the decision AND
// the reason text that follows it), and src/examples.json (what is shipped, matched on the
// `original` anchor). Runs prettier on the output so `pnpm lint` stays green.
//
// Usage: pnpm inventory   (or: node scripts/demo-inventory.mjs)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const at = (p) => fileURLToPath(new URL(p, import.meta.url));
const r = JSON.parse(readFileSync(at('../research/data/files_r185.json'), 'utf8'));
const all = Object.values(r).flat();
const ALL = new Set(all);
const ex = JSON.parse(readFileSync(at('../src/examples.json'), 'utf8'));
const shipped = new Map(ex.filter((e) => e.original).map((e) => [e.original.split('#')[1], e.slug]));
const b1 = readFileSync(at('../docs/PORTING-BACKLOG.md'), 'utf8');
const b2 = readFileSync(at('../docs/PORTING-BACKLOG-PHASE2.md'), 'utf8');
const audit = readFileSync(at('../research/webgl-unique-list.md'), 'utf8');

// Join wrapped list items into one logical line so a decision word on line 3 applies to names on line 1.
const items = (txt) => {
  const out = [];
  for (const l of txt.split('\n')) {
    if (/^- \[/.test(l)) out.push(l);
    else if (out.length && /^\s{2,}\S/.test(l) && !/^\s*[-#|]/.test(l)) out[out.length - 1] += ' ' + l.trim();
    else out.push(l);
  }
  return out;
};
const slugToName = (s) => {
  const c = 'webgpu_' + s.replace(/-/g, '_');
  return ALL.has(c) ? c : null;
};
// Only STRUCK names carry a decision; shorthand (`_cloth`, `3dm`) expands against the item's own prefix.
const struck = (item) => {
  const s = new Set();
  for (const m of item.matchAll(/~~`([a-z0-9_-]+)`~~/g)) {
    const n = m[1];
    if (ALL.has(n)) {
      s.add(n);
      continue;
    }
    if (slugToName(n)) {
      s.add(slugToName(n));
      continue;
    }
    const base = [...item.matchAll(/`([a-z0-9_]+)`/g)].map((x) => x[1]).find((t) => ALL.has(t));
    const bare = n.replace(/^_/, '');
    const cands = [
      base ? base.replace(/_[a-z0-9]+$/, '_') + bare : null,
      'webgl_loader_' + bare,
      'physics_ammo_' + bare,
      'physics_' + bare,
      'misc_exporter_' + bare,
      'misc_controls_' + bare,
      'css3d_' + bare,
    ];
    for (const c of cands)
      if (c && ALL.has(c)) {
        s.add(c);
        break;
      }
  }
  return s;
};
// name -> the reason text the backlog recorded next to the decision (so the inventory can
// show WHY, not just that a reason exists). `extract` pulls it out of the joined item.
const cell = (s) => s.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
const collect = (txt, re, extract = () => '') => {
  const m = new Map();
  for (const it of items(txt)) {
    if (!re.test(it)) continue;
    const why = cell(extract(it) ?? '');
    for (const n of struck(it)) m.set(n, why);
  }
  return m;
};
const paren = (word) => (it) => it.match(new RegExp(word + ' \\((.*?)\\)'))?.[1];
const afterSkip = (it) => it.match(/\*\*SKIP\*\*:?\s*(.*)$/)?.[1];
const section = (a, b) => {
  const i = audit.indexOf(a);
  const j = b ? audit.indexOf(b, i) : audit.length;
  return audit.slice(i, j);
};
const firstCol = (t) =>
  new Set([...t.matchAll(/^\| `(webgl_[a-z0-9_]+)`/gm)].map((m) => m[1]).filter((n) => ALL.has(n)));

const classB = firstCol(section('## Class B', '## Class C'));
const classC = firstCol(section('## Class C'));
const twins = new Set(all.filter((n) => n.startsWith('webgl_') && ALL.has('webgpu_' + n.slice(6))));
const p1ex = collect(b1, /excluded/, paren('excluded'));
const p1def = collect(b1, /deferred/, paren('deferred'));
const p2skip = collect(b2, /\*\*SKIP\*\*/, afterSkip);
const p2rev = collect(b2, /\*\*REVIEW\*\*|review-queued|REVIEW-QUEUE/);
const folded = collect(b2, /ported inside/);
const xr = new Set(all.filter((n) => /^webxr_|^webaudio_/.test(n)));

const notWorth = new Map();
// `why` is a label, or a function of the name when the backlog recorded a per-item reason.
const put = (set, why, guard = () => true) => {
  for (const n of set.keys())
    if (guard(n) && !notWorth.has(n)) notWorth.set(n, typeof why === 'function' ? why(n) : why);
};
const withReason = (label, map) => (n) => (map.get(n) ? `${label}: ${map.get(n)}` : label);
put(p1ex, withReason('excluded (Phase 1 backlog)', p1ex));
const notShipped = (n) => !shipped.has(n) && !folded.has(n);
put(twins, 'duplicate — its webgpu_ twin is ported', notShipped);
put(classB, 'duplicate — same technique under a webgpu_ name (audit B)', notShipped);
put(classC, 'low value — legacy API / stress / trivial toggle (audit C)', notShipped);
put(p2skip, withReason('skipped (Phase 2 backlog)', p2skip), notShipped);

const worth = all.filter((n) => !notWorth.has(n));
const rows = worth.map((n) => {
  if (shipped.has(n)) return { n, status: 'HAVE', why: '`' + shipped.get(n) + '`' };
  if (folded.has(n)) return { n, status: 'HAVE (folded)', why: 'inside a combined example' };
  if (p2rev.has(n)) return { n, status: 'BLOCKED', why: 'review-queued — REVIEW-QUEUE.md' };
  if (p1def.has(n)) return { n, status: 'LATER', why: 'final phase — ' + p1def.get(n) };
  if (xr.has(n)) return { n, status: 'LATER', why: 'final phase — WebXR / webaudio (SPEC §3)' };
  return { n, status: 'GAP', why: 'no decision recorded' };
});
const count = (k) => rows.filter((x) => x.status === k).length;
const md = [
  '# Demo inventory — what is worth porting, and what we have',
  '',
  '> Generated by `pnpm inventory` (`scripts/demo-inventory.mjs`) from `research/data/files_r185.json`',
  '> (every r185 example), `research/webgl-unique-list.md` (the dedup audit), both porting backlogs',
  '> and `src/examples.json`. Do not edit by hand — change a backlog decision and regenerate.',
  '> Answers one question: **of the demos worth porting, how many do we have, and why not all?**',
  '',
  `r185 ships **${all.length}** examples. **${notWorth.size} are not worth a page** — duplicated by a \`webgpu_\` example, low-value, internal/sandbox, or skipped with a recorded reason (all listed at the bottom, with the reason). **${worth.length} are worth porting.**`,
  '',
  '| status | count |',
  '| --- | ---: |',
  `| HAVE — own page | ${count('HAVE')} |`,
  `| HAVE — folded into a combined example | ${count('HAVE (folded)')} |`,
  `| BLOCKED — review-queued, needs a decision | ${count('BLOCKED')} |`,
  `| LATER — final phase (WebXR / webaudio) | ${count('LATER')} |`,
  `| GAP — no decision recorded | ${count('GAP')} |`,
  `| **worth porting** | **${worth.length}** |`,
  '',
  '## The list',
  '',
  '| original | status | slug / reason |',
  '| --- | --- | --- |',
];
for (const x of rows.sort((a, b) => a.status.localeCompare(b.status) || a.n.localeCompare(b.n)))
  md.push(`| \`${x.n}\` | ${x.status} | ${x.why} |`);
md.push(
  '',
  `## Not worth a page — the other ${notWorth.size}`,
  '',
  'Reasons are quoted from the backlog item that made the call — edit them there, not here.',
  '',
  '| original | why |',
  '| --- | --- |',
);
for (const [n, w] of [...notWorth].sort()) md.push(`| \`${n}\` | ${w} |`);
const out = at('../docs/DEMO-INVENTORY.md');
writeFileSync(out, md.join('\n') + '\n');
execFileSync(at('../node_modules/.bin/prettier'), ['--write', out], { stdio: 'ignore' });
console.log(`r185 ${all.length} | not worth ${notWorth.size} | WORTH ${worth.length}`);
console.log(
  `HAVE ${count('HAVE')} + folded ${count('HAVE (folded)')} = ${count('HAVE') + count('HAVE (folded)')} | BLOCKED ${count('BLOCKED')} | LATER ${count('LATER')} | GAP ${count('GAP')}`,
);
const gap = rows.filter((x) => x.status === 'GAP').map((x) => x.n);
if (gap.length) {
  console.log('GAP:', gap.join(', '));
  process.exitCode = 1;
}

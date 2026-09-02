// Compare a port's CODE lines against its three.js original's CODE lines.
//
// Why this exists: raw `wc -l` is not a fair comparison. Our ports carry a header block
// and explanatory inline comments (deliberately — they teach); the three.js originals
// carry almost none but do carry HTML/importmap boilerplate. Counting raw lines flatters
// the original and makes a good port look 2x bloated.
//
// So: strip comments and blank lines from BOTH sides and compare what's left.
//   ours     — every .tsx/.ts file belonging to the example (entry + siblings)
//   original — the whole .html (head, importmap and GUI code are all authored work),
//              minus HTML comments, JS comments and blank lines.
//
// Two numbers, because ONE of them lies on TSL-dense examples. Prettier wraps at 120 cols
// and the originals are 4-space-tab HTML with long lines, so a deeply-nested node graph
// costs us several lines where the original spent one. `compute-rasterizer-ibl` reads
// +40.6% by line and +8.5% by content — the line figure is measuring our formatter, not
// our verbosity. So we also print CHARS: non-whitespace characters, which no line-wrapping
// policy can move. When the two disagree sharply, believe CHARS and say so.
//
// Caveat: comment stripping is lexical, not a parser. A `//` inside a string literal or a
// regex can be miscounted. It is a metric, not a proof — good to ±a couple of lines.
//
// Usage: node scripts/compare-lines.mjs <slug> [slug...]
//        node scripts/compare-lines.mjs --all        every example with an `original` URL

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import examples from '../src/examples.json' with { type: 'json' };

const EXAMPLES_DIR = fileURLToPath(new URL('../src/examples', import.meta.url));

/**
 * Count lines that are neither blank nor comment-only.
 *
 * Line-oriented on purpose: a regex that deletes `/* … *\/` spans also deletes their
 * newlines, and a stray `*\/` inside a string swallows real code (that bug undercounted
 * an 55-line file as 21). Walking lines and tracking block state cannot run away.
 *
 * A line with code AND a trailing comment counts as code, which is what we want.
 */
function codeLines(source, { html = false } = {}) {
  let inBlock = false;
  let inHtmlComment = false;
  const kept = [];

  for (const raw of source.split('\n')) {
    const line = raw.trim();
    if (!line) continue;

    if (html && inHtmlComment) {
      if (line.includes('-->')) inHtmlComment = false;
      continue;
    }
    if (inBlock) {
      if (line.includes('*/')) inBlock = false;
      continue;
    }
    if (html && line.startsWith('<!--') && !line.includes('-->')) {
      inHtmlComment = true;
      continue;
    }
    if (line.startsWith('//')) continue;
    if (line.startsWith('/*') || line.startsWith('{/*')) {
      // Opens a block comment; skip unless it also closes on this line with code after.
      if (!line.includes('*/')) inBlock = true;
      continue;
    }
    kept.push(line);
  }
  return { lines: kept.length, chars: kept.reduce((n, l) => n + l.replace(/\s+/g, '').length, 0) };
}

/**
 * Every source file belonging to an example: the entry plus any siblings in its folder.
 *
 * Depth is what disambiguates, because a slug MAY equal its category (`camera`,
 * `postprocessing` — AGENTS.md § Files, routes, manifest):
 *   src/examples/<cat>/<slug>.tsx          depth 2 -> one file, no siblings
 *   src/examples/<cat>/<slug>/<slug>.tsx   depth 3 -> that folder is the example
 * Matching on folder NAME alone would make `postprocessing.tsx` claim all 17 examples in
 * the postprocessing category.
 */
function filesFor(slug) {
  const rel = (full) => full.slice(EXAMPLES_DIR.length + 1).split('/');

  // Find the entry file: basename === slug, at depth 2 or 3.
  let entry = null;
  const findEntry = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        findEntry(full);
        continue;
      }
      if (name !== `${slug}.tsx`) continue;
      const parts = rel(full);
      if (parts.length === 2 || (parts.length === 3 && parts[1] === slug)) entry = full;
    }
  };
  findEntry(EXAMPLES_DIR);
  if (!entry) return [];

  const parts = rel(entry);
  if (parts.length === 2) return [entry]; // single-file example

  // Folder example: every source file in its own directory.
  const dir = join(EXAMPLES_DIR, parts[0], parts[1]);
  const hits = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(name)) hits.push(full);
    }
  };
  walk(dir);
  return hits;
}

/** three.js original name from the manifest's `original` URL (…#webgpu_foo_bar). */
function originalName(meta) {
  const hash = meta.original?.split('#')[1];
  return hash || null;
}

async function main() {
  const args = process.argv.slice(2);
  const wanted = args.includes('--all')
    ? examples.filter((e) => e.original).map((e) => e.slug)
    : args.filter((a) => !a.startsWith('-'));

  if (!wanted.length) {
    console.error('usage: node scripts/compare-lines.mjs <slug> [slug...] | --all');
    process.exit(1);
  }

  const rows = [];
  for (const slug of wanted) {
    const meta = examples.find((e) => e.slug === slug);
    if (!meta) {
      console.error(`unknown slug: ${slug}`);
      continue;
    }
    const name = originalName(meta);
    if (!name) {
      console.error(`${slug}: no \`original\` URL in the manifest`);
      continue;
    }

    const files = filesFor(slug);
    const ours = files.reduce(
      (acc, f) => {
        const c = codeLines(readFileSync(f, 'utf8'));
        return { lines: acc.lines + c.lines, chars: acc.chars + c.chars };
      },
      { lines: 0, chars: 0 },
    );

    const url = `https://raw.githubusercontent.com/mrdoob/three.js/r185/examples/${name}.html`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`${slug}: original 404 at ${url}`);
      continue;
    }
    const theirs = codeLines(await res.text(), { html: true });

    rows.push({ slug, files: files.length, ours, theirs });
  }

  const pad = (s, n) => String(s).padEnd(n);
  const lpad = (s, n) => String(s).padStart(n);
  const pct = (a, b) => `${a > b ? '+' : ''}${(((a - b) / b) * 100).toFixed(1)}%`;

  const head = `${pad('slug', 30)}${lpad('files', 6)}${lpad('lines', 7)}${lpad('orig', 7)}${lpad('Δ', 8)}${lpad('chars', 8)}${lpad('orig', 8)}${lpad('Δ', 8)}`;
  console.log(head);
  console.log('-'.repeat(head.length));
  for (const r of rows) {
    console.log(
      `${pad(r.slug, 30)}${lpad(r.files, 6)}${lpad(r.ours.lines, 7)}${lpad(r.theirs.lines, 7)}` +
        `${lpad(pct(r.ours.lines, r.theirs.lines), 8)}${lpad(r.ours.chars, 8)}${lpad(r.theirs.chars, 8)}` +
        `${lpad(pct(r.ours.chars, r.theirs.chars), 8)}`,
    );
  }
  if (rows.length > 1) {
    const sum = (k, side) => rows.reduce((n, r) => n + r[side][k], 0);
    console.log('-'.repeat(head.length));
    console.log(
      `${pad('TOTAL', 36)}${lpad(sum('lines', 'ours'), 7)}${lpad(sum('lines', 'theirs'), 7)}` +
        `${lpad(pct(sum('lines', 'ours'), sum('lines', 'theirs')), 8)}${lpad(sum('chars', 'ours'), 8)}` +
        `${lpad(sum('chars', 'theirs'), 8)}${lpad(pct(sum('chars', 'ours'), sum('chars', 'theirs')), 8)}`,
    );
  }
}

main();

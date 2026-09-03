// Screenshot capture + contact sheet (ROADMAP M1). Review oracle is a person
// (SPEC §10); this produces the artifact they review.
//
// Usage (dev server must be running on :5173):
//   pnpm shot <slug> [slug...]   capture just those examples
//   SHOT_DELAY_MS=5000 pnpm shot <slug>   wait longer after readiness before capturing,
//                                for demos whose visual only develops after some seconds
//                                (a once-per-second state machine, a slow accumulation)
//   pnpm shot --changed          capture examples touched vs origin/main
//   pnpm contact-sheet           capture everything (wave-end sweep)
//
// PORTING AGENTS: use this. Do not write a throwaway screenshot script — three
// agents hung 10 minutes each on open-ended waits doing exactly that (HANDOFF
// wave 13). Every capture here is hard-bounded and the browser always closes.
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import examples from '../src/examples.json' with { type: 'json' };
import { selectSlugs } from './slugs.mjs';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const OUT = new URL('../screenshots/', import.meta.url);
// Hard ceiling per example. Nothing here may wait indefinitely.
const READY_TIMEOUT_MS = Number(process.env.SHOT_TIMEOUT_MS ?? 60_000);
// Readiness fires at animation t≈0. 800ms is enough for most scenes to leave their rest
// pose, but a demo that only develops its picture over seconds needs longer — raise it
// per-run rather than slowing the whole sweep down.
const SETTLE_MS = Number(process.env.SHOT_DELAY_MS ?? 800);

const selected = selectSlugs();
const bySlug = new Map(examples.map((e) => [e.slug, e]));

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  channel: 'chromium',
  headless: process.platform !== 'linux', // Linux: headed under xvfb-run (see ci.yml)
  args: ['--enable-unsafe-webgpu'],
});

const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(READY_TIMEOUT_MS);

  for (const slug of selected) {
    process.stdout.write(`${slug} … `);
    try {
      await page.goto(`${BASE}/examples/${slug}`);
      // leva persists control values in localStorage across browser launches —
      // without this a capture can show a PREVIOUS run's slider drags instead of
      // the example's coded defaults (AGENTS.md §Verification).
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      // startClick (AGENTS.md § Verification, startClick): click-to-start overlay gates scene
      // start behind a user gesture (AudioContext) — click it before waiting on
      // readiness, same as the two test tiers.
      const startClick = bySlug.get(slug)?.startClick;
      if (startClick) await page.click(startClick);
      await page.waitForFunction(() => window.__exampleReady === true, undefined, {
        timeout: READY_TIMEOUT_MS,
      });
      // Readiness fires at animation t≈0; let motion get past the rest pose so
      // animated scenes don't contact-sheet as static A-poses.
      await page.waitForTimeout(SETTLE_MS);
      // Hide control-surface chrome — we're reviewing the scene, not the panel
      // (leva overlays center-frame subjects at small viewports).
      await page.addStyleTag({
        content: '[class^="leva"], [class*=" leva"] { display: none !important; }',
      });
      await page
        .locator('canvas')
        .first()
        .screenshot({ path: fileURLToPath(new URL(`${slug}.png`, OUT)) });
      results.push({ slug, ok: true });
      console.log('ok');
    } catch (error) {
      results.push({ slug, ok: false, error: String(error).slice(0, 200) });
      console.log(`FAILED: ${String(error).slice(0, 120)}`);
    }
  }
} finally {
  // Always closes, even on an unexpected throw — a leaked browser is what turns
  // a failed capture into a hung agent.
  await browser.close();
}

// Rebuild the sheet from every PNG on disk, not just this run's slugs, so a
// scoped `pnpm shot <slug>` refreshes one tile without discarding the rest.
const captured = new Set((await readdir(OUT)).filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4)));
const failedNow = new Map(results.filter((r) => !r.ok).map((r) => [r.slug, r.error]));

const cells = examples
  .filter(({ slug }) => captured.has(slug) || failedNow.has(slug))
  .map(({ slug, title }) =>
    failedNow.has(slug)
      ? `<figure class="fail"><div class="err">${failedNow.get(slug)}</div><figcaption>${title}<br><code>${slug}</code></figcaption></figure>`
      : `<figure><a href="${BASE}/examples/${slug}"><img src="${slug}.png" loading="lazy" alt="${title}"></a><figcaption>${title}<br><code>${slug}</code></figcaption></figure>`,
  )
  .join('\n');

const okCount = results.filter((r) => r.ok).length;

await writeFile(
  new URL('index.html', OUT),
  `<!doctype html><meta charset="utf-8"><title>r3f-examples contact sheet</title>
<style>
  body{background:#0a0a0a;color:#e5e5e5;font:14px system-ui;margin:2rem}
  main{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:1rem}
  figure{margin:0;border:1px solid #262626;border-radius:8px;overflow:hidden}
  img{width:100%;display:block;aspect-ratio:16/10;object-fit:cover}
  figcaption{padding:.5rem .75rem;color:#a3a3a3}
  code{color:#737373}
  .fail{border-color:#7f1d1d}.err{padding:1rem;color:#fca5a5;font-family:monospace;font-size:12px}
</style>
<h1>Contact sheet — ${captured.size} captured (last run: ${okCount}/${selected.length})</h1>
<main>${cells}</main>`,
);

console.log(`\nContact sheet: screenshots/index.html (this run ${okCount}/${selected.length})`);
if (results.some((r) => !r.ok)) process.exitCode = 1;

// Gallery thumbnails (ROADMAP R4). Reuses contact-sheet.mjs's launch recipe EXACTLY —
// same Chromium channel + WebGPU flag, leva hidden, localStorage cleared, startClick
// honored, SHOT_DELAY_MS settle, hard per-example timeout, browser always closes — see
// AGENTS.md § Verification and scripts/contact-sheet.mjs's own header for why none of
// this is safe to hand-roll.
//
// Usage (dev server must be running on :5173):
//   pnpm thumbs                  every example missing a thumb (public/thumbs/<slug>.jpg)
//   pnpm thumbs <slug> [slug...] just those (regenerates even if present)
//   pnpm thumbs --force          regenerate every example's thumb
//   pnpm thumbs --check-black    re-check every EXISTING thumb for a black/near-black
//                                frame (HMR racing a concurrent example edit can produce
//                                one) and re-shoot only those
//
// Target: a 480x300 JPEG (quality ~70) at deviceScaleFactor 0.5 — small enough to
// commit ~250 of, per-example, without approaching the repo's asset-hotlinking stance
// (these are generated, not vendored binaries). The screenshot is of the CANVAS only
// (`locator('canvas').first()`, same as contact-sheet.mjs), and the canvas does not
// span the full viewport: Layout.tsx's sidebar (`w-64` = 256px, every route) eats a
// fixed slice of width. So the viewport is 960+256 wide, not 960 — the canvas ends up
// exactly 960 CSS px wide (600 tall), which the 0.5 scale factor then halves to 480x300.
import { mkdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import examples from '../src/examples.json' with { type: 'json' };
import { selectSlugs, allSlugs } from './slugs.mjs';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const OUT = new URL('../public/thumbs/', import.meta.url);
const READY_TIMEOUT_MS = Number(process.env.SHOT_TIMEOUT_MS ?? 60_000);
const SETTLE_MS = Number(process.env.SHOT_DELAY_MS ?? 800);
// Near-black mean brightness (0-255 luma) threshold — a real scene has SOME variance
// even on a dark background; a genuinely blank/failed frame reads under this.
const BLACK_THRESHOLD = Number(process.env.THUMB_BLACK_THRESHOLD ?? 6);
// Layout.tsx's sidebar is a fixed 256px (`w-64`) on every route — add it to the
// viewport so the canvas itself (what we actually screenshot) comes out 960 CSS px wide.
const SIDEBAR_WIDTH = 256;

const argv = process.argv.slice(2);
const FORCE = argv.includes('--force');
const CHECK_BLACK = argv.includes('--check-black');
const slugArgs = argv.filter((a) => !a.startsWith('-'));

const bySlug = new Map(examples.map((e) => [e.slug, e]));

await mkdir(OUT, { recursive: true });

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function outPathFor(slug) {
  return fileURLToPath(new URL(`${slug}.jpg`, OUT));
}

const browser = await chromium.launch({
  channel: 'chromium',
  headless: process.platform !== 'linux', // Linux: headed under xvfb-run (see ci.yml)
  args: ['--enable-unsafe-webgpu'],
});

/** Capture one example's thumbnail. Throws on failure — caller decides how to report it. */
async function capture(page, slug) {
  await page.goto(`${BASE}/examples/${slug}`);
  // leva persists control values in localStorage across launches (AGENTS.md
  // § Verification) — clear before reload so we shoot coded defaults.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const startClick = bySlug.get(slug)?.startClick;
  if (startClick) await page.click(startClick);
  await page.waitForFunction(() => window.__exampleReady === true, undefined, { timeout: READY_TIMEOUT_MS });
  await page.waitForTimeout(SETTLE_MS);
  // Hide leva (see AGENTS.md § Verification) AND the shell's own overlays (Titleblock,
  // the Code toggle — `data-chrome-overlay`, see ExamplePage.tsx) so the thumbnail is
  // just the demo, not the site chrome sitting on top of it.
  await page.addStyleTag({
    content: '[class^="leva"], [class*=" leva"], [data-chrome-overlay] { display: none !important; }',
  });
  await page
    .locator('canvas')
    .first()
    .screenshot({ path: outPathFor(slug), type: 'jpeg', quality: 70 });
}

/** Mean luma (0-255) of an on-disk image, via a real <img>+<canvas> decode — no image
 * library dependency, same Chromium instance already open for capture. */
async function meanBrightness(page, path) {
  await page.goto(`file://${path}`);
  return page.evaluate(async () => {
    const img =
      document.querySelector('img') ??
      (await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = location.href;
      }));
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
    return sum / (data.length / 4);
  });
}

const results = [];
const blackSlugs = [];
try {
  const page = await browser.newPage({
    viewport: { width: 960 + SIDEBAR_WIDTH, height: 600 },
    deviceScaleFactor: 0.5,
  });
  page.setDefaultTimeout(READY_TIMEOUT_MS);

  if (CHECK_BLACK) {
    // Re-check every thumb that exists on disk (or the requested slugs, if given).
    const candidates = (slugArgs.length ? slugArgs : allSlugs).filter((slug) => bySlug.has(slug));
    for (const slug of candidates) {
      const path = outPathFor(slug);
      if (!(await exists(path))) continue;
      const brightness = await meanBrightness(page, path);
      if (brightness < BLACK_THRESHOLD) {
        console.log(`${slug}: near-black (mean ${brightness.toFixed(1)}) — re-shooting`);
        try {
          await capture(page, slug);
          const rechecked = await meanBrightness(page, path);
          if (rechecked < BLACK_THRESHOLD) {
            blackSlugs.push(slug);
            console.log(`${slug}: STILL near-black after re-shoot (mean ${rechecked.toFixed(1)})`);
          } else {
            console.log(`${slug}: fixed (mean ${rechecked.toFixed(1)})`);
          }
        } catch (error) {
          blackSlugs.push(slug);
          console.log(`${slug}: re-shoot FAILED: ${String(error).slice(0, 150)}`);
        }
      }
    }
  } else {
    const selected = selectSlugs(slugArgs.length ? slugArgs : undefined);
    for (const slug of selected) {
      const path = outPathFor(slug);
      if (!FORCE && (await exists(path))) {
        console.log(`${slug} … skipped (exists)`);
        continue;
      }
      process.stdout.write(`${slug} … `);
      try {
        await capture(page, slug);
        results.push({ slug, ok: true });
        console.log('ok');
      } catch (error) {
        results.push({ slug, ok: false, error: String(error).slice(0, 200) });
        console.log(`FAILED: ${String(error).slice(0, 120)}`);
      }
    }
  }
} finally {
  // Always closes, even on an unexpected throw (AGENTS.md § Verification).
  await browser.close();
}

if (CHECK_BLACK) {
  if (blackSlugs.length > 0) {
    console.log(`\n${blackSlugs.length} thumb(s) still black after re-shoot: ${blackSlugs.join(', ')}`);
    process.exitCode = 1;
  } else {
    console.log('\nNo near-black thumbs remain.');
  }
} else {
  const okCount = results.filter((r) => r.ok).length;
  console.log(`\nThumbs: ${okCount}/${results.length} captured this run (public/thumbs/).`);
  if (results.some((r) => !r.ok)) process.exitCode = 1;
}

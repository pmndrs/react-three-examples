// Capture a LIVE three.js original as the review oracle.
//
// AGENTS.md § Verification says to compare a port against the LIVE original rather than
// the (stale) gallery thumbnail — this is the tool for that half. `pnpm shot` cannot do
// it: that one waits on our own `window.__exampleReady` signal, which upstream pages
// don't have. So this waits a fixed settle time instead.
//
// Usage:
//   pnpm shot:original <slug-or-url> [outfile] [settleMs]
//     pnpm shot:original webgpu_compute_reduce
//     pnpm shot:original webgpu_compute_reduce /tmp/x.png 7000
//
// A bare three.js example name resolves to https://threejs.org/examples/<name>.html.
// Default output is `screenshots/originals/<name>.png` (gitignored alongside screenshots).
//
// Hard-bounded like every capture here: fixed timeouts, browser always closes.
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const [target, outArg, settleArg] = process.argv.slice(2);
if (!target) {
  console.error('usage: pnpm shot:original <three.js example name | url> [outfile] [settleMs]');
  process.exit(1);
}

const isUrl = /^https?:\/\//.test(target);
const url = isUrl ? target : `https://threejs.org/examples/${target}.html`;
const name = isUrl
  ? new URL(url).pathname
      .split('/')
      .pop()
      .replace(/\.html$/, '')
  : target;
const out = outArg || new URL(`../screenshots/originals/${name}.png`, import.meta.url).pathname;
const settleMs = Number(settleArg || 6000);

await mkdir(new URL('../screenshots/originals/', import.meta.url), { recursive: true });

// Headed + the WebGPU flag: plain `chromium.launch()` has no WebGPU on macOS and the page
// silently renders nothing (same trap `pnpm shot` documents).
const browser = await chromium.launch({
  channel: 'chromium',
  headless: process.platform === 'linux',
  args: ['--enable-unsafe-webgpu'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(45_000);
  await page.goto(url, { waitUntil: 'load', timeout: 45_000 });
  await page.waitForTimeout(settleMs);
  await page.screenshot({ path: out });
  console.log(`ok -> ${out}`);
} finally {
  await browser.close();
}

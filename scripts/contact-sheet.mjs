// Contact-sheet generator (ROADMAP M1): captures every manifest example and
// assembles screenshots/index.html for batch visual review. Review oracle is a
// person (SPEC §10) — this is the artifact they review.
// Usage: pnpm contact-sheet   (dev server must be running on :5173)
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import examples from '../src/examples.json' with { type: 'json' }

const BASE = process.env.BASE_URL ?? 'http://localhost:5173'
const OUT = new URL('../screenshots/', import.meta.url)

await mkdir(OUT, { recursive: true })

const browser = await chromium.launch({
  channel: 'chromium',
  headless: process.platform !== 'linux', // Linux: headed under xvfb-run (see ci.yml)
  args: ['--enable-unsafe-webgpu'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

const rows = []
for (const { slug, title } of examples) {
  process.stdout.write(`${slug} … `)
  try {
    await page.goto(`${BASE}/examples/${slug}`)
    await page.waitForFunction(() => window.__exampleReady === true, undefined, {
      timeout: 60_000,
    })
    // Readiness fires at animation t≈0; let motion get past the rest pose so
    // animated scenes don't contact-sheet as static A-poses.
    await page.waitForTimeout(800)
    // Hide control-surface chrome — we're reviewing the scene, not the panel
    // (leva overlays center-frame subjects at small viewports).
    await page.addStyleTag({ content: '[class^="leva"], [class*=" leva"] { display: none !important; }' })
    await page.locator('canvas').first().screenshot({ path: fileURLToPath(new URL(`${slug}.png`, OUT)) })
    rows.push({ slug, title, ok: true })
    console.log('ok')
  } catch (error) {
    rows.push({ slug, title, ok: false, error: String(error).slice(0, 200) })
    console.log(`FAILED: ${String(error).slice(0, 120)}`)
  }
}
await browser.close()

const cells = rows
  .map(({ slug, title, ok, error }) =>
    ok
      ? `<figure><a href="${BASE}/examples/${slug}"><img src="${slug}.png" loading="lazy" alt="${title}"></a><figcaption>${title}<br><code>${slug}</code></figcaption></figure>`
      : `<figure class="fail"><div class="err">${error}</div><figcaption>${title}<br><code>${slug}</code></figcaption></figure>`,
  )
  .join('\n')

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
<h1>Contact sheet — ${rows.filter((r) => r.ok).length}/${rows.length} captured</h1>
<main>${cells}</main>`,
)

console.log(`\nContact sheet: screenshots/index.html (${rows.filter((r) => r.ok).length}/${rows.length})`)
if (rows.some((r) => !r.ok)) process.exitCode = 1
